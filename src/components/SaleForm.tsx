"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SaleForm({ carId }: { carId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [salePrice, setSalePrice] = useState("");
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [buyerName, setBuyerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { error: saleError } = await supabase.from("sales").insert({
      car_id: carId,
      sale_price: Number(salePrice),
      sale_date: saleDate,
      buyer_name: buyerName || null,
      created_by: userData.user?.id,
    });

    if (saleError) {
      setError(saleError.message);
      setSaving(false);
      return;
    }

    const { error: statusError } = await supabase
      .from("cars")
      .update({ status: "sold" })
      .eq("id", carId);

    setSaving(false);

    if (statusError) {
      setError(statusError.message);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-2 rounded-md border border-gray-200 p-3">
      <input
        type="date"
        value={saleDate}
        onChange={(e) => setSaleDate(e.target.value)}
        className="input"
      />
      <input
        type="number"
        step="0.01"
        required
        placeholder="Sale price"
        value={salePrice}
        onChange={(e) => setSalePrice(e.target.value)}
        className="input"
      />
      <input
        type="text"
        placeholder="Buyer name"
        value={buyerName}
        onChange={(e) => setBuyerName(e.target.value)}
        className="input"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Mark sold"}
      </button>
      {error && <p className="col-span-4 text-sm text-red-600">{error}</p>}
    </form>
  );
}
