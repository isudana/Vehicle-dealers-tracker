"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { CURRENCIES, TRANSFER_METHOD_LABEL, type CashEntity, type TransferMethod } from "@/lib/types";

export default function CashTransferForm({
  entities,
  onSuccess,
}: {
  entities: CashEntity[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const sourceOptions = entities.filter((e) => e.category !== "CASH_ENTITY");
  const destinationOptions = entities;
  const [sourceId, setSourceId] = useState(sourceOptions[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState(
    destinationOptions.find((e) => e.id !== sourceOptions[0]?.id)?.id ?? destinationOptions[0]?.id ?? "",
  );
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("LKR");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [exchangeRate, setExchangeRate] = useState("1");
  const [method, setMethod] = useState<TransferMethod>("BANK_TRANSFER");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [lcDocument, setLcDocument] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleCurrencyChange(value: string, touched: boolean) {
    setCurrency(value);
    setExchangeRate(value === "LKR" ? "1" : "");
    if (touched) setCurrencyTouched(true);
  }

  function handleDestinationChange(id: string) {
    setDestinationId(id);
    if (currencyTouched) return;
    const dest = entities.find((e) => e.id === id);
    if (dest) handleCurrencyChange(dest.primary_currency, false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (sourceId === destinationId) {
      setError("Source and destination must be different entities.");
      return;
    }

    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { data: inserted, error } = await supabase
      .from("cash_transfers")
      .insert({
        source_entity_id: sourceId,
        destination_entity_id: destinationId,
        amount: Number(amount),
        currency,
        exchange_rate_to_lkr: currency === "LKR" ? 1 : Number(exchangeRate),
        transfer_date: transferDate,
        method,
        purpose: purpose || null,
        bank_reference: bankReference || null,
        created_by: userData.user?.id,
      })
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    const updates: Record<string, string> = {};
    try {
      if (receipt) updates.receipt_path = await uploadFile(supabase, "receipt-attachments", inserted.id, receipt);
      if (lcDocument && method === "LC") {
        updates.lc_document_path = await uploadFile(supabase, "receipt-attachments", inserted.id, lcDocument);
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from("cash_transfers").update(updates).eq("id", inserted.id);
      }
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Attachment upload failed");
      return;
    }

    setSaving(false);
    setAmount("");
    setPurpose("");
    setBankReference("");
    setReceipt(null);
    setLcDocument(null);
    router.refresh();
    onSuccess?.();
  }

  if (entities.length < 2 || sourceOptions.length === 0 || destinationOptions.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
        Add at least two cash entities in Settings before logging a transfer.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-4 rounded-lg border border-gray-200 bg-white p-4">
      <Field label="Source (from)">
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="input">
          {sourceOptions.map((en) => (
            <option key={en.id} value={en.id}>
              {en.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Destination (to)">
        <select value={destinationId} onChange={(e) => handleDestinationChange(e.target.value)} className="input">
          {destinationOptions.map((en) => (
            <option key={en.id} value={en.id}>
              {en.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input
          type="date"
          value={transferDate}
          onChange={(e) => setTransferDate(e.target.value)}
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
          className="input"
        />
      </Field>
      <Field label="Currency">
        <select value={currency} onChange={(e) => handleCurrencyChange(e.target.value, true)} className="input">
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
      <Field label="Method">
        <select value={method} onChange={(e) => setMethod(e.target.value as TransferMethod)} className="input">
          {(Object.keys(TRANSFER_METHOD_LABEL) as TransferMethod[]).map((m) => (
            <option key={m} value={m}>
              {TRANSFER_METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Purpose / notes">
        <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} className="input" />
      </Field>
      <Field label="Bank reference">
        <input
          type="text"
          value={bankReference}
          onChange={(e) => setBankReference(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Receipt (optional)">
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </Field>
      {method === "LC" && (
        <Field label="LC document (optional)">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setLcDocument(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </Field>
      )}
      <div className="col-span-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Log transfer"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
