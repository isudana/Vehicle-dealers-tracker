"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Car } from "@/lib/types";

export default function PaymentForm({ supplierId, cars }: { supplierId: string; cars: Car[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [amount, setAmount] = useState("");
  const [carId, setCarId] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("supplier_payments").insert({
      supplier_id: supplierId,
      car_id: carId || null,
      amount: Number(amount),
      payment_date: paymentDate,
      method: method || null,
      created_by: userData.user?.id,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setAmount("");
    setMethod("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-5 gap-2 rounded-md border border-gray-200 p-3">
      <input
        type="date"
        value={paymentDate}
        onChange={(e) => setPaymentDate(e.target.value)}
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
      <select value={carId} onChange={(e) => setCarId(e.target.value)} className="input">
        <option value="">General (no car)</option>
        {cars.map((c) => (
          <option key={c.id} value={c.id}>
            {c.make} {c.model}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Method (bank transfer, cash...)"
        value={method}
        onChange={(e) => setMethod(e.target.value)}
        className="input"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Record payment"}
      </button>
      {error && <p className="col-span-5 text-sm text-red-600">{error}</p>}
    </form>
  );
}
