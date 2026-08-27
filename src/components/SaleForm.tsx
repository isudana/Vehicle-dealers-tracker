"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CashEntity, Customer, PaymentType } from "@/lib/types";

export default function SaleForm({
  chassisNumber,
  customers,
  leasingCompanies,
}: {
  chassisNumber: string;
  customers: Customer[];
  leasingCompanies: CashEntity[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    customers.length > 0 ? "existing" : "new",
  );
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [newCustomer, setNewCustomer] = useState({ full_name: "", nic_passport: "", phone: "" });
  const [agreedSalePrice, setAgreedSalePrice] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("DIRECT_CASH");
  const [leasingCompanyId, setLeasingCompanyId] = useState(leasingCompanies[0]?.id ?? "");
  const [leasingAmountApproved, setLeasingAmountApproved] = useState("");
  const [releaseOrderStatus, setReleaseOrderStatus] = useState("");
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsLeasingFields = paymentType === "LEASING" || paymentType === "HYBRID";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    let resolvedCustomerId = customerId;

    if (customerMode === "new") {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .insert({
          full_name: newCustomer.full_name,
          nic_passport: newCustomer.nic_passport,
          phone: newCustomer.phone,
        })
        .select("id")
        .single();

      if (customerError) {
        setError(customerError.message);
        setSaving(false);
        return;
      }
      resolvedCustomerId = customer.id;
    }

    const { error: saleError } = await supabase.from("sales").insert({
      chassis_number: chassisNumber,
      customer_id: resolvedCustomerId,
      agreed_sale_price: Number(agreedSalePrice),
      payment_type: paymentType,
      leasing_company_id: needsLeasingFields ? leasingCompanyId || null : null,
      leasing_amount_approved: needsLeasingFields && leasingAmountApproved ? Number(leasingAmountApproved) : 0,
      leasing_status: needsLeasingFields ? "PENDING" : "NOT_APPLICABLE",
      release_order_status: needsLeasingFields ? releaseOrderStatus || null : null,
      sale_date: saleDate,
      created_by: userData.user?.id,
    });

    setSaving(false);

    if (saleError) {
      setError(saleError.message);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <span className="text-sm font-medium text-gray-700">Customer</span>
        <div className="mt-1 flex gap-4 text-sm text-gray-600">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={customerMode === "existing"}
              onChange={() => setCustomerMode("existing")}
              disabled={customers.length === 0}
            />
            Existing
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={customerMode === "new"} onChange={() => setCustomerMode("new")} />
            New
          </label>
        </div>
      </div>

      {customerMode === "existing" ? (
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input">
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name} ({c.nic_passport})
            </option>
          ))}
        </select>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <input
            required
            placeholder="Full name"
            value={newCustomer.full_name}
            onChange={(e) => setNewCustomer((c) => ({ ...c, full_name: e.target.value }))}
            className="input"
          />
          <input
            required
            placeholder="NIC / Passport"
            value={newCustomer.nic_passport}
            onChange={(e) => setNewCustomer((c) => ({ ...c, nic_passport: e.target.value }))}
            className="input"
          />
          <input
            required
            placeholder="Phone"
            value={newCustomer.phone}
            onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))}
            className="input"
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Agreed sale price</span>
          <input
            type="number"
            step="0.01"
            required
            value={agreedSalePrice}
            onChange={(e) => setAgreedSalePrice(e.target.value)}
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Payment type</span>
          <select
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value as PaymentType)}
            className="input mt-1"
          >
            <option value="DIRECT_CASH">Direct Cash</option>
            <option value="LEASING">Leasing</option>
            <option value="HYBRID">Hybrid</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Sale date</span>
          <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="input mt-1" />
        </label>
      </div>

      {needsLeasingFields && (
        <div className="grid grid-cols-3 gap-2 rounded-md bg-gray-50 p-3">
          {leasingCompanies.length === 0 ? (
            <p className="text-xs text-amber-700">No leasing companies yet — add one in Settings.</p>
          ) : (
            <select value={leasingCompanyId} onChange={(e) => setLeasingCompanyId(e.target.value)} className="input">
              {leasingCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="number"
            step="0.01"
            placeholder="Approved lease amount"
            value={leasingAmountApproved}
            onChange={(e) => setLeasingAmountApproved(e.target.value)}
            className="input"
          />
          <input
            placeholder="Release order (RO) status"
            value={releaseOrderStatus}
            onChange={(e) => setReleaseOrderStatus(e.target.value)}
            className="input"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Create sale"}
      </button>
    </form>
  );
}
