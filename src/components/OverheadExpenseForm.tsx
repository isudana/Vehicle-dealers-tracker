"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { CURRENCIES, type OverheadCategory } from "@/lib/types";

export default function OverheadExpenseForm({ categories }: { categories: OverheadCategory[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("LKR");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleCurrencyChange(value: string) {
    setCurrency(value);
    if (value === "LKR") setExchangeRate("1");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { data: inserted, error } = await supabase
      .from("overhead_expenses")
      .insert({
        category_id: categoryId,
        amount: Number(amount),
        currency,
        exchange_rate_to_lkr: currency === "LKR" ? 1 : Number(exchangeRate),
        expense_date: expenseDate,
        remarks: remarks || null,
        created_by: userData.user?.id,
      })
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    if (attachment) {
      try {
        const path = await uploadFile(supabase, "receipt-attachments", inserted.id, attachment);
        await supabase.from("overhead_expenses").update({ attachment_path: path }).eq("id", inserted.id);
      } catch (err) {
        setSaving(false);
        setError(err instanceof Error ? err.message : "Attachment upload failed");
        return;
      }
    }

    setSaving(false);
    setAmount("");
    setRemarks("");
    setAttachment(null);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
      <Field label="Category">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="input" />
      </Field>
      <Field label="Amount">
        <input
          type="number"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input w-28"
        />
      </Field>
      <Field label="Currency">
        <select value={currency} onChange={(e) => handleCurrencyChange(e.target.value)} className="input">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Rate to LKR">
        <input
          type="number"
          step="0.000001"
          required
          disabled={currency === "LKR"}
          value={exchangeRate}
          onChange={(e) => setExchangeRate(e.target.value)}
          className="input w-24 disabled:bg-gray-100 disabled:text-gray-400"
        />
      </Field>
      <Field label="Remarks">
        <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="input" />
      </Field>
      <Field label="Receipt (optional)">
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </Field>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Add expense"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
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
