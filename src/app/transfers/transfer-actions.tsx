"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CopyButton } from "@/components/copy-button";
import { api, errorMessage } from "@/lib/api";

const ACTION = "label underline-offset-4 hover:underline disabled:opacity-40";

/** Copy link and delete-now for one row. Delete asks once more, in place. */
export function TransferActions({ id, url, live }: { id: string; url: string; live: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await api(`/api/transfers/${id}`, undefined, { method: "DELETE" });
      startRefresh(() => router.refresh());
    } catch (cause) {
      setError(errorMessage(cause));
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (deleting || refreshing) {
    return (
      <span role="status" className="label muted">
        Deleting
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="inline-flex items-baseline gap-4">
        <span className="label muted">Delete?</span>
        <button type="button" className={`${ACTION} font-bold`} onClick={remove} autoFocus>
          Yes
        </button>
        <button type="button" className={ACTION} onClick={() => setConfirming(false)}>
          No
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1">
      {error ? (
        <span role="alert" className="label font-bold">
          {error}
        </span>
      ) : null}
      {live ? <CopyButton text={url} label="Copy" /> : null}
      <button
        type="button"
        className={ACTION}
        aria-label={live ? `Delete transfer ${id} now` : `Remove expired transfer ${id}`}
        onClick={() => setConfirming(true)}
      >
        {live ? "Delete" : "Remove"}
      </button>
    </span>
  );
}
