import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Car, type Expense, type Sale, type SupplierPayment } from "@/lib/types";
import ExpenseForm from "@/components/ExpenseForm";
import SaleForm from "@/components/SaleForm";

export default async function CarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [carRes, expensesRes, paymentsRes, saleRes, categoriesRes, suppliersRes] = await Promise.all([
    supabase.from("cars").select("*").eq("id", id).single(),
    supabase
      .from("expenses")
      .select("*, expense_categories(id, name), suppliers(id, name)")
      .eq("car_id", id)
      .order("expense_date", { ascending: false }),
    supabase
      .from("supplier_payments")
      .select("*, suppliers(id, name)")
      .eq("car_id", id)
      .order("payment_date", { ascending: false }),
    supabase.from("sales").select("*").eq("car_id", id).maybeSingle(),
    supabase.from("expense_categories").select("*").order("name"),
    supabase.from("suppliers").select("*").order("name"),
  ]);

  if (carRes.error || !carRes.data) {
    notFound();
  }

  const car = carRes.data as Car;
  const expenses = (expensesRes.data ?? []) as Expense[];
  const payments = (paymentsRes.data ?? []) as SupplierPayment[];
  const sale = saleRes.data as Sale | null;
  const categories = categoriesRes.data ?? [];
  const suppliers = suppliersRes.data ?? [];

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const profit = sale ? sale.sale_price - car.purchase_price - totalExpenses : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to dashboard
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">
            {car.year ? `${car.year} ` : ""}
            {car.make} {car.model}
          </h1>
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${
              car.status === "sold" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"
            }`}
          >
            {car.status === "sold" ? "Sold" : "In stock"}
          </span>
        </div>
        <p className="text-sm text-gray-500">{car.chassis_no}</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Purchase price" value={formatMoney(car.purchase_price, car.currency)} />
        <SummaryCard label="Total expenses" value={formatMoney(totalExpenses)} />
        <SummaryCard label="Sale price" value={sale ? formatMoney(sale.sale_price, sale.currency) : "—"} />
        <SummaryCard
          label="Profit"
          value={profit != null ? formatMoney(profit) : "—"}
          highlight={profit != null ? (profit >= 0 ? "positive" : "negative") : undefined}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Expenses</h2>
        <ExpenseForm carId={car.id} categories={categories} suppliers={suppliers} />
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {expenses.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No expenses recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Supplier</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-600">{e.expense_date}</td>
                    <td className="px-4 py-2 text-gray-600">{e.expense_categories?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{e.suppliers?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{e.description ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-900">{formatMoney(e.amount, e.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {payments.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gray-900">Supplier payments for this car</h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Supplier</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-600">{p.payment_date}</td>
                    <td className="px-4 py-2 text-gray-600">{p.suppliers?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{p.method ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-900">{formatMoney(p.amount, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Sale</h2>
        {sale ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
            Sold on {sale.sale_date} to {sale.buyer_name ?? "unknown buyer"} for{" "}
            {formatMoney(sale.sale_price, sale.currency)}.
          </div>
        ) : (
          <SaleForm carId={car.id} />
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          highlight === "positive"
            ? "text-green-700"
            : highlight === "negative"
              ? "text-red-700"
              : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
