"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/RoleProvider";
import {
  CURRENCIES,
  SPARE_KEY_STATUS_LABEL,
  type SpareKeyStatus,
  type Supplier,
  type VehicleModel,
} from "@/lib/types";

export default function NewVehiclePage() {
  const router = useRouter();
  const supabase = createClient();
  const role = useRole();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [form, setForm] = useState({
    chassis_number: "",
    supplier_id: "",
    model_id: "",
    year: "",
    color: "",
    target_listing_price: "",
    auction_price: "",
    auction_price_currency: "LKR",
    cif_price: "",
    cif_price_currency: "LKR",
    purchase_date: "",
    lc_open_date: "",
    landed_date: "",
    cleared_date: "",
  });
  const [spareKeyStatus, setSpareKeyStatus] = useState<SpareKeyStatus>("PENDING");
  const [priceCurrencyTouched, setPriceCurrencyTouched] = useState(false);
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
          setForm((f) => ({
            ...f,
            supplier_id: data[0].id,
            auction_price_currency: data[0].primary_currency,
            cif_price_currency: data[0].primary_currency,
          }));
        }
      });
    supabase
      .from("vehicle_models")
      .select("*")
      .order("make")
      .order("name")
      .then(({ data }) => {
        setModels(data ?? []);
        if (data && data.length > 0) {
          setForm((f) => ({ ...f, model_id: data[0].id }));
        }
      });
  }, [supabase]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSupplierChange(supplierId: string) {
    const supplier = suppliers.find((s) => s.id === supplierId);
    setForm((f) => ({
      ...f,
      supplier_id: supplierId,
      ...(supplier && !priceCurrencyTouched
        ? { auction_price_currency: supplier.primary_currency, cif_price_currency: supplier.primary_currency }
        : {}),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.supplier_id) {
      setError("Add a supplier first before adding a vehicle.");
      return;
    }

    if (!form.model_id) {
      setError("Add a vehicle model in Settings first before adding a vehicle.");
      return;
    }

    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("vehicles").insert({
      chassis_number: form.chassis_number.trim(),
      supplier_id: form.supplier_id,
      model_id: form.model_id,
      year: form.year ? Number(form.year) : null,
      color: form.color || null,
      target_listing_price: form.target_listing_price ? Number(form.target_listing_price) : 0,
      auction_price: form.auction_price ? Number(form.auction_price) : null,
      auction_price_currency: form.auction_price_currency,
      cif_price: form.cif_price ? Number(form.cif_price) : null,
      cif_price_currency: form.cif_price_currency,
      purchase_date: form.purchase_date || null,
      lc_open_date: form.lc_open_date || null,
      landed_date: form.landed_date || null,
      cleared_date: form.cleared_date || null,
      spare_key_status: spareKeyStatus,
      created_by: userData.user?.id,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(`/vehicles/${encodeURIComponent(form.chassis_number.trim())}`);
  }

  if (role === "VIEWER") {
    return (
      <div className="max-w-lg space-y-4">
        <p className="text-sm text-gray-500">You don&apos;t have permission to add a vehicle.</p>
        <Link href="/vehicles" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to vehicles
        </Link>
      </div>
    );
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
              No suppliers yet — <Link href="/settings" className="underline">add one in Settings</Link>.
            </p>
          ) : (
            <select
              required
              value={form.supplier_id}
              onChange={(e) => handleSupplierChange(e.target.value)}
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

        <Field label="Model">
          {models.length === 0 ? (
            <p className="text-sm text-amber-700">
              No models yet — <Link href="/settings" className="underline">add one in Settings</Link>.
            </p>
          ) : (
            <select
              required
              value={form.model_id}
              onChange={(e) => update("model_id", e.target.value)}
              className="input"
            >
              {Array.from(new Set(models.map((m) => m.make))).map((make) => (
                <optgroup key={make} label={make}>
                  {models
                    .filter((m) => m.make === make)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.chassis_code ? ` (${m.chassis_code})` : ""}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          )}
        </Field>

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
          <Field label="Auction (FOB) price">
            <div className="flex gap-1">
              <input
                type="number"
                step="0.01"
                value={form.auction_price}
                onChange={(e) => update("auction_price", e.target.value)}
                className="input"
              />
              <select
                value={form.auction_price_currency}
                onChange={(e) => {
                  setPriceCurrencyTouched(true);
                  update("auction_price_currency", e.target.value);
                }}
                className="input w-20"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="CIF price">
            <div className="flex gap-1">
              <input
                type="number"
                step="0.01"
                value={form.cif_price}
                onChange={(e) => update("cif_price", e.target.value)}
                className="input"
              />
              <select
                value={form.cif_price_currency}
                onChange={(e) => {
                  setPriceCurrencyTouched(true);
                  update("cif_price_currency", e.target.value);
                }}
                className="input w-20"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Auction purchase date">
            <input
              type="date"
              value={form.purchase_date}
              onChange={(e) => update("purchase_date", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="LC open date">
            <input
              type="date"
              value={form.lc_open_date}
              onChange={(e) => update("lc_open_date", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Landed date">
            <input
              type="date"
              value={form.landed_date}
              onChange={(e) => update("landed_date", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Cleared date">
            <input
              type="date"
              value={form.cleared_date}
              onChange={(e) => update("cleared_date", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <Field label="Spare key">
          <select
            value={spareKeyStatus}
            onChange={(e) => setSpareKeyStatus(e.target.value as SpareKeyStatus)}
            className="input"
          >
            {(Object.keys(SPARE_KEY_STATUS_LABEL) as SpareKeyStatus[]).map((s) => (
              <option key={s} value={s}>
                {SPARE_KEY_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>

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
