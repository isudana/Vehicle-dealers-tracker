"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function InvoiceEditForm({
  invoiceId,
  invoicedAmount,
  issueDate,
  notes,
}: {
  invoiceId: string;
  invoicedAmount: number;
  issueDate: string;
  notes: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [amount, setAmount] = useState(String(invoicedAmount));
  const [date, setDate] = useState(issueDate);
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error } = await supabase
      .from("invoices")
      .update({ invoiced_amount: Number(amount), issue_date: date, notes: notesValue || null })
      .eq("id", invoiceId);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-white p-3 print:hidden"
    >
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Invoiced amount</span>
        <input
          type="number"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input w-40"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Issue date</span>
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input" />
      </label>
      <label className="block flex-1">
        <span className="block text-xs font-medium text-gray-500">Notes</span>
        <input value={notesValue} onChange={(e) => setNotesValue(e.target.value)} className="input w-full" />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Save"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
