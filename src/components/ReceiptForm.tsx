"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CashEntity, ReceiptMethod, TransferMethod } from "@/lib/types";

const TRANSFER_METHOD_BY_RECEIPT_METHOD: Record<ReceiptMethod, TransferMethod> = {
  ADVANCE: "BANK_TRANSFER",
  DIRECT_CASH: "CASH",
  LEASING_DISBURSAL: "BANK_TRANSFER",
};

export default function ReceiptForm({
  saleId,
  leasingCompanyId,
  customerPaymentsEntityId,
  accountOptions,
  onSuccess,
}: {
  saleId: string;
  leasingCompanyId: string | null;
  customerPaymentsEntityId?: string;
  accountOptions: CashEntity[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ReceiptMethod>("ADVANCE");
  const [accountId, setAccountId] = useState(accountOptions[0]?.id ?? "");
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isLeasingDisbursal = method === "LEASING_DISBURSAL";
  const sourceEntityId = isLeasingDisbursal ? leasingCompanyId : customerPaymentsEntityId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sourceEntityId) {
      setError(
        isLeasingDisbursal
          ? "Set this sale's leasing company first (edit the leasing details above)."
          : "No \"Customer Payments\" cash entity found — add one in Settings.",
      );
      return;
    }
    if (!accountId) {
      setError("Pick which account this was deposited to.");
      return;
    }

    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { data: transfer, error: transferError } = await supabase
      .from("cash_transfers")
      .insert({
        source_entity_id: sourceEntityId,
        destination_entity_id: accountId,
        amount: Number(amount),
        currency: "LKR",
        exchange_rate_to_lkr: 1,
        transfer_date: receivedDate,
        method: TRANSFER_METHOD_BY_RECEIPT_METHOD[method],
        created_by: userData.user?.id,
      })
      .select("id")
      .single();

    if (transferError) {
      setSaving(false);
      setError(transferError.message);
      return;
    }

    const { error } = await supabase.from("sale_receipts").insert({
      sale_id: saleId,
      amount: Number(amount),
      payment_method: method,
      cash_transfer_id: transfer.id,
      received_date: receivedDate,
      reference: reference || null,
      created_by: userData.user?.id,
    });

    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    if (isLeasingDisbursal) {
      await supabase.from("sales").update({ leasing_status: "RECEIVED" }).eq("id", saleId);
    }

    setSaving(false);
    setAmount("");
    setReference("");
    router.refresh();
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-2 rounded-md border border-gray-200 p-3">
      <Field label="Method">
        <select value={method} onChange={(e) => setMethod(e.target.value as ReceiptMethod)} className="input">
          <option value="ADVANCE">Advance</option>
          <option value="DIRECT_CASH">Direct Cash</option>
          <option value="LEASING_DISBURSAL">Leasing Disbursal</option>
        </select>
      </Field>
      <Field label="Date">
        <input
          type="date"
          value={receivedDate}
          onChange={(e) => setReceivedDate(e.target.value)}
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
      <Field label="Deposit to">
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
          <option value="">Select…</option>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Reference (optional)">
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="input"
        />
      </Field>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "…" : "Record receipt"}
        </button>
      </div>
      {error && <p className="col-span-3 text-sm text-red-600">{error}</p>}
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
