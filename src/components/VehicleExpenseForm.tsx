"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { CURRENCIES, type CostHead } from "@/lib/types";

const SUPPLIER_DEDUCTION_COST_HEADS = ["LC Amount", "TT Amount"];

export default function VehicleExpenseForm({
  chassisNumber,
  costHeads,
  supplierPrimaryCurrency,
}: {
  chassisNumber: string;
  costHeads: CostHead[];
  supplierPrimaryCurrency?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [costHeadId, setCostHeadId] = useState(costHeads[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("LKR");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [exchangeRate, setExchangeRate] = useState("1");
  const [dateRecorded, setDateRecorded] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const groups = Array.from(new Set(costHeads.map((c) => c.group_name)));

  function handleCurrencyChange(value: string, touched: boolean) {
    setCurrency(value);
    setExchangeRate(value === "LKR" ? "1" : "");
    if (touched) setCurrencyTouched(true);
  }

  function handleCostHeadChange(newCostHeadId: string) {
    setCostHeadId(newCostHeadId);

    if (currencyTouched || !supplierPrimaryCurrency || supplierPrimaryCurrency === "LKR") return;

    const head = costHeads.find((c) => c.id === newCostHeadId);
    if (head && SUPPLIER_DEDUCTION_COST_HEADS.includes(head.name)) {
      handleCurrencyChange(supplierPrimaryCurrency, false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { data: inserted, error } = await supabase
      .from("vehicle_expenses")
      .insert({
        chassis_number: chassisNumber,
        cost_head_id: costHeadId,
        amount: Number(amount),
        currency,
        exchange_rate_to_lkr: currency === "LKR" ? 1 : Number(exchangeRate),
        date_recorded: dateRecorded,
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
        await supabase.from("vehicle_expenses").update({ attachment_path: path }).eq("id", inserted.id);
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
      <Field label="Cost head">
        <select value={costHeadId} onChange={(e) => handleCostHeadChange(e.target.value)} className="input">
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {costHeads
                .filter((c) => c.group_name === group)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input
          type="date"
          value={dateRecorded}
          onChange={(e) => setDateRecorded(e.target.value)}
          className="input"
        />
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
        <select
          value={currency}
          onChange={(e) => handleCurrencyChange(e.target.value, true)}
          className="input"
        >
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
          placeholder={currency === "LKR" ? undefined : "e.g. 2.15"}
          className="input w-24 disabled:bg-gray-100 disabled:text-gray-400"
        />
      </Field>
      <Field label="Remarks">
        <input
          type="text"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          className="input"
        />
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
