import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl, getSignedUrl } from "@/lib/storage";
import {
  CASH_ENTITY_CATEGORY_LABEL,
  CASH_ENTITY_TYPE_LABEL,
  TRANSFER_METHOD_LABEL,
  formatMoney,
  type CashEntity,
  type CashEntityBalance,
  type CashEntityCategory,
  type CashTransfer,
} from "@/lib/types";
import CashTransferForm from "@/components/CashTransferForm";
import EntityDeleteButton from "@/components/EntityDeleteButton";

const CASH_ENTITY_CATEGORIES: CashEntityCategory[] = ["CASH_ACCOUNT", "CASH_ENTITY", "INVESTOR", "LEASING_COMPANY"];

export default async function CashPage() {
  const supabase = await createClient();
  const [entitiesRes, balancesRes, transfersRes] = await Promise.all([
    supabase.from("cash_entities").select("*").order("name"),
    supabase.from("cash_entity_balance").select("*").order("type").order("name"),
    supabase
      .from("cash_transfers")
      .select("*, source_entity:source_entity_id(*), destination_entity:destination_entity_id(*)")
      .order("transfer_date", { ascending: false })
      .limit(200),
  ]);

  const entities = (entitiesRes.data ?? []) as CashEntity[];
  const balances = (balancesRes.data ?? []) as CashEntityBalance[];
  const transfers = (transfersRes.data ?? []) as CashTransfer[];

  const receiptUrls = await Promise.all(
    transfers.map((t) => (t.receipt_path ? getSignedUrl(supabase, "receipt-attachments", t.receipt_path) : Promise.resolve(null))),
  );
  const lcDocUrls = await Promise.all(
    transfers.map((t) =>
      t.lc_document_path ? getSignedUrl(supabase, "receipt-attachments", t.lc_document_path) : Promise.resolve(null),
    ),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Cash</h1>
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-800">
          + Add cash entity (Settings)
        </Link>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-900">Entity balances</h2>
        {CASH_ENTITY_CATEGORIES.map((category) => {
          const categoryBalances = balances.filter((b) => b.category === category);
          const balanceLabel = category === "CASH_ENTITY" ? "Cash Paid" : "Balance";
          return (
            <div key={category} className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {CASH_ENTITY_CATEGORY_LABEL[category]} ({categoryBalances.length})
              </p>
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                {categoryBalances.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-gray-500">None yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2">{balanceLabel} (native)</th>
                        <th className="px-4 py-2">{balanceLabel} (LKR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryBalances.map((b) => {
                        const logoUrl = b.logo_path ? getPublicUrl(supabase, "cash-entity-logos", b.logo_path) : null;
                        const href = b.supplier_id ? `/suppliers/${b.supplier_id}` : `/cash/${b.entity_id}`;
                        return (
                          <tr key={b.entity_id} className="border-t border-gray-100">
                            <td className="px-4 py-2">
                              <Link href={href} className="flex items-center gap-2 text-gray-900 hover:underline">
                                {logoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
                                ) : (
                                  <div className="h-6 w-6 rounded bg-gray-100" />
                                )}
                                {b.name}
                              </Link>
                            </td>
                            <td className="px-4 py-2 text-gray-600">{CASH_ENTITY_TYPE_LABEL[b.type]}</td>
                            <td className={`px-4 py-2 ${b.balance_native < 0 ? "text-red-700" : "text-gray-600"}`}>
                              {formatMoney(b.balance_native, b.primary_currency)}
                            </td>
                            <td className={`px-4 py-2 font-medium ${b.balance_lkr < 0 ? "text-red-700" : "text-gray-900"}`}>
                              {formatMoney(b.balance_lkr)}
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
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Log a transfer</h2>
        <CashTransferForm entities={entities} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Transfer history</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {transfers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No transfers recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">From</th>
                  <th className="px-4 py-2">To</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">LKR equiv.</th>
                  <th className="px-4 py-2">Receipt</th>
                  <th className="px-4 py-2">LC Doc</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t, i) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-600">{t.transfer_date}</td>
                    <td className="px-4 py-2 text-gray-600">{t.source_entity?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{t.destination_entity?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{TRANSFER_METHOD_LABEL[t.method]}</td>
                    <td className="px-4 py-2 text-gray-900">{formatMoney(t.amount, t.currency)}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {t.currency === "LKR" ? "—" : formatMoney(t.amount_lkr)}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {receiptUrls[i] ? (
                        <a href={receiptUrls[i]!} target="_blank" rel="noopener noreferrer" className="text-gray-900 underline">
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {lcDocUrls[i] ? (
                        <a href={lcDocUrls[i]!} target="_blank" rel="noopener noreferrer" className="text-gray-900 underline">
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <EntityDeleteButton
                        what="this transfer"
                        table="cash_transfers"
                        id={t.id}
                        filesToDelete={[
                          ...(t.receipt_path ? [{ bucket: "receipt-attachments", path: t.receipt_path }] : []),
                          ...(t.lc_document_path
                            ? [{ bucket: "receipt-attachments", path: t.lc_document_path }]
                            : []),
                        ]}
                      />
                    </td>
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
