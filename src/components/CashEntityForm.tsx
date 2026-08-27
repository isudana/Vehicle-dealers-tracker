"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import {
  CASH_ENTITY_DIRECTION_LABEL,
  CASH_ENTITY_TYPE_LABEL,
  CURRENCIES,
  type CashEntityDirection,
  type CashEntityType,
} from "@/lib/types";

export default function CashEntityForm() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<CashEntityType>("BANK");
  const [direction, setDirection] = useState<CashEntityDirection>("BIDIRECTIONAL");
  const [primaryCurrency, setPrimaryCurrency] = useState("LKR");
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: inserted, error } = await supabase
      .from("cash_entities")
      .insert({ name, type, direction, primary_currency: primaryCurrency })
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    if (logo) {
      try {
        const path = await uploadFile(supabase, "cash-entity-logos", inserted.id, logo);
        await supabase.from("cash_entities").update({ logo_path: path }).eq("id", inserted.id);
      } catch (err) {
        setSaving(false);
        setError(err instanceof Error ? err.message : "Logo upload failed");
        return;
      }
    }

    setSaving(false);
    setName("");
    setLogo(null);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
      <Field label="Name">
        <input required value={name} onChange={(e) => setName(e.target.value)} className="input w-48" />
      </Field>
      <Field label="Type">
        <select value={type} onChange={(e) => setType(e.target.value as CashEntityType)} className="input">
          {(Object.keys(CASH_ENTITY_TYPE_LABEL) as CashEntityType[])
            .filter((t) => t !== "SUPPLIER")
            .map((t) => (
              <option key={t} value={t}>
                {CASH_ENTITY_TYPE_LABEL[t]}
              </option>
            ))}
        </select>
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
      <Field label="Direction">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as CashEntityDirection)}
          className="input"
        >
          {(Object.keys(CASH_ENTITY_DIRECTION_LABEL) as CashEntityDirection[]).map((d) => (
            <option key={d} value={d}>
              {CASH_ENTITY_DIRECTION_LABEL[d]}
            </option>
          ))}
        </select>
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
        {saving ? "…" : "Add entity"}
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
