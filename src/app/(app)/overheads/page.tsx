import { createClient } from "@/lib/supabase/server";
import { getSignedUrl } from "@/lib/storage";
import { formatMoney, type OverheadExpense } from "@/lib/types";
import OverheadExpenseForm from "@/components/OverheadExpenseForm";
import EntityDeleteButton from "@/components/EntityDeleteButton";

export default async function OverheadsPage() {
  const supabase = await createClient();
  const [expensesRes, categoriesRes] = await Promise.all([
    supabase
      .from("overhead_expenses")
      .select("*, overhead_categories(*)")
      .order("expense_date", { ascending: false }),
    supabase.from("overhead_categories").select("*").order("name"),
  ]);

  const expenses = (expensesRes.data ?? []) as OverheadExpense[];
  const categories = categoriesRes.data ?? [];
  const totalLkr = expenses.reduce((sum, e) => sum + e.amount_lkr, 0);
  const attachmentUrls = await Promise.all(
    expenses.map((e) =>
      e.attachment_path ? getSignedUrl(supabase, "receipt-attachments", e.attachment_path) : Promise.resolve(null),
    ),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Overhead Expenses</h1>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-2">
          <p className="text-xs text-gray-500">Total overheads (LKR)</p>
          <p className="text-lg font-semibold text-gray-900">{formatMoney(totalLkr)}</p>
        </div>
      </div>

      {expensesRes.error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{expensesRes.error.message}</p>
      )}

      <OverheadExpenseForm categories={categories} />

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {expenses.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">No overhead expenses recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Remarks</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">LKR equiv.</th>
                <th className="px-4 py-2">Receipt</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e, i) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-600">{e.expense_date}</td>
                  <td className="px-4 py-2 text-gray-600">{e.overhead_categories?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{e.remarks ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-900">{formatMoney(e.amount, e.currency)}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {e.currency === "LKR" ? "—" : formatMoney(e.amount_lkr)}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {attachmentUrls[i] ? (
                      <a
                        href={attachmentUrls[i]!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-900 underline"
                      >
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <EntityDeleteButton
                      what="this overhead expense"
                      table="overhead_expenses"
                      id={e.id}
                      filesToDelete={
                        e.attachment_path ? [{ bucket: "receipt-attachments", path: e.attachment_path }] : []
                      }
                    />
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
