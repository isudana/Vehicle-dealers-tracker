"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, type CashEntity, type LeasingStatus, type Sale } from "@/lib/types";

const LEASING_STATUS_OPTIONS: LeasingStatus[] = ["NOT_APPLICABLE", "PENDING", "RECEIVED"];

export default function SaleLeasingEditForm({
  sale,
  leasingCompanies,
}: {
  sale: Sale;
  leasingCompanies: CashEntity[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [leasingCompanyId, setLeasingCompanyId] = useState(sale.leasing_company_id ?? leasingCompanies[0]?.id ?? "");
  const [leasingAmountApproved, setLeasingAmountApproved] = useState(String(sale.leasing_amount_approved));
  const [leasingStatus, setLeasingStatus] = useState<LeasingStatus>(sale.leasing_status);
  const [releaseOrderStatus, setReleaseOrderStatus] = useState(sale.release_order_status ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error } = await supabase
      .from("sales")
      .update({
        leasing_company_id: leasingCompanyId || null,
        leasing_amount_approved: leasingAmountApproved ? Number(leasingAmountApproved) : 0,
        leasing_status: leasingStatus,
        release_order_status: releaseOrderStatus || null,
      })
      .eq("id", sale.id);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="mt-1 flex items-center gap-2 text-gray-600">
        <p>
          Leasing: {sale.leasing_company?.name ?? "—"} · Approved {formatMoney(sale.leasing_amount_approved)} ·
          Status: {sale.leasing_status} · RO: {sale.release_order_status ?? "—"}
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 grid grid-cols-4 gap-2 rounded-md border border-gray-200 p-3">
      <Field label="Leasing company">
        {leasingCompanies.length === 0 ? (
          <p className="text-xs text-amber-700">Add one in Settings first.</p>
        ) : (
          <select value={leasingCompanyId} onChange={(e) => setLeasingCompanyId(e.target.value)} className="input">
            {leasingCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Approved amount">
        <input
          type="number"
          step="0.01"
          value={leasingAmountApproved}
          onChange={(e) => setLeasingAmountApproved(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Status">
        <select
          value={leasingStatus}
          onChange={(e) => setLeasingStatus(e.target.value as LeasingStatus)}
          className="input"
        >
          {LEASING_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="RO status">
        <input
          value={releaseOrderStatus}
          onChange={(e) => setReleaseOrderStatus(e.target.value)}
          className="input"
        />
      </Field>
      <div className="col-span-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-gray-500 hover:text-gray-800">
          Cancel
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
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
