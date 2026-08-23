"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewCarPage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    make: "",
    model: "",
    year: "",
    chassis_no: "",
    purchase_date: "",
    purchase_price: "",
    currency: "USD",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("cars")
      .insert({
        make: form.make,
        model: form.model,
        year: form.year ? Number(form.year) : null,
        chassis_no: form.chassis_no || null,
        purchase_date: form.purchase_date || null,
        purchase_price: form.purchase_price ? Number(form.purchase_price) : 0,
        currency: form.currency,
        notes: form.notes || null,
        created_by: userData.user?.id,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(`/cars/${data.id}`);
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Add a car</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Make">
            <input
              required
              value={form.make}
              onChange={(e) => update("make", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Model">
            <input
              required
              value={form.model}
              onChange={(e) => update("model", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Year">
            <input
              type="number"
              value={form.year}
              onChange={(e) => update("year", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Chassis / VIN">
            <input
              value={form.chassis_no}
              onChange={(e) => update("chassis_no", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Purchase date">
            <input
              type="date"
              value={form.purchase_date}
              onChange={(e) => update("purchase_date", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Purchase price">
            <input
              type="number"
              step="0.01"
              value={form.purchase_price}
              onChange={(e) => update("purchase_price", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <Field label="Currency">
          <input
            value={form.currency}
            onChange={(e) => update("currency", e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            className="input"
            rows={3}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save car"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
