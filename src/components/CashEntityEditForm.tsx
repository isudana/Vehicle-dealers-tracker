"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { CURRENCIES } from "@/lib/types";

export default function CashEntityEditForm({
  entityId,
  name: initialName,
  primaryCurrency: initialCurrency,
}: {
  entityId: string;
  name: string;
  primaryCurrency: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [primaryCurrency, setPrimaryCurrency] = useState(initialCurrency);
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const updates: Record<string, string> = { name, primary_currency: primaryCurrency };

    if (logo) {
      try {
        updates.logo_path = await uploadFile(supabase, "cash-entity-logos", entityId, logo);
      } catch (err) {
        setSaving(false);
        setError(err instanceof Error ? err.message : "Logo upload failed");
        return;
      }
    }

    const { error } = await supabase.from("cash_entities").update(updates).eq("id", entityId);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setLogo(null);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        Edit
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-2">
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Name</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="input w-40" />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Primary currency</span>
        <select value={primaryCurrency} onChange={(e) => setPrimaryCurrency(e.target.value)} className="input">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Logo</span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-sm text-gray-500 hover:text-gray-800">
        Cancel
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
