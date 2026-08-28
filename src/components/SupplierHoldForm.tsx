"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SupplierHoldForm({
  supplierId,
  defaultCurrency,
  onSuccess,
}: {
  supplierId: string;
  defaultCurrency: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [amount, setAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState(defaultCurrency === "LKR" ? "1" : "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("supplier_balance_holds").insert({
      supplier_id: supplierId,
      amount: Number(amount),
      exchange_rate_to_lkr: defaultCurrency === "LKR" ? 1 : Number(exchangeRate),
      reason: reason || null,
      created_by: userData.user?.id,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setAmount("");
    setReason("");
    router.refresh();
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-2">
      <Field label={`Amount (${defaultCurrency})`}>
        <input
          type="number"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Rate to LKR">
        <input
          type="number"
          step="0.000001"
          required
          disabled={defaultCurrency === "LKR"}
          value={exchangeRate}
          onChange={(e) => setExchangeRate(e.target.value)}
          className="input disabled:bg-gray-100 disabled:text-gray-400"
        />
      </Field>
      <Field label="Reason (optional)">
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="input" />
      </Field>
      <div className="col-span-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "…" : "Add hold"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
