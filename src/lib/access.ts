import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { ACCESS_COOKIE_TTL_SECONDS, DOWNLOAD_SESSION_TTL_SECONDS } from "@/lib/constants";
import { env } from "@/lib/env";

/**
 * Signed, short-lived, httpOnly cookies scoped to one transfer.
 *
 *  - "access":   set after a correct password; lets the browser see the page
 *                and request download URLs.
 *  - "download": marks a browser that has already been counted, so refreshing
 *                URLs mid-download does not inflate the download count.
 *
 * Token format: `<expiry-unix-seconds>.<hmac-sha256(scope.id.expiry)>`
 */
type Scope = "access" | "download";

const COOKIE_PREFIX: Record<Scope, string> = { access: "ta_", download: "td_" };
const TTL_SECONDS: Record<Scope, number> = {
  access: ACCESS_COOKIE_TTL_SECONDS,
  download: DOWNLOAD_SESSION_TTL_SECONDS,
};

function sign(scope: Scope, transferId: string, expires: number): string {
  return createHmac("sha256", env.cookieSecret)
    .update(`${scope}.${transferId}.${expires}`)
    .digest("base64url");
}

function verify(scope: Scope, transferId: string, token: string | undefined): boolean {
  if (!token) return false;
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!signature || !Number.isInteger(expires) || expires * 1000 <= Date.now()) return false;

  const expected = Buffer.from(sign(scope, transferId, expires));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function has(scope: Scope, transferId: string): Promise<boolean> {
  const store = await cookies();
  return verify(scope, transferId, store.get(COOKIE_PREFIX[scope] + transferId)?.value);
}

/** Only callable where cookies are writable: route handlers and server actions. */
async function grant(scope: Scope, transferId: string): Promise<void> {
  const ttl = TTL_SECONDS[scope];
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const store = await cookies();
  store.set(COOKIE_PREFIX[scope] + transferId, `${expires}.${sign(scope, transferId, expires)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttl,
  });
}

export const hasAccess = (transferId: string) => has("access", transferId);
export const grantAccess = (transferId: string) => grant("access", transferId);
export const hasDownloadSession = (transferId: string) => has("download", transferId);
export const startDownloadSession = (transferId: string) => grant("download", transferId);
