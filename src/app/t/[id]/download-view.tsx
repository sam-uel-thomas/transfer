"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FileRow, FileTable } from "@/components/file-table";
import { PercentFigure, ProgressBar, useSmoothPercent } from "@/components/progress";
import { PublicHeader } from "@/components/site-header";
import { Button, Eyebrow } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatBytes, pluralize } from "@/lib/format";
import { stagger } from "@/lib/motion";
import type { PublicFile, SignedFile } from "@/lib/types";

/** Presigned URLs last 10 minutes; ask for fresh ones a little before that. */
const URL_REFRESH_MS = 8 * 60 * 1000;

/**
 * Without the File System Access API the zip is assembled in memory before
 * it can be saved, so very large bundles are refused there instead of
 * crashing the tab. Phones get a lower ceiling.
 */
const IN_MEMORY_ZIP_LIMIT = { desktop: 1000 ** 3, mobile: 300 * 1000 ** 2 };

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

type Job = { kind: "idle" } | { kind: "preparing" } | { kind: "zipping"; loaded: number } | { kind: "saved" };

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Starts a normal browser download. The URL answers with `attachment`. */
function save(url: string, filename?: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  if (filename) link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

/** Zip entries need distinct paths: "a.txt", "a (2).txt". */
function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) {
      const dot = name.lastIndexOf(".");
      const slash = name.lastIndexOf("/");
      candidate = dot > slash + 1 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export function DownloadView({
  id,
  files,
  totalBytes,
  message,
  expiresIn,
}: {
  id: string;
  files: PublicFile[];
  totalBytes: number;
  message: string | null;
  expiresIn: string;
}) {
  const router = useRouter();
  const [job, setJob] = useState<Job>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const single = files.length === 1;
  const zipping = job.kind === "zipping";
  const percent = zipping && totalBytes > 0 ? Math.min(100, (job.loaded / totalBytes) * 100) : 0;
  const smooth = useSmoothPercent(percent);

  useEffect(() => {
    const current = abort;
    return () => current.current?.abort();
  }, []);

  async function requestUrls(fileId?: string): Promise<SignedFile[]> {
    try {
      const response = await api<{ files: SignedFile[] }>(`/api/t/${id}/download`, fileId ? { fileId } : {});
      return response.files;
    } catch (cause) {
      // Expired, deleted, or the password cookie lapsed: the server-rendered
      // page knows which, so show that instead of a generic error.
      if (cause instanceof ApiError && cause.code) router.refresh();
      throw cause;
    }
  }

  async function downloadFile(file: PublicFile) {
    setError(null);
    setPendingFile(file.id);
    try {
      const [signed] = await requestUrls(file.id);
      save(signed.url);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPendingFile(null);
    }
  }

  async function downloadAll() {
    if (single) return downloadFile(files[0]);

    setError(null);
    const zipName = `transfer-${id}.zip`;
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

    // The save dialog must open while the click is still "fresh", so it comes
    // before any network request. With a handle, the zip streams to disk.
    let handle: FileSystemFileHandle | null = null;
    if (picker) {
      try {
        handle = await picker.call(window, {
          suggestedName: zipName,
          types: [{ description: "Zip archive", accept: { "application/zip": [".zip"] } }],
        });
      } catch (cause) {
        if (isAbort(cause)) return; // Dialog dismissed.
      }
    }

    if (!handle) {
      const limit = window.matchMedia("(pointer: coarse)").matches
        ? IN_MEMORY_ZIP_LIMIT.mobile
        : IN_MEMORY_ZIP_LIMIT.desktop;
      if (totalBytes > limit) {
        setError(
          "This transfer is too large to bundle into one zip in this browser. Save the files one by one below, or open this link in Chrome or Edge on a computer.",
        );
        return;
      }
    }

    const controller = new AbortController();
    abort.current = controller;
    setJob({ kind: "preparing" });

    try {
      const { downloadZip } = await import("client-zip");
      const names = uniqueNames(files.map((file) => file.name));

      let urls = new Map<string, string>();
      let issuedAt = 0;
      let loaded = 0;
      let frame = 0;
      const report = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!controller.signal.aborted) setJob({ kind: "zipping", loaded });
        });
      };

      async function* entries() {
        for (const [index, file] of files.entries()) {
          if (Date.now() - issuedAt > URL_REFRESH_MS) {
            urls = new Map((await requestUrls()).map((signed) => [signed.id, signed.url]));
            issuedAt = Date.now();
          }
          const url = urls.get(file.id);
          const response = url ? await fetch(url, { signal: controller.signal }) : null;
          if (!response?.ok || !response.body) throw new Error(`Could not download ${file.name}.`);

          const counted = response.body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, stream) {
                loaded += chunk.byteLength;
                report();
                stream.enqueue(chunk);
              },
            }),
          );
          yield { name: names[index], input: counted, size: file.size };
        }
      }

      const zip = downloadZip(entries());
      setJob({ kind: "zipping", loaded: 0 });

      if (handle && zip.body) {
        const writable = await handle.createWritable();
        await zip.body.pipeTo(writable, { signal: controller.signal });
      } else {
        const blob = await zip.blob();
        const url = URL.createObjectURL(blob);
        save(url, zipName);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      cancelAnimationFrame(frame);
      setJob({ kind: "saved" });
    } catch (cause) {
      setJob({ kind: "idle" });
      if (!controller.signal.aborted && !isAbort(cause)) setError(errorMessage(cause));
    } finally {
      abort.current = null;
    }
  }

  const busy = job.kind === "preparing" || zipping;

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader aside={`Expires in ${expiresIn}`} />

      <main className="gutter flex flex-1 flex-col pt-5 pb-14 md:pt-6">
        <Eyebrow left="Sent to you" right={single ? "One file" : "Files"} />

        {/* The big moment: how much, and how heavy. */}
        <h1 className="text-display py-10 md:py-12">
          <span className="reveal block">{pluralize(files.length, "file")}</span>
          <span className="reveal block" style={stagger(1)}>
            {formatBytes(totalBytes)}
          </span>
        </h1>

        <div className="grid-12 rule-t gap-y-10 pt-4">
          {message ? (
            <section className="reveal col-span-12 lg:col-span-7 lg:row-start-1" style={stagger(2)}>
              <h2 className="label muted mb-3">Message</h2>
              <p className="text-lead whitespace-pre-wrap break-words">{message}</p>
            </section>
          ) : null}

          <section
            aria-label="Download"
            className={`reveal col-span-12 lg:sticky lg:top-6 lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:self-start ${message ? "lg:row-span-2" : ""}`}
            style={stagger(3)}
          >
            {zipping ? (
              <div>
                <p className="text-headline tabular pb-4" aria-hidden="true">
                  <PercentFigure value={smooth} />%
                </p>
                <ProgressBar value={smooth} now={percent} label="Download progress" />
                <div className="flex items-baseline justify-between gap-4 pt-3">
                  <p className="label tabular">
                    {formatBytes(job.loaded)} of {formatBytes(totalBytes)}
                  </p>
                  <Button variant="text" onClick={() => abort.current?.abort()}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="primary" onClick={downloadAll} disabled={busy || pendingFile !== null}>
                <span>{job.kind === "preparing" ? "Preparing" : job.kind === "saved" ? "Download again" : "Download"}</span>
                <span className="label tabular" aria-hidden="true">
                  {single ? formatBytes(totalBytes) : `Zip, ${formatBytes(totalBytes)}`}
                </span>
              </Button>
            )}

            <p role="status" className="label pt-3 empty:hidden">
              {job.kind === "saved" ? "Saved. Check your downloads." : null}
            </p>
            <p role="alert" className="pt-3 text-sm font-bold empty:hidden">
              {error}
            </p>
          </section>

          <div
            className={`col-span-12 grid grid-cols-subgrid content-start lg:col-span-7 lg:col-start-1 ${message ? "lg:row-start-2" : "lg:row-start-1"}`}
          >
            <FileTable label="Files in this transfer" columns="narrow" trailingLabel="Save">
              {files.map((file, index) => (
                <FileRow
                  key={file.id}
                  index={index}
                  name={file.name}
                  size={file.size}
                  columns="narrow"
                  className="reveal"
                  style={stagger(index + 4)}
                >
                  <button
                    type="button"
                    className="label underline-offset-4 hover:underline disabled:opacity-40"
                    aria-label={`Download ${file.name}`}
                    disabled={busy || pendingFile !== null}
                    onClick={() => downloadFile(file)}
                  >
                    {pendingFile === file.id ? "Wait" : "Save"}
                  </button>
                </FileRow>
              ))}
            </FileTable>
          </div>
        </div>
      </main>
    </div>
  );
}
