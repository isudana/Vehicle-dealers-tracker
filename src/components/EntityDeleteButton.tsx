"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteFile } from "@/lib/storage";
import DeleteButton from "@/components/DeleteButton";

export default function EntityDeleteButton({
  what,
  table,
  id,
  idColumn = "id",
  filesToDelete = [],
  restrictHint,
  redirectTo,
  size = "sm",
}: {
  what: string;
  table: string;
  id: string;
  idColumn?: string;
  filesToDelete?: { bucket: string; path: string }[];
  restrictHint?: string;
  redirectTo?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleConfirm() {
    for (const f of filesToDelete) {
      try {
        await deleteFile(supabase, f.bucket, f.path);
      } catch {
        // best-effort — don't block the row delete on a storage cleanup failure
      }
    }
    const { error } = await supabase.from(table).delete().eq(idColumn, id);
    if (error) throw error;
  }

  return (
    <DeleteButton
      what={what}
      onConfirm={handleConfirm}
      restrictHint={restrictHint}
      size={size}
      onDeleted={redirectTo ? () => router.push(redirectTo) : undefined}
    />
  );
}
