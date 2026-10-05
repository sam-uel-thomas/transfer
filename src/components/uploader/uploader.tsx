"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { CopyButton } from "@/components/copy-button";
import { Field, TextArea } from "@/components/field";
import { FileRow, FileTable } from "@/components/file-table";
import { Headline } from "@/components/headline";
import { PercentFigure, ProgressBar, useSmoothPercent } from "@/components/progress";
import { Button, Eyebrow } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import {
  EXPIRY_OPTIONS,
  MAX_FILES_PER_TRANSFER,
  MAX_MESSAGE_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_TRANSFER_BYTES,
  type ExpiryDays,
} from "@/lib/constants";
import { formatBytes, formatDate, formatDuration, pluralize } from "@/lib/format";
import { rowVariants, viewTransition } from "@/lib/motion";

import { fromDataTransfer, fromFileList, type PickedFile } from "./files";
import { UploadSession, type FileStatus, type TransferOptions, type UploadState } from "./session";

const DEFAULT_OPTIONS: TransferOptions = {
  message: "",
  recipientEmail: "",
  password: "",
  expiresInDays: 7,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Uploader({ header, appUrl }: { header: ReactNode; appUrl: string }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [options, setOptions] = useState<TransferOptions>(DEFAULT_OPTIONS);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [online, setOnline] = useState(true);
  const [emailTouched, setEmailTouched] = useState(false);

  const session = useRef<UploadSession | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const totalBytes = useMemo(() => files.reduce((sum, { file }) => sum + file.size, 0), [files]);
  const view = upload ? (upload.phase === "done" ? "done" : "progress") : files.length > 0 ? "compose" : "idle";
  const accepting = !upload && !submitting;

  // --- Adding files --------------------------------------------------------

  const addFiles = useCallback((picked: PickedFile[]) => {
    const usable = picked.filter(({ file }) => file.size > 0);
    const empty = picked.length - usable.length;
    setFiles((current) => {
      const seen = new Set(current.map((file) => file.key));
      const next = [...current];
      for (const file of usable) {
        if (seen.has(file.key)) continue;
        seen.add(file.key);
        next.push(file);
      }
      return next;
    });
    setNotice(empty > 0 ? `Skipped ${pluralize(empty, "empty file")}.` : null);
    setSubmitError(null);
  }, []);

  const openPicker = () => picker.current?.click();

  const canAccept = useEffectEvent(() => accepting);
  const acceptDrop = useEffectEvent(async (data: DataTransfer) => {
    if (!accepting) return;
    try {
      addFiles(await fromDataTransfer(data));
    } catch {
      setNotice("Some dropped items could not be read.");
    }
  });

  // The whole window is the drop zone. `depth` counts nested enter/leave
  // pairs so the inverted state does not flicker over child elements.
  useEffect(() => {
    let depth = 0;
    const carriesFiles = (event: DragEvent) =>
      !!event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files");

    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(canAccept());
    };
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      // Always cancel, or the browser would navigate to the dropped file.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = canAccept() ? "copy" : "none";
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      if (event.dataTransfer) void acceptDrop(event.dataTransfer);
    };

    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  // --- Upload lifecycle ----------------------------------------------------

  const busy = submitting || (!!upload && upload.phase !== "done");

  // Warn before closing the tab mid-upload.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Leaving the page in-app abandons the upload; clean up after it.
  useEffect(() => {
    const current = session;
    return () => current.current?.cancel();
  }, []);

  const recipient = options.recipientEmail.trim();
  const problem =
    totalBytes > MAX_TRANSFER_BYTES
      ? `${formatBytes(totalBytes - MAX_TRANSFER_BYTES)} over the ${formatBytes(MAX_TRANSFER_BYTES)} limit. Remove some files.`
      : files.length > MAX_FILES_PER_TRANSFER
        ? `At most ${MAX_FILES_PER_TRANSFER} files per transfer. Zip folders with many small files first.`
        : null;
  const emailInvalid = recipient !== "" && !EMAIL_PATTERN.test(recipient);
  // Shown once the field has been left, so it does not nag on the first keystroke.
  const emailError = emailInvalid && emailTouched ? "Enter a valid email address." : null;
  const canSend = files.length > 0 && !problem && !emailInvalid && !submitting;

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;

    setSubmitting(true);
    setSubmitError(null);
    const next = new UploadSession(files, options, setUpload);
    session.current = next;
    try {
      await next.start();
    } catch (error) {
      session.current = null;
      setSubmitError(
        error instanceof ApiError && error.status === 401
          ? "Your session has expired. Reload the page and sign in again."
          : errorMessage(error),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function cancelUpload() {
    session.current?.cancel();
    session.current = null;
    setUpload(null);
  }

  function startOver() {
    session.current?.dispose();
    session.current = null;
    setUpload(null);
    setFiles([]);
    setOptions(DEFAULT_OPTIONS);
    setNotice(null);
    setEmailTouched(false);
  }

  return (
    <div
      data-invert={dragging}
      className="flex min-h-dvh flex-col bg-bg text-fg transition-colors duration-200 ease-out"
    >
      {header}

      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          addFiles(fromFileList(event.target.files));
          event.target.value = "";
        }}
      />

      <main className="flex flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {view === "idle" ? (
            <motion.section
              key="idle"
              {...viewTransition}
              className="gutter relative flex flex-1 flex-col justify-between pt-5 pb-6 md:pt-6 md:pb-8"
            >
              <Eyebrow left="New transfer" right={`Up to ${formatBytes(MAX_TRANSFER_BYTES)}`} />
              <Headline className="text-display py-12" lines={["Send", "files."]} inline />
              <div className="grid-12 draw-t items-baseline gap-y-2 pt-4">
                <p className="text-title col-span-12 md:col-span-7">
                  {dragging ? (
                    "Drop to add."
                  ) : (
                    <>
                      <span className="pointer-coarse:hidden">Drop files anywhere.</span>
                      <span className="hidden pointer-coarse:inline">Tap to choose files.</span>
                    </>
                  )}
                </p>
                <p className="label col-span-12 md:col-span-5 md:text-right pointer-coarse:hidden">
                  Or click to browse
                </p>
              </div>
              {/* Covers the view, so a click or Enter anywhere opens the picker. */}
              <button
                type="button"
                onClick={openPicker}
                aria-label="Choose files to send"
                className="absolute inset-0 -outline-offset-4"
              />
            </motion.section>
          ) : null}

          {view === "compose" ? (
            <motion.form
              key="compose"
              {...viewTransition}
              onSubmit={send}
              noValidate
              className="gutter flex flex-1 flex-col pt-5 pb-12 md:pt-6"
            >
              <Eyebrow
                left={dragging ? "Drop to add" : "New transfer"}
                right={`${formatBytes(totalBytes)} of ${formatBytes(MAX_TRANSFER_BYTES)}`}
              />
              <Headline
                className="text-headline py-8 md:py-12"
                lines={[
                  <>
                    {pluralize(files.length, "file")},{" "}
                    <span className="whitespace-nowrap">{formatBytes(totalBytes)}</span>
                  </>,
                ]}
              />

              <div className="grid-12 draw-t gap-y-12 pt-4">
                <div className="col-span-12 grid grid-cols-subgrid content-start lg:col-span-7">
                  <FileTable label="Files to send" columns="narrow" trailingLabel="Remove">
                    <AnimatePresence initial={false}>
                      {files.map((picked, index) => (
                        <FileRow
                          key={picked.key}
                          index={index}
                          name={picked.name}
                          size={picked.file.size}
                          columns="narrow"
                          variants={rowVariants}
                          custom={index}
                          initial="hidden"
                          animate="shown"
                          exit="removed"
                        >
                          <button
                            type="button"
                            className="label -m-3 p-3"
                            aria-label={`Remove ${picked.name}`}
                            onClick={() => setFiles((current) => current.filter((file) => file.key !== picked.key))}
                          >
                            <span className="link-wipe">Remove</span>
                          </button>
                        </FileRow>
                      ))}
                    </AnimatePresence>
                  </FileTable>
                  <div className="col-span-full flex flex-wrap items-center gap-x-6 gap-y-3 pt-5">
                    <Button onClick={openPicker}>Add files</Button>
                    <Button variant="text" onClick={() => setFiles([])}>
                      Clear all
                    </Button>
                    {notice ? (
                      <p role="status" className="label muted">
                        {notice}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="col-span-12 flex flex-col gap-7 lg:sticky lg:top-6 lg:col-span-4 lg:col-start-9 lg:self-start">
                  <TextArea
                    id="message"
                    label="Message"
                    hint="Optional"
                    maxLength={MAX_MESSAGE_LENGTH}
                    value={options.message}
                    onChange={(event) => setOptions({ ...options, message: event.target.value })}
                  />
                  <Field
                    id="recipient"
                    type="email"
                    inputMode="email"
                    label="Email the link to"
                    hint="Optional"
                    placeholder="name@example.com"
                    autoComplete="off"
                    spellCheck={false}
                    value={options.recipientEmail}
                    error={emailError}
                    onBlur={() => setEmailTouched(true)}
                    onChange={(event) => setOptions({ ...options, recipientEmail: event.target.value })}
                  />
                  {/*
                    Plain text on purpose: this is a password to pass on to the
                    recipient, not a login, so it should be readable and password
                    managers should not offer to save it.
                  */}
                  <Field
                    id="password"
                    type="text"
                    label="Password"
                    hint="Optional"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    data-bwignore
                    maxLength={MAX_PASSWORD_LENGTH}
                    value={options.password}
                    onChange={(event) => setOptions({ ...options, password: event.target.value })}
                  />
                  <ExpiryPicker
                    value={options.expiresInDays}
                    onChange={(expiresInDays) => setOptions({ ...options, expiresInDays })}
                  />

                  <div>
                    <Button type="submit" variant="primary" disabled={!canSend}>
                      <span>{submitting ? "Preparing" : "Send"}</span>
                      <span className="label tabular" aria-hidden="true">
                        {formatBytes(totalBytes)}
                      </span>
                    </Button>
                    <p role="alert" className="mt-3 text-sm font-bold empty:hidden">
                      {problem ?? submitError}
                    </p>
                  </div>
                </div>
              </div>
            </motion.form>
          ) : null}

          {view === "progress" && upload ? (
            <UploadProgress
              key="progress"
              files={files}
              upload={upload}
              totalBytes={totalBytes}
              online={online}
              onPause={() => session.current?.pause()}
              onResume={() => session.current?.resume()}
              onRetry={() => session.current?.retry()}
              onCancel={cancelUpload}
            />
          ) : null}

          {view === "done" && upload?.result ? (
            <motion.section
              key="done"
              {...viewTransition}
              className="gutter flex flex-1 flex-col justify-between pt-5 pb-8 md:pt-6"
            >
              <Eyebrow left="Transfer ready" right={`Expires ${formatDate(upload.result.expiresAt)}`} />
              <Headline className="text-display py-12" lines={["Sent."]} />
              <div className="grid-12 draw-t gap-y-10 pt-4">
                <div className="col-span-12 lg:col-span-7">
                  <p className="label muted mb-2">Link</p>
                  <a
                    href={`${appUrl}/t/${upload.result.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-title break-all underline-offset-4 hover:underline"
                  >
                    {`${appUrl.replace(/^https?:\/\//, "")}/t/${upload.result.id}`}
                  </a>
                  <dl className="mt-8">
                    <Fact term="Contents">
                      {pluralize(files.length, "file")}, {formatBytes(totalBytes)}
                    </Fact>
                    <Fact term="Expires">After {pluralize(options.expiresInDays, "day")}</Fact>
                    <Fact term="Email">
                      {upload.result.emailed
                        ? `Sent to ${recipient}`
                        : upload.result.emailFailed
                          ? `Could not be sent to ${recipient}. Share the link yourself.`
                          : "Not sent"}
                    </Fact>
                    <Fact term="Password">
                      {options.password ? (
                        <span className="inline-flex flex-wrap items-baseline justify-end gap-x-4">
                          <span className="break-all">{options.password}</span>
                          <CopyButton text={options.password} label="Copy" />
                        </span>
                      ) : (
                        "None"
                      )}
                    </Fact>
                  </dl>
                </div>
                <div className="col-span-12 flex flex-col gap-3 lg:col-span-4 lg:col-start-9">
                  <CopyButton variant="primary" text={`${appUrl}/t/${upload.result.id}`} />
                  <Button onClick={startOver}>New transfer</Button>
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="rule-t flex items-baseline justify-between gap-6 py-2.5 last:border-b last:border-current">
      <dt className="label muted shrink-0">{term}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

function ExpiryPicker({ value, onChange }: { value: ExpiryDays; onChange: (value: ExpiryDays) => void }) {
  return (
    <fieldset>
      <legend className="label mb-2">Expires after</legend>
      <div className="grid grid-cols-3 border border-current">
        {EXPIRY_OPTIONS.map((days) => (
          <label
            key={days}
            className="relative flex cursor-pointer items-baseline justify-center gap-1.5 border-current py-3 transition-colors duration-200 ease-out not-first:border-l hover:bg-fg hover:text-bg has-checked:bg-fg has-checked:text-bg has-focus-visible:z-10 has-focus-visible:outline-2 has-focus-visible:outline-offset-[3px] has-focus-visible:outline-fg"
          >
            <input
              type="radio"
              name="expiry"
              value={days}
              checked={value === days}
              onChange={() => onChange(days)}
              className="sr-only"
            />
            <span className="tabular font-bold">{days}</span>
            <span className="label">{days === 1 ? "day" : "days"}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// --- Progress view ---------------------------------------------------------

const STATUS_TEXT: Record<FileStatus, string> = {
  queued: "Queued",
  uploading: "",
  done: "Done",
  error: "Failed",
};

function UploadProgress({
  files,
  upload,
  totalBytes,
  online,
  onPause,
  onResume,
  onRetry,
  onCancel,
}: {
  files: PickedFile[];
  upload: UploadState;
  totalBytes: number;
  online: boolean;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const { phase, paused } = upload;
  const finishing = phase === "finalizing";

  const uploadedBytes = useMemo(
    () => Object.values(upload.files).reduce((sum, file) => sum + file.bytes, 0),
    [upload.files],
  );
  const percent = finishing ? 100 : totalBytes > 0 ? Math.min(100, (uploadedBytes / totalBytes) * 100) : 0;
  const smooth = useSmoothPercent(percent);

  const active = phase === "uploading" && !paused && online;
  const rate = useTransferRate(uploadedBytes, active);
  const remaining = rate > 0 ? (totalBytes - uploadedBytes) / rate : 0;

  const status =
    phase === "failed"
      ? "Interrupted"
      : finishing
        ? "Verifying"
        : !online
          ? "Offline, waiting for connection"
          : paused
            ? "Paused"
            : "Uploading";

  const detail =
    phase === "failed"
      ? upload.error
      : finishing
        ? "Checking every file arrived intact."
        : !online
          ? "The upload resumes by itself when you are back online."
          : paused
            ? "Finished parts are kept. Resume when ready."
            : rate > 0
              ? `${formatBytes(rate)}/s, about ${formatDuration(remaining)} left.`
              : "Sending directly to storage.";

  return (
    <motion.section {...viewTransition} className="flex flex-1 flex-col pt-5 pb-12 md:pt-6">
      <div className="gutter">
        <Eyebrow
          left={<span aria-live="polite">{status}</span>}
          right={`${formatBytes(uploadedBytes)} of ${formatBytes(totalBytes)}`}
        />
        <Headline
          as="p"
          aria-hidden
          className="text-display tabular py-8 md:py-10"
          lines={[
            <>
              <PercentFigure value={smooth} />%
            </>,
          ]}
        />
      </div>

      <ProgressBar value={smooth} now={percent} label="Upload progress" />

      <div className="gutter">
        <div className="grid-12 items-start gap-y-5 pt-4 pb-12">
          <p
            role={phase === "failed" ? "alert" : undefined}
            className={`text-lead col-span-12 md:col-span-7 ${phase === "failed" ? "font-bold" : ""}`}
          >
            {detail}
          </p>
          <div className="col-span-12 flex flex-wrap items-center gap-x-6 gap-y-3 md:col-span-5 md:justify-end">
            {phase === "failed" ? <Button onClick={onRetry}>Retry</Button> : null}
            {phase === "uploading" ? (
              <Button onClick={paused ? onResume : onPause}>{paused ? "Resume" : "Pause"}</Button>
            ) : null}
            {!finishing ? (
              <Button variant="text" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid-12">
          <FileTable label="Upload progress by file" trailingLabel="Status">
            {files.map((picked, index) => {
              const state = upload.files[picked.key];
              const text =
                state?.status === "uploading"
                  ? `${Math.floor((state.bytes / picked.file.size) * 100)}%`
                  : STATUS_TEXT[state?.status ?? "queued"];
              return (
                <FileRow
                  key={picked.key}
                  index={index}
                  name={picked.name}
                  size={picked.file.size}
                  status={text}
                  statusTone={state?.status === "error" ? "strong" : state?.status === "queued" ? "muted" : "normal"}
                />
              );
            })}
          </FileTable>
        </div>
      </div>
    </motion.section>
  );
}

/** Smoothed upload speed in bytes per second, sampled once a second. */
function useTransferRate(bytes: number, active: boolean): number {
  const [rate, setRate] = useState(0);
  const latest = useRef(bytes);

  useEffect(() => {
    latest.current = bytes;
  }, [bytes]);

  useEffect(() => {
    if (!active) return;
    let previous = latest.current;
    let smoothed = 0;
    const timer = setInterval(() => {
      const delta = Math.max(0, latest.current - previous);
      previous = latest.current;
      smoothed = smoothed === 0 ? delta : smoothed * 0.7 + delta * 0.3;
      setRate(smoothed);
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);

  return active ? rate : 0;
}
