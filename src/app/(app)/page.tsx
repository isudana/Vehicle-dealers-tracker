import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type CarProfit } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: cars, error } = await supabase
    .from("car_profit")
    .select("*")
    .order("status", { ascending: true });

  const rows = (cars ?? []) as CarProfit[];
  const inStock = rows.filter((c) => c.status === "in_stock");
  const sold = rows.filter((c) => c.status === "sold");
  const totalProfit = sold.reduce((sum, c) => sum + (c.profit ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <Link
          href="/cars/new"
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add car
        </Link>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
      )}

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="In stock" value={String(inStock.length)} />
        <StatCard label="Sold" value={String(sold.length)} />
        <StatCard label="Total profit (sold)" value={formatMoney(totalProfit)} />
      </div>

      <CarTable title="In stock" rows={inStock} />
      <CarTable title="Sold" rows={sold} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function CarTable({ title, rows }: { title: string; rows: CarProfit[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-900">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">No cars here yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="px-4 py-2">Car</th>
              <th className="px-4 py-2">Purchase</th>
              <th className="px-4 py-2">Expenses</th>
              <th className="px-4 py-2">Sale price</th>
              <th className="px-4 py-2">Profit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.car_id} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  <Link href={`/cars/${c.car_id}`} className="text-gray-900 hover:underline">
                    {c.year ? `${c.year} ` : ""}
                    {c.make} {c.model}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-600">{formatMoney(c.purchase_price)}</td>
                <td className="px-4 py-2 text-gray-600">{formatMoney(c.total_expenses)}</td>
                <td className="px-4 py-2 text-gray-600">
                  {c.sale_price != null ? formatMoney(c.sale_price) : "—"}
                </td>
                <td
                  className={`px-4 py-2 font-medium ${
                    c.profit == null
                      ? "text-gray-400"
                      : c.profit >= 0
                        ? "text-green-700"
                        : "text-red-700"
                  }`}
                >
                  {c.profit != null ? formatMoney(c.profit) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
