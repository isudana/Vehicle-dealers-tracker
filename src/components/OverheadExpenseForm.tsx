"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import {
  CURRENCIES,
  TRANSFER_METHOD_LABEL,
  type CashEntity,
  type OverheadCategory,
  type TransferMethod,
} from "@/lib/types";

export default function OverheadExpenseForm({
  categories,
  entities,
}: {
  categories: OverheadCategory[];
  entities: CashEntity[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const sourceOptions = entities.filter((e) => e.direction !== "DESTINATION_ONLY");
  const destinationOptions = entities.filter((e) => e.direction !== "SOURCE_ONLY");
  const defaultSource = sourceOptions.find((e) => e.type === "CASH") ?? sourceOptions[0];

  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("LKR");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [sourceId, setSourceId] = useState(defaultSource?.id ?? "");
  const [destinationId, setDestinationId] = useState("");
  const [method, setMethod] = useState<TransferMethod>("CASH");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleCurrencyChange(value: string) {
    setCurrency(value);
    setExchangeRate(value === "LKR" ? "1" : "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sourceId || !destinationId) {
      setError("Pick both a source and a destination entity.");
      return;
    }
    if (sourceId === destinationId) {
      setError("Source and destination must be different entities.");
      return;
    }

    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { data: transfer, error: transferError } = await supabase
      .from("cash_transfers")
      .insert({
        source_entity_id: sourceId,
        destination_entity_id: destinationId,
        amount: Number(amount),
        currency,
        exchange_rate_to_lkr: currency === "LKR" ? 1 : Number(exchangeRate),
        transfer_date: expenseDate,
        method,
        created_by: userData.user?.id,
      })
      .select("id")
      .single();

    if (transferError) {
      setSaving(false);
      setError(transferError.message);
      return;
    }

    if (attachment) {
      try {
        const path = await uploadFile(supabase, "receipt-attachments", transfer.id, attachment);
        await supabase.from("cash_transfers").update({ receipt_path: path }).eq("id", transfer.id);
      } catch (err) {
        setSaving(false);
        setError(err instanceof Error ? err.message : "Attachment upload failed");
        return;
      }
    }

    const { error } = await supabase.from("overhead_expenses").insert({
      category_id: categoryId,
      cash_transfer_id: transfer.id,
      remarks: remarks || null,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setAmount("");
    setRemarks("");
    setAttachment(null);
    router.refresh();
  }

  if (sourceOptions.length === 0 || destinationOptions.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
        No usable cash entities yet — add one in Settings before recording expenses.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-3 rounded-md border border-gray-200 p-3">
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
          className="input"
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
          className="input disabled:bg-gray-100 disabled:text-gray-400"
        />
      </Field>
      <Field label="Source (paid from)">
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="input">
          {sourceOptions.map((en) => (
            <option key={en.id} value={en.id}>
              {en.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Destination (paid to)">
        <select required value={destinationId} onChange={(e) => setDestinationId(e.target.value)} className="input">
          <option value="">Select…</option>
          {destinationOptions.map((en) => (
            <option key={en.id} value={en.id}>
              {en.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Method">
        <select value={method} onChange={(e) => setMethod(e.target.value as TransferMethod)} className="input">
          {(Object.keys(TRANSFER_METHOD_LABEL) as TransferMethod[]).map((m) => (
            <option key={m} value={m}>
              {TRANSFER_METHOD_LABEL[m]}
            </option>
          ))}
        </select>
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
      <div className="col-span-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "…" : "Add expense"}
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
