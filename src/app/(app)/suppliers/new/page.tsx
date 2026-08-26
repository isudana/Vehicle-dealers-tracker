"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewSupplierPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("Japan");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        name,
        country,
        contact_person: contactPerson || null,
        phone: phone || null,
        email: email || null,
      })
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
          <span className="text-sm font-medium text-gray-700">Country</span>
          <input value={country} onChange={(e) => setCountry(e.target.value)} className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Contact person</span>
          <input
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
            className="input mt-1"
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input mt-1" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1" />
          </label>
        </div>

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
