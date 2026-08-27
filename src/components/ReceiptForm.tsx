"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CashEntity, ReceiptMethod } from "@/lib/types";

export default function ReceiptForm({
  saleId,
  leasingCompanyId,
  accountOptions,
}: {
  saleId: string;
  leasingCompanyId: string | null;
  accountOptions: CashEntity[];
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isLeasingDisbursal && !leasingCompanyId) {
      setError("Set this sale's leasing company first (edit the leasing details above).");
      return;
    }
    if (isLeasingDisbursal && !accountId) {
      setError("Pick which account the disbursal was deposited to.");
      return;
    }

    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    let cashTransferId: string | null = null;

    if (isLeasingDisbursal) {
      const { data: transfer, error: transferError } = await supabase
        .from("cash_transfers")
        .insert({
          source_entity_id: leasingCompanyId,
          destination_entity_id: accountId,
          amount: Number(amount),
          currency: "LKR",
          exchange_rate_to_lkr: 1,
          transfer_date: receivedDate,
          method: "BANK_TRANSFER",
          created_by: userData.user?.id,
        })
        .select("id")
        .single();

      if (transferError) {
        setSaving(false);
        setError(transferError.message);
        return;
      }
      cashTransferId = transfer.id;
    }

    const { error } = await supabase.from("sale_receipts").insert({
      sale_id: saleId,
      amount: Number(amount),
      payment_method: method,
      cash_transfer_id: cashTransferId,
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
      {isLeasingDisbursal ? (
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
          <option value="">Deposit to…</option>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          placeholder="Reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="input"
        />
      )}
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
