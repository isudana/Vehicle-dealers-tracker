"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { CURRENCIES, TRANSFER_METHOD_LABEL, type CashEntity, type CostHead, type TransferMethod } from "@/lib/types";

// Cost heads with an obvious default destination entity, matched by name against the
// fetched entity list (still fully changeable). LC Amount / TT Amount default to the
// vehicle's own supplier entity instead — handled separately below.
const COST_HEAD_DEFAULT_ENTITY_NAME: Record<string, string> = {
  "HIPG Charges": "HIPG",
  "Customs Duty": "Sri Lanka Customs",
  "DO Charges": "Colombo Port",
  "RMV Penalty": "RMV",
};

export default function VehicleExpenseForm({
  chassisNumber,
  costHeads,
  entities,
  supplierEntityId,
}: {
  chassisNumber: string;
  costHeads: CostHead[];
  entities: CashEntity[];
  supplierEntityId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const defaultSource = entities.find((e) => e.type === "CASH") ?? entities[0];

  const [costHeadId, setCostHeadId] = useState(costHeads[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("LKR");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [exchangeRate, setExchangeRate] = useState("1");
  const [sourceId, setSourceId] = useState(defaultSource?.id ?? "");
  const [destinationId, setDestinationId] = useState("");
  const [destinationTouched, setDestinationTouched] = useState(false);
  const [method, setMethod] = useState<TransferMethod>("CASH");
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

  function applyDestination(id: string, touched: boolean) {
    setDestinationId(id);
    if (touched) {
      setDestinationTouched(true);
      return;
    }
    if (!currencyTouched) {
      const dest = entities.find((e) => e.id === id);
      if (dest) handleCurrencyChange(dest.primary_currency, false);
    }
  }

  function handleCostHeadChange(newCostHeadId: string) {
    setCostHeadId(newCostHeadId);
    if (destinationTouched) return;

    const head = costHeads.find((c) => c.id === newCostHeadId);
    if (!head) return;

    if ((head.name === "LC Amount" || head.name === "TT Amount") && supplierEntityId) {
      applyDestination(supplierEntityId, false);
      return;
    }

    const defaultName = COST_HEAD_DEFAULT_ENTITY_NAME[head.name];
    if (defaultName) {
      const match = entities.find((e) => e.name === defaultName);
      if (match) applyDestination(match.id, false);
    }
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
        transfer_date: dateRecorded,
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

    const { error } = await supabase.from("vehicle_expenses").insert({
      chassis_number: chassisNumber,
      cost_head_id: costHeadId,
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

  if (entities.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
        No cash entities yet — add one in Settings before recording expenses.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-3 rounded-md border border-gray-200 p-3">
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
      <Field label="Source (paid from)">
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="input">
          {entities.map((en) => (
            <option key={en.id} value={en.id}>
              {en.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Destination (paid to)">
        <select
          required
          value={destinationId}
          onChange={(e) => applyDestination(e.target.value, true)}
          className="input"
        >
          <option value="">Select…</option>
          {entities.map((en) => (
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
