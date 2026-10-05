import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Headline } from "@/components/headline";
import { PublicHeader } from "@/components/site-header";
import { StatePage } from "@/components/state-page";
import { Eyebrow } from "@/components/ui";
import { hasAccess } from "@/lib/access";
import { timeUntil } from "@/lib/format";
import { getFiles, getTransfer, isExpired } from "@/lib/transfers";

import { DownloadView } from "./download-view";
import { PasswordGate } from "./password-gate";

// Deliberately generic: link previews should not reveal what a transfer holds.
export const metadata: Metadata = { title: "Files for you" };

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const transfer = await getTransfer(id);
  if (!transfer || transfer.status === "pending") notFound();

  const expiresIn = timeUntil(transfer.expires_at);
  if (isExpired(transfer) || !expiresIn) {
    return (
      <StatePage label="Transfer" detail="No longer available" title="Expired.">
        <p>
          This transfer has passed its expiry date and its files have been deleted. Ask the sender for a new
          link.
        </p>
      </StatePage>
    );
  }

  // Nothing about the contents is rendered until the password is accepted.
  if (transfer.password_hash && !(await hasAccess(id))) {
    return (
      <div className="flex min-h-dvh flex-col">
        <PublicHeader aside={`Expires in ${expiresIn}`} />
        <main className="gutter flex flex-1 flex-col justify-between pt-5 pb-8 md:pt-6">
          <Eyebrow left="Sent to you" right="Password required" />
          <Headline className="text-display py-12" lines={["Locked."]} />
          <PasswordGate id={id} />
        </main>
      </div>
    );
  }

  const files = await getFiles(id);

  return (
    <DownloadView
      id={id}
      files={files.map(({ id, name, size }) => ({ id, name, size }))}
      totalBytes={transfer.total_bytes}
      message={transfer.message}
      expiresIn={expiresIn}
    />
  );
}
