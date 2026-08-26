import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, VEHICLE_STATUS_LABEL, type Supplier, type SupplierAdvance, type SupplierBalance, type Vehicle } from "@/lib/types";
import SupplierAdvanceForm from "@/components/SupplierAdvanceForm";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [supplierRes, balanceRes, advancesRes, vehiclesRes] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).single(),
    supabase.from("supplier_balance").select("*").eq("supplier_id", id).maybeSingle(),
    supabase.from("supplier_advances").select("*").eq("supplier_id", id).order("transfer_date", { ascending: false }),
    supabase.from("vehicles").select("*").eq("supplier_id", id).order("created_at", { ascending: false }),
  ]);

  if (supplierRes.error || !supplierRes.data) {
    notFound();
  }

  const supplier = supplierRes.data as Supplier;
  const balance = balanceRes.data as SupplierBalance | null;
  const advances = (advancesRes.data ?? []) as SupplierAdvance[];
  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/suppliers" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to suppliers
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-gray-900">{supplier.name}</h1>
        <p className="text-sm text-gray-500">
          {supplier.country}
          {supplier.contact_person ? ` · ${supplier.contact_person}` : ""}
          {supplier.phone ? ` · ${supplier.phone}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Total deposits" value={formatMoney(balance?.total_deposits ?? 0)} />
        <SummaryCard label="Deducted (LC/TT)" value={formatMoney(balance?.total_deducted ?? 0)} />
        <SummaryCard label="Refunds" value={formatMoney(balance?.total_refunds ?? 0)} />
        <SummaryCard
          label="Available balance"
          value={formatMoney(balance?.available_balance ?? 0)}
          highlight={(balance?.available_balance ?? 0) < 0}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Log an advance transfer or refund</h2>
        <SupplierAdvanceForm supplierId={supplier.id} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Transfer history</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {advances.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No transfers recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Bank reference</th>
                  <th className="px-4 py-2">Exchange rate</th>
                  <th className="px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {advances.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-600">{a.transfer_date}</td>
                    <td className="px-4 py-2 text-gray-600">{a.type}</td>
                    <td className="px-4 py-2 text-gray-600">{a.bank_reference ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{a.exchange_rate ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-900">{formatMoney(a.amount, a.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Vehicles from this supplier</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {vehicles.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No vehicles yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Chassis No.</th>
                  <th className="px-4 py-2">Vehicle</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.chassis_number} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-600">
                      <Link
                        href={`/vehicles/${encodeURIComponent(v.chassis_number)}`}
                        className="text-gray-900 hover:underline"
                      >
                        {v.chassis_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {v.year ? `${v.year} ` : ""}
                      {v.make} {v.model}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{VEHICLE_STATUS_LABEL[v.vehicle_status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${highlight ? "text-red-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
