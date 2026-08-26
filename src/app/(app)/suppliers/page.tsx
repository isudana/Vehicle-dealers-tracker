import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type SupplierBalance } from "@/lib/types";

export default async function SuppliersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("supplier_balance").select("*").order("name");
  const balances = (data ?? []) as SupplierBalance[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Suppliers</h1>
        <Link
          href="/suppliers/new"
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add supplier
        </Link>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {balances.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">No suppliers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Deposits</th>
                <th className="px-4 py-2">Deducted (LC/TT)</th>
                <th className="px-4 py-2">Refunds</th>
                <th className="px-4 py-2">Available balance</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((s) => (
                <tr key={s.supplier_id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <Link href={`/suppliers/${s.supplier_id}`} className="text-gray-900 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{formatMoney(s.total_deposits)}</td>
                  <td className="px-4 py-2 text-gray-600">{formatMoney(s.total_deducted)}</td>
                  <td className="px-4 py-2 text-gray-600">{formatMoney(s.total_refunds)}</td>
                  <td
                    className={`px-4 py-2 font-medium ${
                      s.available_balance < 0 ? "text-red-700" : "text-gray-900"
                    }`}
                  >
                    {formatMoney(s.available_balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
