"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { useRole } from "@/components/RoleProvider";

export default function VehicleDocumentUploader({ chassisNumber }: { chassisNumber: string }) {
  const router = useRouter();
  const supabase = createClient();
  const role = useRole();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (role === "VIEWER") return null;

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const path = await uploadFile(supabase, "vehicle-documents", chassisNumber, file);
        const { error } = await supabase.from("vehicle_documents").insert({
          chassis_number: chassisNumber,
          storage_path: path,
          file_name: file.name,
        });
        if (error) throw error;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <label className="inline-block cursor-pointer rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-gray-400">
        {uploading ? "Uploading…" : "+ Add document"}
        <input type="file" multiple disabled={uploading} onChange={handleFiles} className="hidden" />
      </label>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
