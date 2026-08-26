"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ReceiptMethod } from "@/lib/types";

export default function ReceiptForm({ saleId }: { saleId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ReceiptMethod>("ADVANCE");
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("sale_receipts").insert({
      sale_id: saleId,
      amount: Number(amount),
      payment_method: method,
      received_date: receivedDate,
      reference: reference || null,
      created_by: userData.user?.id,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setAmount("");
    setReference("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-5 gap-2 rounded-md border border-gray-200 p-3">
      <select value={method} onChange={(e) => setMethod(e.target.value as ReceiptMethod)} className="input">
        <option value="ADVANCE">Advance</option>
        <option value="DIRECT_CASH">Direct Cash</option>
        <option value="LEASING_DISBURSAL">Leasing Disbursal</option>
      </select>
      <input
        type="date"
        value={receivedDate}
        onChange={(e) => setReceivedDate(e.target.value)}
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
        placeholder="Reference"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        className="input"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Record receipt"}
      </button>
      {error && <p className="col-span-5 text-sm text-red-600">{error}</p>}
    </form>
  );
}
