import AwsS3, { type AwsBody } from "@uppy/aws-s3";
import Uppy from "@uppy/core";

import { api, ApiError, errorMessage } from "@/lib/api";
import { chunkSizeFor, MULTIPART_THRESHOLD_BYTES, type ExpiryDays } from "@/lib/constants";
import { pluralize } from "@/lib/format";

import type { PickedFile } from "./files";

export type FileStatus = "queued" | "uploading" | "done" | "error";
export type UploadPhase = "starting" | "uploading" | "finalizing" | "done" | "failed";

export interface TransferOptions {
  message: string;
  recipientEmail: string;
  password: string;
  expiresInDays: ExpiryDays;
}

export interface UploadResult {
  id: string;
  expiresAt: string;
  emailed: boolean;
  emailFailed: boolean;
}

export interface UploadState {
  phase: UploadPhase;
  paused: boolean;
  files: Record<string, { bytes: number; status: FileStatus }>;
  error: string | null;
  result: UploadResult | null;
}

type UploadMeta = { fileId: string; key: string };

// Inside plugin callbacks Uppy widens `meta` to Record<string, unknown>, so
// read our two fields through these instead of trusting the generic.
type WithMeta = { meta: object };
const fileIdOf = (file: WithMeta): string => String((file.meta as Partial<UploadMeta>).fileId);
const keyOf = (file: WithMeta): string => String((file.meta as Partial<UploadMeta>).key);

type UploadAction =
  | { action: "sign-put" }
  | { action: "create-multipart" }
  | { action: "sign-part"; uploadId: string; partNumber: number }
  | { action: "list-parts"; uploadId: string }
  | { action: "complete-multipart"; uploadId: string; parts: { PartNumber: number; ETag: string }[] }
  | { action: "abort-multipart"; uploadId: string };

/** Parts (and small files) in flight at once, shared across all files. */
const PARALLEL_REQUESTS = 6;
/** Backoff before re-sending a failed part. The upload fails after the last. */
const RETRY_DELAYS = [0, 1000, 3000, 5000, 10_000, 20_000];

/**
 * One transfer being uploaded: creates it on the server, pushes the bytes
 * straight to R2 through headless Uppy, then asks the server to verify and
 * publish it. Plain class, no React; `onChange` receives every new state.
 */
export class UploadSession {
  #state: UploadState;
  #uppy: Uppy<UploadMeta, AwsBody> | null = null;
  #transferId: string | null = null;
  #cancelled = false;
  #frame = 0;
  #lastError: string | null = null;

  constructor(
    private readonly files: PickedFile[],
    private readonly options: TransferOptions,
    private readonly onChange: (state: UploadState) => void,
  ) {
    this.#state = {
      phase: "starting",
      paused: false,
      files: Object.fromEntries(files.map((file) => [file.key, { bytes: 0, status: "queued" as const }])),
      error: null,
      result: null,
    };
  }

  get state(): UploadState {
    return this.#state;
  }

  /**
   * Rejects if the transfer could not be created (nothing has been uploaded
   * at that point). Upload failures after that are reported through state.
   */
  async start(): Promise<void> {
    const created = await api<{ id: string; files: { id: string; position: number }[] }>(
      "/api/transfers",
      {
        files: this.files.map(({ name, file }) => ({ name, size: file.size, type: file.type || undefined })),
        message: this.options.message.trim() || undefined,
        recipientEmail: this.options.recipientEmail.trim() || undefined,
        password: this.options.password || undefined,
        expiresInDays: this.options.expiresInDays,
      },
    );
    this.#transferId = created.id;
    if (this.#cancelled) return void this.#discard();

    const uppy = this.#createUppy();
    this.#uppy = uppy;
    try {
      this.files.forEach((picked, index) => {
        uppy.addFile({
          name: picked.name,
          type: picked.file.type,
          data: picked.file,
          source: "local",
          meta: { fileId: created.files[index].id, key: picked.key },
        });
      });
    } catch (error) {
      this.cancel();
      throw error;
    }

    this.#set({ phase: "uploading" });
    void this.#run(() => uppy.upload());
  }

  pause(): void {
    if (this.#state.phase !== "uploading") return;
    this.#uppy?.pauseAll();
    this.#set({ paused: true });
  }

  resume(): void {
    if (this.#state.phase !== "uploading") return;
    this.#uppy?.resumeAll();
    this.#set({ paused: false });
  }

  /** Re-sends failed files (finished parts are kept), or re-runs verification. */
  retry(): void {
    if (this.#state.phase !== "failed") return;
    const uppy = this.#uppy;
    const allUploaded = Object.values(this.#state.files).every((file) => file.status === "done");
    if (!uppy || allUploaded) return void this.#finalize();

    this.#lastError = null;
    const files = Object.fromEntries(
      Object.entries(this.#state.files).map(([key, file]) => [
        key,
        file.status === "error" ? { ...file, status: "queued" as const } : file,
      ]),
    );
    this.#set({ phase: "uploading", paused: false, error: null, files });
    void this.#run(() => uppy.retryAll());
  }

  /** Stops everything and removes the half-finished transfer from the server. */
  cancel(): void {
    if (this.#cancelled) return;
    this.#cancelled = true;
    cancelAnimationFrame(this.#frame);
    this.#uppy?.destroy();
    this.#uppy = null;
    if (this.#state.phase !== "done") void this.#discard();
  }

  /** Releases Uppy without touching the server. For a finished session. */
  dispose(): void {
    this.#cancelled = true;
    cancelAnimationFrame(this.#frame);
    this.#uppy?.destroy();
    this.#uppy = null;
  }

  // --- internals -----------------------------------------------------------

  async #run(upload: () => Promise<{ failed?: unknown[] } | undefined>): Promise<void> {
    try {
      const outcome = await upload();
      if (this.#cancelled) return;
      const failed = outcome?.failed?.length ?? 0;
      if (failed > 0) {
        this.#set({
          phase: "failed",
          paused: false,
          error: this.#lastError ?? `${pluralize(failed, "file")} could not be uploaded.`,
        });
        return;
      }
      await this.#finalize();
    } catch (error) {
      if (this.#cancelled) return;
      this.#set({ phase: "failed", paused: false, error: errorMessage(error) });
    }
  }

  async #finalize(): Promise<void> {
    this.#set({ phase: "finalizing", paused: false, error: null });
    try {
      const result = await api<UploadResult>(`/api/transfers/${this.#transferId}/complete`, undefined, {
        retries: 2,
      });
      if (this.#cancelled) return;
      this.#uppy?.destroy();
      this.#uppy = null;
      this.#set({ phase: "done", result });
    } catch (error) {
      if (this.#cancelled) return;
      this.#set({ phase: "failed", error: errorMessage(error) });
    }
  }

  async #discard(): Promise<void> {
    if (!this.#transferId) return;
    try {
      await api(`/api/transfers/${this.#transferId}`, undefined, { method: "DELETE", retries: 2 });
    } catch {
      // The daily cleanup removes abandoned uploads if this request is lost.
    }
  }

  /** Progress arrives many times a second; coalesce those into one update per frame. */
  #set(patch: Partial<UploadState>, immediate = true): void {
    this.#state = { ...this.#state, ...patch };
    if (immediate) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      this.onChange(this.#state);
    } else if (!this.#frame) {
      this.#frame = requestAnimationFrame(() => {
        this.#frame = 0;
        if (!this.#cancelled) this.onChange(this.#state);
      });
    }
  }

  #setFile(key: string, patch: Partial<UploadState["files"][string]>, immediate = false): void {
    const current = this.#state.files[key];
    if (!current) return;
    this.#set({ files: { ...this.#state.files, [key]: { ...current, ...patch } } }, immediate);
  }

  #sign<T>(fileId: string, action: UploadAction, signal?: AbortSignal): Promise<T> {
    return api<T>("/api/uploads", { ...action, fileId }, { signal, retries: 3 });
  }

  #createUppy(): Uppy<UploadMeta, AwsBody> {
    const uppy = new Uppy<UploadMeta, AwsBody>({ autoProceed: false });

    uppy.use(AwsS3, {
      limit: PARALLEL_REQUESTS,
      retryDelays: RETRY_DELAYS,
      shouldUseMultipart: (file) => (file.size ?? 0) > MULTIPART_THRESHOLD_BYTES,
      getChunkSize: (file) => chunkSizeFor(file.size),

      // Small files: one presigned PUT.
      getUploadParameters: async (file, { signal }) => {
        const { url, headers } = await this.#sign<{ url: string; headers: Record<string, string> }>(
          fileIdOf(file),
          { action: "sign-put" },
          signal,
        );
        return { method: "PUT", url, headers };
      },

      // Large files: multipart, each part presigned on demand.
      createMultipartUpload: (file) =>
        this.#sign<{ uploadId: string; key: string }>(fileIdOf(file), { action: "create-multipart" }),

      signPart: (file, { uploadId, partNumber, signal }) =>
        this.#sign<{ url: string }>(fileIdOf(file), { action: "sign-part", uploadId, partNumber }, signal),

      // Called when resuming, so parts R2 already has are not sent again.
      listParts: async (file, { uploadId, signal }) => {
        if (!uploadId) return [];
        const { parts } = await this.#sign<{ parts: { PartNumber: number; ETag: string; Size?: number }[] }>(
          fileIdOf(file),
          { action: "list-parts", uploadId },
          signal,
        );
        return parts;
      },

      completeMultipartUpload: async (file, { uploadId, parts, signal }) => {
        const complete = parts.flatMap(({ PartNumber, ETag }) => (PartNumber && ETag ? [{ PartNumber, ETag }] : []));
        await this.#sign(fileIdOf(file), { action: "complete-multipart", uploadId, parts: complete }, signal);
        return {};
      },

      abortMultipartUpload: async (file, { uploadId }) => {
        if (!uploadId) return;
        try {
          await this.#sign(fileIdOf(file), { action: "abort-multipart", uploadId });
        } catch {
          // Cancelling deletes the whole transfer server-side anyway.
        }
      },
    });

    uppy.on("upload-progress", (file, progress) => {
      if (!file) return;
      this.#setFile(keyOf(file), { bytes: progress.bytesUploaded ?? 0, status: "uploading" });
    });

    uppy.on("upload-success", (file) => {
      if (!file) return;
      this.#setFile(keyOf(file), { bytes: file.size ?? 0, status: "done" }, true);
    });

    uppy.on("upload-error", (file, error) => {
      // An ApiError carries a message written for the user. Anything else is
      // a transport failure from the browser ("Non 2xx", "Unknown error").
      this.#lastError =
        error instanceof ApiError
          ? error.message
          : "The connection dropped and retries ran out. Check your network, then retry.";
      if (!file) return;
      // A single-PUT file starts again from zero on retry; a multipart file
      // keeps the parts it already stored.
      const resumable = (file.size ?? 0) > MULTIPART_THRESHOLD_BYTES;
      this.#setFile(keyOf(file), resumable ? { status: "error" } : { status: "error", bytes: 0 }, true);
    });

    return uppy;
  }
}
