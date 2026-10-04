import type { Metadata } from "next";
import Link from "next/link";

import { UploaderHeader } from "@/components/site-header";
import { StatePage } from "@/components/state-page";
import { buttonClass, cn, Eyebrow } from "@/components/ui";
import { requireUploader } from "@/lib/auth";
import { env } from "@/lib/env";
import { basename, formatBytes, formatDate, pluralize, rowNumber, timeUntil } from "@/lib/format";
import { stagger } from "@/lib/motion";
import { getFirstFileNames, isExpired, listTransfers } from "@/lib/transfers";

import { TransferActions } from "./transfer-actions";

export const metadata: Metadata = { title: "Transfers" };

const SUBGRID = "col-span-full grid grid-cols-subgrid";

/** Column spans, shared by the header row and every data row. */
const COLUMNS = {
  index: "col-span-1",
  name: "col-span-11 md:col-span-4",
  size: "col-span-5 col-start-2 md:col-span-2 md:col-start-auto",
  expires: "col-span-6 md:col-span-2",
  downloads: "col-span-5 col-start-2 md:col-span-1 md:col-start-auto",
  actions: "col-span-6 md:col-span-2",
};

/** Field name shown above a value on small screens, where the header row is hidden. */
function MobileLabel({ children }: { children: string }) {
  return <span className="label muted block md:hidden">{children}</span>;
}

export default async function TransfersPage() {
  const uploader = await requireUploader();
  const transfers = await listTransfers(uploader.id);

  if (transfers.length === 0) {
    return (
      <StatePage
        header={<UploaderHeader current="transfers" />}
        label="Transfers"
        detail="0 sent"
        title="Nothing sent yet."
        action={
          <Link href="/" className={buttonClass("primary")}>
            <span>Send files</span>
          </Link>
        }
      >
        <p>Transfers you send appear here, with their size, expiry and download count.</p>
      </StatePage>
    );
  }

  const names = await getFirstFileNames(transfers.map((transfer) => transfer.id));
  const live = transfers.filter((transfer) => !isExpired(transfer)).length;

  return (
    <div className="flex min-h-dvh flex-col">
      <UploaderHeader current="transfers" />
      <main className="gutter flex flex-1 flex-col pt-5 pb-14 md:pt-6">
        <Eyebrow left="Sent by you" right={`${live} live, ${transfers.length - live} expired`} />
        <h1 className="text-display reveal py-10 md:py-12">Transfers</h1>

        <div role="table" aria-label="Your transfers" className="grid-12">
          <div role="rowgroup" className={SUBGRID}>
            <div role="row" className={cn(SUBGRID, "label rule-b items-baseline pb-2 max-md:sr-only")}>
              <span role="columnheader" className={cn(COLUMNS.index, "muted")}>
                No.
              </span>
              <span role="columnheader" className={cn(COLUMNS.name, "muted")}>
                Transfer
              </span>
              <span role="columnheader" className={cn(COLUMNS.size, "muted")}>
                Size
              </span>
              <span role="columnheader" className={cn(COLUMNS.expires, "muted")}>
                Expires
              </span>
              <span role="columnheader" className={cn(COLUMNS.downloads, "muted")}>
                Downloads
              </span>
              <span role="columnheader" className={cn(COLUMNS.actions, "muted text-right")}>
                Actions
              </span>
            </div>
          </div>

          <div role="rowgroup" className={cn(SUBGRID, "max-md:rule-t")}>
            {transfers.map((transfer, index) => {
              const expired = isExpired(transfer);
              const first = basename(names.get(transfer.id) ?? "Untitled");
              const more = transfer.file_count - 1;
              const left = timeUntil(transfer.expires_at);

              return (
                <div
                  key={transfer.id}
                  role="row"
                  className={cn(SUBGRID, "rule-b reveal items-baseline gap-y-3 py-4")}
                  style={stagger(index + 1)}
                >
                  <span role="cell" className={cn(COLUMNS.index, "label tabular muted")}>
                    {rowNumber(index)}
                  </span>

                  <div role="cell" className={cn(COLUMNS.name, "min-w-0", expired && "muted")}>
                    <p className="truncate font-bold" title={first}>
                      {first}
                      {more > 0 ? <span className="font-normal"> +{more}</span> : null}
                    </p>
                    <p className="label muted truncate pt-1">
                      {transfer.recipient_email ?? "Link only"}
                      {transfer.password_hash ? ", password" : ""}
                    </p>
                  </div>

                  <div role="cell" className={cn(COLUMNS.size, "tabular", expired && "muted")}>
                    <MobileLabel>Size</MobileLabel>
                    {formatBytes(transfer.total_bytes)}
                    <span className="muted max-md:hidden">, {pluralize(transfer.file_count, "file")}</span>
                  </div>

                  <div role="cell" className={cn(COLUMNS.expires, "tabular")}>
                    <MobileLabel>Expires</MobileLabel>
                    {expired || !left ? (
                      <span className="muted">Expired</span>
                    ) : (
                      <time dateTime={transfer.expires_at} title={formatDate(transfer.expires_at)}>
                        In {left}
                      </time>
                    )}
                  </div>

                  <div role="cell" className={cn(COLUMNS.downloads, "tabular", expired && "muted")}>
                    <MobileLabel>Downloads</MobileLabel>
                    {transfer.download_count}
                  </div>

                  <div role="cell" className={cn(COLUMNS.actions, "self-end text-right md:self-auto")}>
                    <TransferActions
                      id={transfer.id}
                      url={`${env.appUrl}/t/${transfer.id}`}
                      live={!expired}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
