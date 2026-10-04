import "server-only";

import { Resend } from "resend";

import { env } from "@/lib/env";
import { formatBytes, formatDate, pluralize } from "@/lib/format";
import type { TransferRow } from "@/lib/types";

const INK = "#0A0A0A";
const PAPER = "#F4F4F1";
const ACCENT = "#FF3B00";
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

let client: Resend | undefined;

function resend(): Resend {
  client ??= new Resend(env.resendApiKey);
  return client;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function transferUrl(id: string): string {
  return `${env.appUrl}/t/${id}`;
}

function summary(transfer: Pick<TransferRow, "file_count" | "total_bytes">): string {
  return `${pluralize(transfer.file_count, "file")}, ${formatBytes(transfer.total_bytes)}`;
}

interface Layout {
  label: string;
  headline: string;
  body: string[];
  quote?: string | null;
  action: { label: string; url: string };
  footnote: string;
}

/** One table-based layout shared by both emails, matching the site. */
function render({ label, headline, body, quote, action, footnote }: Layout): string {
  const labelStyle = `font:400 11px/1.4 ${FONT};letter-spacing:0.08em;text-transform:uppercase;color:${INK};`;
  const rule = `<tr><td style="border-top:1px solid ${INK};font-size:0;line-height:0;" height="1">&nbsp;</td></tr>`;

  const paragraphs = body
    .map((line) => `<p style="margin:0 0 12px;font:400 16px/1.5 ${FONT};color:${INK};">${line}</p>`)
    .join("");

  const quoteBlock = quote
    ? `<tr><td style="padding:24px 0;">
         <p style="margin:0 0 8px;${labelStyle}">Message</p>
         <p style="margin:0;font:400 18px/1.45 ${FONT};color:${INK};white-space:pre-wrap;">${escapeHtml(quote)}</p>
       </td></tr>${rule}`
    : "";

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:40px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="padding-bottom:16px;${labelStyle}">${escapeHtml(label)}</td></tr>
  ${rule}
  <tr><td style="padding:32px 0;">
    <h1 style="margin:0;font:700 56px/0.92 ${FONT};letter-spacing:-0.04em;color:${INK};">${headline}</h1>
  </td></tr>
  ${rule}
  ${quoteBlock}
  <tr><td style="padding:24px 0 12px;">${paragraphs}</td></tr>
  <tr><td style="padding-bottom:32px;">
    <a href="${action.url}" style="display:inline-block;background:${ACCENT};color:${INK};font:700 18px/1 ${FONT};letter-spacing:-0.01em;text-decoration:none;padding:18px 28px;">${escapeHtml(action.label)}</a>
  </td></tr>
  ${rule}
  <tr><td style="padding-top:16px;${labelStyle}">${footnote}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

async function send(to: string, subject: string, html: string, text: string): Promise<void> {
  const { error } = await resend().emails.send({ from: env.emailFrom, to, subject, html, text });
  if (error) throw new Error(`Resend: ${error.message}`);
}

type Sendable = Pick<
  TransferRow,
  "id" | "file_count" | "total_bytes" | "message" | "expires_at" | "password_hash" | "recipient_email"
>;

/** Tells the recipient their files are ready. The password is never included. */
export async function sendTransferEmail(transfer: Sendable): Promise<void> {
  if (!transfer.recipient_email) return;

  const url = transferUrl(transfer.id);
  const expires = formatDate(transfer.expires_at);
  const locked = !!transfer.password_hash;
  const body = [`Available until ${expires}.`];
  if (locked) body.push("This transfer is password-protected. The sender will share the password separately.");

  const html = render({
    label: "Transfer",
    headline: `${pluralize(transfer.file_count, "file")}<br>for you.`,
    body,
    quote: transfer.message,
    action: { label: "Download", url },
    footnote: `${formatBytes(transfer.total_bytes)} &middot; Expires ${expires}`,
  });

  const text = [
    `${summary(transfer)} for you.`,
    transfer.message ? `\n${transfer.message}\n` : "",
    `Download: ${url}`,
    `Available until ${expires}.`,
    locked ? "Password-protected. The sender will share the password separately." : "",
  ]
    .filter(Boolean)
    .join("\n");

  await send(transfer.recipient_email, `Files for you: ${summary(transfer)}`, html, text);
}

/** Tells the uploader that a transfer was downloaded for the first time. */
export async function sendFirstDownloadEmail(transfer: Sendable): Promise<void> {
  const dashboard = `${env.appUrl}/transfers`;
  const recipient = transfer.recipient_email
    ? `Sent to ${escapeHtml(transfer.recipient_email)}.`
    : "Shared by link.";

  const html = render({
    label: "Transfer",
    headline: "Downloaded.",
    body: [`Your transfer of ${summary(transfer)} was just downloaded for the first time.`, recipient],
    action: { label: "View transfers", url: dashboard },
    footnote: `ID ${transfer.id} &middot; Expires ${formatDate(transfer.expires_at)}`,
  });

  const text = [
    `Your transfer of ${summary(transfer)} was just downloaded for the first time.`,
    transfer.recipient_email ? `Sent to ${transfer.recipient_email}.` : "Shared by link.",
    `Transfers: ${dashboard}`,
  ].join("\n");

  await send(env.allowedEmail, `Downloaded: ${summary(transfer)}`, html, text);
}
