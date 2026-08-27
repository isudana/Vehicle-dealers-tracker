"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { CURRENCIES } from "@/lib/types";

export default function SupplierForm() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("Japan");
  const [primaryCurrency, setPrimaryCurrency] = useState("JPY");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: inserted, error } = await supabase
      .from("suppliers")
      .insert({
        name,
        country,
        primary_currency: primaryCurrency,
        contact_person: contactPerson || null,
        phone: phone || null,
        email: email || null,
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
        const path = await uploadFile(supabase, "supplier-logos", inserted.id, logo);
        await supabase.from("suppliers").update({ logo_path: path }).eq("id", inserted.id);
      } catch (err) {
        setSaving(false);
        setError(err instanceof Error ? err.message : "Logo upload failed");
        return;
      }
    }

    setSaving(false);
    router.push(`/suppliers/${inserted.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Name</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Country</span>
          <input value={country} onChange={(e) => setCountry(e.target.value)} className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Primary currency</span>
          <select
            value={primaryCurrency}
            onChange={(e) => setPrimaryCurrency(e.target.value)}
            className="input mt-1"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
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
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Logo (optional)</span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
          className="mt-1 block text-sm"
        />
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
  );
}
