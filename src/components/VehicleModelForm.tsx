"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function VehicleModelForm() {
  const router = useRouter();
  const supabase = createClient();
  const [make, setMake] = useState("");
  const [name, setName] = useState("");
  const [chassisCode, setChassisCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error } = await supabase.from("vehicle_models").insert({
      make: make.trim(),
      name: name.trim(),
      chassis_code: chassisCode.trim() || null,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMake("");
    setName("");
    setChassisCode("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Make</span>
        <input required value={make} onChange={(e) => setMake(e.target.value)} className="input w-32" />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Model</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="input w-64" />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Chassis code (optional)</span>
        <input value={chassisCode} onChange={(e) => setChassisCode(e.target.value)} className="input w-40" />
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
