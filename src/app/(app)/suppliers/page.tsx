import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/types";

export default async function SuppliersPage() {
  const supabase = await createClient();

  const [suppliersRes, expensesRes, paymentsRes] = await Promise.all([
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("expenses").select("supplier_id, amount").not("supplier_id", "is", null),
    supabase.from("supplier_payments").select("supplier_id, amount"),
  ]);

  const suppliers = suppliersRes.data ?? [];
  const owed = new Map<string, number>();
  const paid = new Map<string, number>();

  for (const e of expensesRes.data ?? []) {
    owed.set(e.supplier_id as string, (owed.get(e.supplier_id as string) ?? 0) + e.amount);
  }
  for (const p of paymentsRes.data ?? []) {
    paid.set(p.supplier_id as string, (paid.get(p.supplier_id as string) ?? 0) + p.amount);
  }

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

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {suppliers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">No suppliers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Expenses billed</th>
                <th className="px-4 py-2">Paid</th>
                <th className="px-4 py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => {
                const billed = owed.get(s.id) ?? 0;
                const paidAmount = paid.get(s.id) ?? 0;
                const balance = billed - paidAmount;
                return (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <Link href={`/suppliers/${s.id}`} className="text-gray-900 hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{formatMoney(billed)}</td>
                    <td className="px-4 py-2 text-gray-600">{formatMoney(paidAmount)}</td>
                    <td className={`px-4 py-2 font-medium ${balance > 0 ? "text-red-700" : "text-gray-600"}`}>
                      {formatMoney(balance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
