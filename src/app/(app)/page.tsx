import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  formatMoney,
  VEHICLE_STATUS_LABEL,
  type CashEntity,
  type CashEntityBalance,
  type ExecutiveSummary,
  type VehicleStatus,
} from "@/lib/types";

const STATE_ORDER: VehicleStatus[] = [
  "BOUGHT_NOT_RECEIVED",
  "IN_STOCK",
  "SOLD_PENDING_PAYMENT",
  "SOLD_FULLY_CLOSED",
];

export default async function DashboardPage() {
  const supabase = await createClient();

  const [summaryRes, vehicleStatusesRes, supplierBalancesRes, leasingCompaniesRes, pendingSalesRes] =
    await Promise.all([
      supabase.from("executive_summary").select("*").single(),
      supabase.from("vehicle_pnl").select("vehicle_status"),
      supabase
        .from("cash_entity_balance")
        .select("*")
        .eq("type", "SUPPLIER")
        .eq("category", "CASH_ACCOUNT")
        .order("name"),
      supabase.from("cash_entities").select("*").eq("category", "LEASING_COMPANY").order("name"),
      supabase.from("sales").select("leasing_company_id").eq("leasing_status", "PENDING"),
    ]);

  const summary = summaryRes.data as ExecutiveSummary | null;
  const vehicleStatuses = (vehicleStatusesRes.data ?? []) as { vehicle_status: VehicleStatus }[];
  const supplierBalances = (supplierBalancesRes.data ?? []) as CashEntityBalance[];
  const leasingCompanies = (leasingCompaniesRes.data ?? []) as CashEntity[];

  const countByStatus: Record<VehicleStatus, number> = {
    BOUGHT_NOT_RECEIVED: 0,
    IN_STOCK: 0,
    SOLD_PENDING_PAYMENT: 0,
    SOLD_FULLY_CLOSED: 0,
  };
  for (const v of vehicleStatuses) {
    countByStatus[v.vehicle_status] = (countByStatus[v.vehicle_status] ?? 0) + 1;
  }
  const totalSold = countByStatus.SOLD_PENDING_PAYMENT + countByStatus.SOLD_FULLY_CLOSED;

  const pendingCountByLeasingCompanyId: Record<string, number> = {};
  for (const s of (pendingSalesRes.data ?? []) as { leasing_company_id: string | null }[]) {
    if (!s.leasing_company_id) continue;
    pendingCountByLeasingCompanyId[s.leasing_company_id] = (pendingCountByLeasingCompanyId[s.leasing_company_id] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Executive Dashboard</h1>

      {(summaryRes.error || vehicleStatusesRes.error) && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {summaryRes.error?.message ?? vehicleStatusesRes.error?.message}
        </p>
      )}

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total capital invested" value={formatMoney(summary?.total_capital_invested ?? 0)} />
        <StatCard label="Total cash received" value={formatMoney(summary?.total_cash_received ?? 0)} />
        <StatCard
          label="Total realized profit"
          value={formatMoney(summary?.total_realized_profit ?? 0)}
          tone={summary && summary.total_realized_profit >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Outstanding receivables"
          value={formatMoney(summary?.outstanding_receivables ?? 0)}
          tone={summary && summary.outstanding_receivables > 0 ? "negative" : undefined}
        />
        <StatCard label="Total capital injected" value={formatMoney(summary?.total_capital_injected ?? 0)} />
        <StatCard label="Total overhead expenses" value={formatMoney(summary?.total_overhead_expenses ?? 0)} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Vehicle stock</h2>
        <div className="grid grid-cols-4 gap-4">
          {STATE_ORDER.map((status) => (
            <StatCard key={status} label={VEHICLE_STATUS_LABEL[status]} value={String(countByStatus[status])} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Pending from suppliers" value={String(countByStatus.BOUGHT_NOT_RECEIVED)} />
          <StatCard label="Total sold" value={String(totalSold)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Supplier balances</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {supplierBalances.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No suppliers yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Balance (native)</th>
                  <th className="px-4 py-2">Balance (LKR)</th>
                </tr>
              </thead>
              <tbody>
                {supplierBalances.map((s) => (
                  <tr key={s.entity_id} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <Link href={`/suppliers/${s.supplier_id}`} className="text-gray-900 hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className={`px-4 py-2 ${s.balance_native < 0 ? "text-red-700" : "text-gray-600"}`}>
                      {formatMoney(s.balance_native, s.primary_currency)}
                    </td>
                    <td className={`px-4 py-2 font-medium ${s.balance_lkr < 0 ? "text-red-700" : "text-gray-900"}`}>
                      {formatMoney(s.balance_lkr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Leasing company pending payments</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {leasingCompanies.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No leasing companies yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Pending settlements</th>
                </tr>
              </thead>
              <tbody>
                {leasingCompanies.map((c) => {
                  const pendingCount = pendingCountByLeasingCompanyId[c.id] ?? 0;
                  return (
                    <tr key={c.id} className="border-t border-gray-100">
                      <td className="px-4 py-2">
                        <Link href={`/cash/${c.id}`} className="text-gray-900 hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            pendingCount > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {pendingCount}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${
          tone === "positive" ? "text-green-700" : tone === "negative" ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
