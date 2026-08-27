"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { CURRENCIES, TRANSFER_METHOD_LABEL, type CashEntity, type TransferMethod } from "@/lib/types";

export default function SupplierTransferForm({
  supplierAccountId,
  defaultCurrency,
  otherEntities,
}: {
  supplierAccountId: string;
  defaultCurrency: string;
  otherEntities: CashEntity[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [direction, setDirection] = useState<"TO_SUPPLIER" | "FROM_SUPPLIER">("TO_SUPPLIER");
  // When "To supplier," the other party acts as the source (must not be a destination-only
  // Cash Entity). "From supplier" (refund) has no such restriction on the destination side.
  const otherPartyOptions = otherEntities.filter((e) => (direction === "TO_SUPPLIER" ? e.category !== "CASH_ENTITY" : true));
  const [otherPartyId, setOtherPartyId] = useState(otherPartyOptions[0]?.id ?? "");

  function handleDirectionChange(value: "TO_SUPPLIER" | "FROM_SUPPLIER") {
    setDirection(value);
    const validOptions = otherEntities.filter((e) => (value === "TO_SUPPLIER" ? e.category !== "CASH_ENTITY" : true));
    if (!validOptions.some((e) => e.id === otherPartyId)) {
      setOtherPartyId(validOptions[0]?.id ?? "");
    }
  }
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [exchangeRate, setExchangeRate] = useState(defaultCurrency === "LKR" ? "1" : "");
  const [method, setMethod] = useState<TransferMethod>("TT");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bankReference, setBankReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [lcDocument, setLcDocument] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleCurrencyChange(value: string) {
    setCurrency(value);
    setExchangeRate(value === "LKR" ? "1" : "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!otherPartyId) {
      setError("Pick the other party for this transfer.");
      return;
    }

    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();
    const sourceId = direction === "TO_SUPPLIER" ? otherPartyId : supplierAccountId;
    const destinationId = direction === "TO_SUPPLIER" ? supplierAccountId : otherPartyId;

    const { data: transfer, error: transferError } = await supabase
      .from("cash_transfers")
      .insert({
        source_entity_id: sourceId,
        destination_entity_id: destinationId,
        amount: Number(amount),
        currency,
        exchange_rate_to_lkr: currency === "LKR" ? 1 : Number(exchangeRate),
        transfer_date: transferDate,
        method,
        bank_reference: bankReference || null,
        created_by: userData.user?.id,
      })
      .select("id")
      .single();

    if (transferError) {
      setSaving(false);
      setError(transferError.message);
      return;
    }

    const updates: Record<string, string> = {};
    try {
      if (receipt) updates.receipt_path = await uploadFile(supabase, "receipt-attachments", transfer.id, receipt);
      if (lcDocument && method === "LC") {
        updates.lc_document_path = await uploadFile(supabase, "receipt-attachments", transfer.id, lcDocument);
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from("cash_transfers").update(updates).eq("id", transfer.id);
      }
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Attachment upload failed");
      return;
    }

    setSaving(false);
    setAmount("");
    setBankReference("");
    setReceipt(null);
    setLcDocument(null);
    router.refresh();
  }

  if (otherPartyOptions.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
        No usable cash entities for this direction yet — add a Bank or Cash entity in Settings before logging a
        transfer.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-3 rounded-md border border-gray-200 p-3">
      <Field label="Direction">
        <select
          value={direction}
          onChange={(e) => handleDirectionChange(e.target.value as "TO_SUPPLIER" | "FROM_SUPPLIER")}
          className="input"
        >
          <option value="TO_SUPPLIER">To supplier</option>
          <option value="FROM_SUPPLIER">From supplier (refund)</option>
        </select>
      </Field>
      <Field label="Other party">
        <select value={otherPartyId} onChange={(e) => setOtherPartyId(e.target.value)} className="input">
          {otherPartyOptions.map((en) => (
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
      <Field label="Method">
        <select value={method} onChange={(e) => setMethod(e.target.value as TransferMethod)} className="input">
          {(Object.keys(TRANSFER_METHOD_LABEL) as TransferMethod[]).map((m) => (
            <option key={m} value={m}>
              {TRANSFER_METHOD_LABEL[m]}
            </option>
          ))}
        </select>
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
      <div className="col-span-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "…" : "Log transfer"}
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
