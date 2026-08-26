import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  formatMoney,
  VEHICLE_STATUS_LABEL,
  RECEIPT_METHOD_LABEL,
  type Vehicle,
  type VehicleExpense,
  type VehiclePnl,
  type Sale,
  type SaleReceipt,
  type Customer,
} from "@/lib/types";
import VehicleExpenseForm from "@/components/VehicleExpenseForm";
import SaleForm from "@/components/SaleForm";
import ReceiptForm from "@/components/ReceiptForm";
import MarkReceivedButton from "@/components/MarkReceivedButton";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ chassis: string }>;
}) {
  const { chassis } = await params;
  const chassisNumber = decodeURIComponent(chassis);
  const supabase = await createClient();

  const [vehicleRes, pnlRes, expensesRes, costHeadsRes, saleRes, customersRes] = await Promise.all([
    supabase.from("vehicles").select("*, suppliers(*)").eq("chassis_number", chassisNumber).single(),
    supabase.from("vehicle_pnl").select("*").eq("chassis_number", chassisNumber).single(),
    supabase
      .from("vehicle_expenses")
      .select("*, cost_heads(*)")
      .eq("chassis_number", chassisNumber)
      .order("date_recorded", { ascending: false }),
    supabase.from("cost_heads").select("*").order("group_name"),
    supabase
      .from("sales")
      .select("*, customers(*)")
      .eq("chassis_number", chassisNumber)
      .maybeSingle(),
    supabase.from("customers").select("*").order("full_name"),
  ]);

  if (vehicleRes.error || !vehicleRes.data) {
    notFound();
  }

  const vehicle = vehicleRes.data as Vehicle;
  const pnl = pnlRes.data as VehiclePnl | null;
  const expenses = (expensesRes.data ?? []) as VehicleExpense[];
  const costHeads = costHeadsRes.data ?? [];
  const sale = saleRes.data as Sale | null;
  const customers = (customersRes.data ?? []) as Customer[];

  let receipts: SaleReceipt[] = [];
  if (sale) {
    const { data } = await supabase
      .from("sale_receipts")
      .select("*")
      .eq("sale_id", sale.id)
      .order("received_date", { ascending: false });
    receipts = (data ?? []) as SaleReceipt[];
  }

  const profit = pnl?.net_profit ?? pnl?.projected_profit ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/vehicles" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to vehicles
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">
            {vehicle.year ? `${vehicle.year} ` : ""}
            {vehicle.make} {vehicle.model}
          </h1>
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
            {VEHICLE_STATUS_LABEL[vehicle.vehicle_status]}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Chassis: {vehicle.chassis_number} · Supplier: {vehicle.suppliers?.name ?? "—"}
          {vehicle.color ? ` · ${vehicle.color}` : ""}
        </p>
      </div>

      {vehicle.vehicle_status === "BOUGHT_NOT_RECEIVED" && (
        <MarkReceivedButton chassisNumber={vehicle.chassis_number} />
      )}

      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Total landed cost" value={formatMoney(pnl?.total_landed_cost ?? 0)} />
        <SummaryCard
          label={sale ? "Agreed sale price" : "Target listing price"}
          value={formatMoney(sale ? pnl?.agreed_sale_price ?? 0 : vehicle.target_listing_price)}
        />
        <SummaryCard
          label="Balance due"
          value={pnl?.balance_due != null ? formatMoney(pnl.balance_due) : "—"}
          tone={pnl?.balance_due != null && pnl.balance_due > 0 ? "negative" : undefined}
        />
        <SummaryCard
          label={sale ? "Net profit" : "Projected profit"}
          value={profit != null ? formatMoney(profit) : "—"}
          tone={profit != null ? (profit >= 0 ? "positive" : "negative") : undefined}
        />
      </div>

      {pnl?.profit_margin_percent != null && (
        <p className="text-sm text-gray-500">ROI: {pnl.profit_margin_percent}%</p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Cost ledger</h2>
        <VehicleExpenseForm chassisNumber={vehicle.chassis_number} costHeads={costHeads} />
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {expenses.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No expenses recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Cost head</th>
                  <th className="px-4 py-2">Remarks</th>
                  <th className="px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-600">{e.date_recorded}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {e.cost_heads?.name ?? "—"}
                      <span className="ml-1 text-xs text-gray-400">({e.cost_heads?.group_name})</span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{e.remarks ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-900">{formatMoney(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Sale</h2>
        {!sale ? (
          vehicle.vehicle_status === "IN_STOCK" ? (
            <SaleForm chassisNumber={vehicle.chassis_number} customers={customers} />
          ) : (
            <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-500">
              A vehicle must be In Stock before it can be sold.
            </p>
          )
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
              <p>
                <span className="font-medium">{sale.customers?.full_name}</span> ({sale.customers?.nic_passport}) ·{" "}
                {sale.customers?.phone}
              </p>
              <p className="mt-1 text-gray-600">
                Payment type: {sale.payment_type} · Sale date: {sale.sale_date}
              </p>
              {sale.payment_type !== "DIRECT_CASH" && (
                <p className="mt-1 text-gray-600">
                  Leasing: {sale.leasing_company_name ?? "—"} · Approved{" "}
                  {formatMoney(sale.leasing_amount_approved)} · Status: {sale.leasing_status} · RO:{" "}
                  {sale.release_order_status ?? "—"}
                </p>
              )}
            </div>

            <h3 className="text-sm font-medium text-gray-900">Receipts</h3>
            <ReceiptForm saleId={sale.id} />
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              {receipts.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500">No receipts recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Method</th>
                      <th className="px-4 py-2">Reference</th>
                      <th className="px-4 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-gray-600">{r.received_date}</td>
                        <td className="px-4 py-2 text-gray-600">{RECEIPT_METHOD_LABEL[r.payment_method]}</td>
                        <td className="px-4 py-2 text-gray-600">{r.reference ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-900">{formatMoney(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
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
        className={`mt-1 text-lg font-semibold ${
          tone === "positive" ? "text-green-700" : tone === "negative" ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
