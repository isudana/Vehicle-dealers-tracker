"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES, type Supplier, type Vehicle, type VehicleModel } from "@/lib/types";

export default function VehicleEditForm({
  vehicle,
  suppliers,
  models,
}: {
  vehicle: Vehicle;
  suppliers: Supplier[];
  models: VehicleModel[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [supplierId, setSupplierId] = useState(vehicle.supplier_id);
  const [modelId, setModelId] = useState(vehicle.model_id);
  const [year, setYear] = useState(vehicle.year != null ? String(vehicle.year) : "");
  const [color, setColor] = useState(vehicle.color ?? "");
  const [targetListingPrice, setTargetListingPrice] = useState(String(vehicle.target_listing_price));
  const [auctionPrice, setAuctionPrice] = useState(vehicle.auction_price != null ? String(vehicle.auction_price) : "");
  const [auctionCurrency, setAuctionCurrency] = useState(vehicle.auction_price_currency);
  const [cifPrice, setCifPrice] = useState(vehicle.cif_price != null ? String(vehicle.cif_price) : "");
  const [cifCurrency, setCifCurrency] = useState(vehicle.cif_price_currency);
  const [purchaseDate, setPurchaseDate] = useState(vehicle.purchase_date ?? "");
  const [expectedClearanceDate, setExpectedClearanceDate] = useState(vehicle.expected_clearance_date ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error } = await supabase
      .from("vehicles")
      .update({
        supplier_id: supplierId,
        model_id: modelId,
        year: year ? Number(year) : null,
        color: color || null,
        target_listing_price: targetListingPrice ? Number(targetListingPrice) : 0,
        auction_price: auctionPrice ? Number(auctionPrice) : null,
        auction_price_currency: auctionCurrency,
        cif_price: cifPrice ? Number(cifPrice) : null,
        cif_price_currency: cifCurrency,
        purchase_date: purchaseDate || null,
        expected_clearance_date: expectedClearanceDate || null,
      })
      .eq("chassis_number", vehicle.chassis_number);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        Edit vehicle details
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-3 rounded-md border border-gray-200 p-3">
      <Field label="Supplier">
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="input">
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Model">
        <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="input">
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
      </Field>
      <Field label="Year">
        <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="input" />
      </Field>
      <Field label="Color">
        <input value={color} onChange={(e) => setColor(e.target.value)} className="input" />
      </Field>
      <Field label="Target listing price (LKR)">
        <input
          type="number"
          step="0.01"
          value={targetListingPrice}
          onChange={(e) => setTargetListingPrice(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Auction (FOB) price">
        <div className="flex gap-1">
          <input
            type="number"
            step="0.01"
            value={auctionPrice}
            onChange={(e) => setAuctionPrice(e.target.value)}
            className="input"
          />
          <select value={auctionCurrency} onChange={(e) => setAuctionCurrency(e.target.value)} className="input w-20">
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
            value={cifPrice}
            onChange={(e) => setCifPrice(e.target.value)}
            className="input"
          />
          <select value={cifCurrency} onChange={(e) => setCifCurrency(e.target.value)} className="input w-20">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </Field>
      <Field label="Purchase date">
        <input
          type="date"
          value={purchaseDate}
          onChange={(e) => setPurchaseDate(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Expected clearance date">
        <input
          type="date"
          value={expectedClearanceDate}
          onChange={(e) => setExpectedClearanceDate(e.target.value)}
          className="input"
        />
      </Field>
      <div className="col-span-4 flex items-center gap-3">
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
