"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Supplier } from "@/lib/types";

export default function NewVehiclePage() {
  const router = useRouter();
  const supabase = createClient();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState({
    chassis_number: "",
    supplier_id: "",
    make: "",
    model: "",
    year: "",
    color: "",
    target_listing_price: "",
    purchase_date: "",
    expected_clearance_date: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("suppliers")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setSuppliers(data ?? []);
        if (data && data.length > 0) {
          setForm((f) => ({ ...f, supplier_id: data[0].id }));
        }
      });
  }, [supabase]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.supplier_id) {
      setError("Add a supplier first before adding a vehicle.");
      return;
    }

    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("vehicles").insert({
      chassis_number: form.chassis_number.trim(),
      supplier_id: form.supplier_id,
      make: form.make,
      model: form.model,
      year: form.year ? Number(form.year) : null,
      color: form.color || null,
      target_listing_price: form.target_listing_price ? Number(form.target_listing_price) : 0,
      purchase_date: form.purchase_date || null,
      expected_clearance_date: form.expected_clearance_date || null,
      created_by: userData.user?.id,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(`/vehicles/${encodeURIComponent(form.chassis_number.trim())}`);
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Add a vehicle</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <Field label="Chassis number (primary key)">
          <input
            required
            value={form.chassis_number}
            onChange={(e) => update("chassis_number", e.target.value)}
            className="input"
            placeholder="e.g. JTMHY05J...  (must be unique)"
          />
        </Field>

        <Field label="Supplier">
          {suppliers.length === 0 ? (
            <p className="text-sm text-amber-700">
              No suppliers yet — add one on the Suppliers page first.
            </p>
          ) : (
            <select
              required
              value={form.supplier_id}
              onChange={(e) => update("supplier_id", e.target.value)}
              className="input"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Make">
            <input required value={form.make} onChange={(e) => update("make", e.target.value)} className="input" />
          </Field>
          <Field label="Model">
            <input required value={form.model} onChange={(e) => update("model", e.target.value)} className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Year">
            <input type="number" value={form.year} onChange={(e) => update("year", e.target.value)} className="input" />
          </Field>
          <Field label="Color">
            <input value={form.color} onChange={(e) => update("color", e.target.value)} className="input" />
          </Field>
        </div>

        <Field label="Target listing price (LKR)">
          <input
            type="number"
            step="0.01"
            value={form.target_listing_price}
            onChange={(e) => update("target_listing_price", e.target.value)}
            className="input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Purchase date">
            <input
              type="date"
              value={form.purchase_date}
              onChange={(e) => update("purchase_date", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Expected clearance date">
            <input
              type="date"
              value={form.expected_clearance_date}
              onChange={(e) => update("expected_clearance_date", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save vehicle"}
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
