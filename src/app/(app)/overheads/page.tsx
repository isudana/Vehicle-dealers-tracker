import { createClient } from "@/lib/supabase/server";
import { getSignedUrl } from "@/lib/storage";
import { formatMoney, TRANSFER_METHOD_LABEL, type CashEntity, type OverheadExpense } from "@/lib/types";
import OverheadExpenseForm from "@/components/OverheadExpenseForm";
import EntityDeleteButton from "@/components/EntityDeleteButton";

export default async function OverheadsPage() {
  const supabase = await createClient();
  const [expensesRes, categoriesRes, entitiesRes] = await Promise.all([
    supabase
      .from("overhead_expenses")
      .select("*, overhead_categories(*), cash_transfers(*, source_entity:source_entity_id(*), destination_entity:destination_entity_id(*))"),
    supabase.from("overhead_categories").select("*").order("name"),
    supabase.from("cash_entities").select("*").order("name"),
  ]);

  const expenses = ((expensesRes.data ?? []) as OverheadExpense[]).sort((a, b) =>
    (b.cash_transfers?.transfer_date ?? "").localeCompare(a.cash_transfers?.transfer_date ?? ""),
  );
  const categories = categoriesRes.data ?? [];
  const entities = (entitiesRes.data ?? []) as CashEntity[];
  const totalLkr = expenses.reduce((sum, e) => sum + (e.cash_transfers?.amount_lkr ?? 0), 0);
  const attachmentUrls = await Promise.all(
    expenses.map((e) =>
      e.cash_transfers?.receipt_path
        ? getSignedUrl(supabase, "receipt-attachments", e.cash_transfers.receipt_path)
        : Promise.resolve(null),
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

      <OverheadExpenseForm categories={categories} entities={entities} />

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {expenses.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">No overhead expenses recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Destination</th>
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2">Remarks</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">LKR equiv.</th>
                <th className="px-4 py-2">Receipt</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e, i) => {
                const ct = e.cash_transfers;
                return (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-600">{ct?.transfer_date}</td>
                  <td className="px-4 py-2 text-gray-600">{e.overhead_categories?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{ct?.source_entity?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{ct?.destination_entity?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{ct ? TRANSFER_METHOD_LABEL[ct.method] : "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{e.remarks ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-900">{ct ? formatMoney(ct.amount, ct.currency) : "—"}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {ct && ct.currency !== "LKR" ? formatMoney(ct.amount_lkr) : "—"}
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
                    <EntityDeleteButton what="this overhead expense" table="cash_transfers" id={e.cash_transfer_id} />
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
