"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";

export default function ResourceForm() {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { data: inserted, error } = await supabase
      .from("resources")
      .insert({
        title,
        url,
        description: description || null,
        created_by: userData.user?.id,
      })
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    if (logo) {
      try {
        const path = await uploadFile(supabase, "resource-logos", inserted.id, logo);
        await supabase.from("resources").update({ logo_path: path }).eq("id", inserted.id);
      } catch (err) {
        setSaving(false);
        setError(err instanceof Error ? err.message : "Logo upload failed");
        return;
      }
    }

    setSaving(false);
    setTitle("");
    setUrl("");
    setDescription("");
    setLogo(null);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
      <Field label="Title">
        <input required value={title} onChange={(e) => setTitle(e.target.value)} className="input w-48" />
      </Field>
      <Field label="URL">
        <input
          type="url"
          required
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="input w-64"
        />
      </Field>
      <Field label="Description">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input w-64"
        />
      </Field>
      <Field label="Logo (optional)">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </Field>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Add resource"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}
