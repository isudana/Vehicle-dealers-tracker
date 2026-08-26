"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AdvanceType } from "@/lib/types";

export default function SupplierAdvanceForm({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [type, setType] = useState<AdvanceType>("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("JPY");
  const [exchangeRate, setExchangeRate] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("supplier_advances").insert({
      supplier_id: supplierId,
      type,
      amount: Number(amount),
      currency,
      exchange_rate: exchangeRate ? Number(exchangeRate) : null,
      bank_reference: bankReference || null,
      transfer_date: transferDate,
      created_by: userData.user?.id,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setAmount("");
    setBankReference("");
    setExchangeRate("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-6 gap-2 rounded-md border border-gray-200 p-3">
      <select value={type} onChange={(e) => setType(e.target.value as AdvanceType)} className="input">
        <option value="DEPOSIT">Deposit</option>
        <option value="REFUND">Refund</option>
      </select>
      <input
        type="date"
        value={transferDate}
        onChange={(e) => setTransferDate(e.target.value)}
        className="input"
      />
      <input
        type="number"
        step="0.01"
        required
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="input"
      />
      <input
        type="text"
        placeholder="Currency"
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="input"
      />
      <input
        type="number"
        step="0.0001"
        placeholder="Exchange rate"
        value={exchangeRate}
        onChange={(e) => setExchangeRate(e.target.value)}
        className="input"
      />
      <input
        type="text"
        placeholder="Bank reference"
        value={bankReference}
        onChange={(e) => setBankReference(e.target.value)}
        className="input"
      />
      <button
        type="submit"
        disabled={saving}
        className="col-span-6 rounded-md bg-gray-900 px-2 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Log transfer"}
      </button>
      {error && <p className="col-span-6 text-sm text-red-600">{error}</p>}
    </form>
  );
}
