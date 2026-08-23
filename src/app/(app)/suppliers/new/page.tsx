"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewSupplierPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data, error } = await supabase
      .from("suppliers")
      .insert({ name, contact_info: contactInfo || null, notes: notes || null })
      .select("id")
      .single();

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(`/suppliers/${data.id}`);
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Add a supplier</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Contact info</span>
          <input
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input mt-1" rows={3} />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save supplier"}
        </button>
      </form>
    </div>
  );
}
