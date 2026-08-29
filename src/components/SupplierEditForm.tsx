"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { useRole } from "@/components/RoleProvider";
import { CURRENCIES, type Supplier } from "@/lib/types";

export default function SupplierEditForm({ supplier }: { supplier: Supplier }) {
  const router = useRouter();
  const supabase = createClient();
  const role = useRole();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(supplier.name);
  const [country, setCountry] = useState(supplier.country);
  const [primaryCurrency, setPrimaryCurrency] = useState(supplier.primary_currency);
  const [contactPerson, setContactPerson] = useState(supplier.contact_person ?? "");
  const [phone, setPhone] = useState(supplier.phone ?? "");
  const [email, setEmail] = useState(supplier.email ?? "");
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const updates: Record<string, string | null> = {
      name,
      country,
      primary_currency: primaryCurrency,
      contact_person: contactPerson || null,
      phone: phone || null,
      email: email || null,
    };

    if (logo) {
      try {
        updates.logo_path = await uploadFile(supabase, "supplier-logos", supplier.id, logo);
      } catch (err) {
        setSaving(false);
        setError(err instanceof Error ? err.message : "Logo upload failed");
        return;
      }
    }

    const { error } = await supabase.from("suppliers").update(updates).eq("id", supplier.id);

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
    if (role === "VIEWER") return null;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        Edit supplier details
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 rounded-md border border-gray-200 p-3">
      <Field label="Name">
        <input required value={name} onChange={(e) => setName(e.target.value)} className="input" />
      </Field>
      <Field label="Country">
        <input value={country} onChange={(e) => setCountry(e.target.value)} className="input" />
      </Field>
      <Field label="Primary currency">
        <select value={primaryCurrency} onChange={(e) => setPrimaryCurrency(e.target.value)} className="input">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Contact person">
        <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="input" />
      </Field>
      <Field label="Phone">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
      </Field>
      <Field label="Email">
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
      </Field>
      <Field label="Logo (optional)">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </Field>
      <div className="col-span-2 flex items-center gap-3">
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
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
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
