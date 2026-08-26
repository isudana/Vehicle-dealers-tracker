import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  formatMoney,
  VEHICLE_STATUS_LABEL,
  type ExecutiveSummary,
  type VehiclePnl,
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

  const [summaryRes, vehiclesRes] = await Promise.all([
    supabase.from("executive_summary").select("*").single(),
    supabase.from("vehicle_pnl").select("*").order("chassis_number"),
  ]);

  const summary = summaryRes.data as ExecutiveSummary | null;
  const vehicles = (vehiclesRes.data ?? []) as VehiclePnl[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Executive Dashboard</h1>
        <Link
          href="/vehicles/new"
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add vehicle
        </Link>
      </div>

      {(summaryRes.error || vehiclesRes.error) && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {summaryRes.error?.message ?? vehiclesRes.error?.message}
        </p>
      )}

      <div className="grid grid-cols-4 gap-4">
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
      </div>

      {STATE_ORDER.map((status) => (
        <VehicleTable
          key={status}
          title={VEHICLE_STATUS_LABEL[status]}
          rows={vehicles.filter((v) => v.vehicle_status === status)}
        />
      ))}
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

function VehicleTable({ title, rows }: { title: string; rows: VehiclePnl[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-900">
        {title} <span className="text-gray-400">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">No vehicles in this state.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="px-4 py-2">Vehicle</th>
              <th className="px-4 py-2">Chassis No.</th>
              <th className="px-4 py-2">Landed cost</th>
              <th className="px-4 py-2">Sale price</th>
              <th className="px-4 py-2">Balance due</th>
              <th className="px-4 py-2">{rows[0]?.sale_id ? "Net profit" : "Projected profit"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const profit = v.net_profit ?? v.projected_profit;
              return (
                <tr key={v.chassis_number} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <Link
                      href={`/vehicles/${encodeURIComponent(v.chassis_number)}`}
                      className="text-gray-900 hover:underline"
                    >
                      {v.year ? `${v.year} ` : ""}
                      {v.make} {v.model}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{v.chassis_number}</td>
                  <td className="px-4 py-2 text-gray-600">{formatMoney(v.total_landed_cost)}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {v.agreed_sale_price != null ? formatMoney(v.agreed_sale_price) : "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {v.balance_due != null ? formatMoney(v.balance_due) : "—"}
                  </td>
                  <td
                    className={`px-4 py-2 font-medium ${
                      profit == null ? "text-gray-400" : profit >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {profit != null ? formatMoney(profit) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
