"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SupplierHoldEditForm({
  holdId,
  amount: initialAmount,
  exchangeRateToLkr: initialExchangeRate,
  reason: initialReason,
  currency,
}: {
  holdId: string;
  amount: number;
  exchangeRateToLkr: number;
  reason: string | null;
  currency: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(initialAmount));
  const [exchangeRate, setExchangeRate] = useState(String(initialExchangeRate));
  const [reason, setReason] = useState(initialReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error } = await supabase
      .from("supplier_balance_holds")
      .update({
        amount: Number(amount),
        exchange_rate_to_lkr: currency === "LKR" ? 1 : Number(exchangeRate),
        reason: reason || null,
      })
      .eq("id", holdId);

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
        Edit
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-2">
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Amount ({currency})</span>
        <input
          type="number"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input w-28"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Rate to LKR</span>
        <input
          type="number"
          step="0.000001"
          required
          disabled={currency === "LKR"}
          value={exchangeRate}
          onChange={(e) => setExchangeRate(e.target.value)}
          className="input w-24 disabled:bg-gray-100 disabled:text-gray-400"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Reason</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="input w-40" />
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
