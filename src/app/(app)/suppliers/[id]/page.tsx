import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Car, type Supplier, type SupplierPayment } from "@/lib/types";
import PaymentForm from "@/components/PaymentForm";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [supplierRes, paymentsRes, expensesRes, carsRes] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).single(),
    supabase
      .from("supplier_payments")
      .select("*, cars(make, model)")
      .eq("supplier_id", id)
      .order("payment_date", { ascending: false }),
    supabase.from("expenses").select("amount").eq("supplier_id", id),
    supabase.from("cars").select("*").order("make"),
  ]);

  if (supplierRes.error || !supplierRes.data) {
    notFound();
  }

  const supplier = supplierRes.data as Supplier;
  const payments = (paymentsRes.data ?? []) as SupplierPayment[];
  const cars = (carsRes.data ?? []) as Car[];
  const billed = (expensesRes.data ?? []).reduce((sum, e) => sum + e.amount, 0);
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = billed - paid;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/suppliers" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to suppliers
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-gray-900">{supplier.name}</h1>
        {supplier.contact_info && <p className="text-sm text-gray-500">{supplier.contact_info}</p>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Total billed (expenses)" value={formatMoney(billed)} />
        <SummaryCard label="Total paid" value={formatMoney(paid)} />
        <SummaryCard label="Balance owed" value={formatMoney(balance)} highlight={balance > 0} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Record a payment</h2>
        <PaymentForm supplierId={supplier.id} cars={cars} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Payment history</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {payments.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No payments recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Car</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-600">{p.payment_date}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {p.cars ? `${p.cars.make} ${p.cars.model}` : "General"}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{p.method ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-900">{formatMoney(p.amount, p.currency)}</td>
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
