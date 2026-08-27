"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function VehiclePricingForm({
  chassisNumber,
  auctionPrice,
  cifPrice,
}: {
  chassisNumber: string;
  auctionPrice: number | null;
  cifPrice: number | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [auction, setAuction] = useState(auctionPrice != null ? String(auctionPrice) : "");
  const [cif, setCif] = useState(cifPrice != null ? String(cifPrice) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error } = await supabase
      .from("vehicles")
      .update({
        auction_price: auction ? Number(auction) : null,
        cif_price: cif ? Number(cif) : null,
      })
      .eq("chassis_number", chassisNumber);

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
        Set Auction/CIF price
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Auction (FOB) price</span>
        <input
          type="number"
          step="0.01"
          value={auction}
          onChange={(e) => setAuction(e.target.value)}
          className="input w-32"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">CIF price</span>
        <input type="number" step="0.01" value={cif} onChange={(e) => setCif(e.target.value)} className="input w-32" />
      </label>
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
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
