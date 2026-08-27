"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PostgrestLikeError = { code?: string; message: string };

export default function DeleteButton({
  what,
  onConfirm,
  onDeleted,
  restrictHint,
  size = "sm",
}: {
  what: string;
  onConfirm: () => Promise<void>;
  onDeleted?: () => void;
  restrictHint?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerClass =
    size === "md"
      ? "rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
      : "text-xs font-medium text-red-600 hover:underline";

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
      if (onDeleted) {
        onDeleted();
      } else {
        router.refresh();
      }
      setOpen(false);
      setConfirmText("");
    } catch (err) {
      const pgErr = err as PostgrestLikeError;
      if (pgErr?.code === "23503") {
        setError(restrictHint ?? "Can't delete — other records still depend on this.");
      } else {
        setError(pgErr?.message ?? "Delete failed.");
      }
    } finally {
      setDeleting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={triggerClass}>
        Delete
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col gap-1 rounded-md border border-red-200 bg-red-50 p-2">
      <p className="text-xs text-red-700">
        Type <span className="font-mono font-semibold">DELETE</span> to remove {what}.
      </p>
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          className="w-24 rounded border border-red-300 bg-white px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={confirmText !== "DELETE" || deleting}
          onClick={handleConfirm}
          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
        >
          {deleting ? "…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmText("");
            setError(null);
          }}
          className="text-xs text-gray-500 hover:text-gray-800"
        >
          Cancel
        </button>
      </div>
      {error && <p className="max-w-xs text-xs text-red-700">{error}</p>}
    </div>
  );
}
