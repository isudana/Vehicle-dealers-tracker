"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function VehicleModelForm() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error } = await supabase.from("vehicle_models").insert({ name: name.trim() });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Model name</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="input w-64" />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Add model"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
