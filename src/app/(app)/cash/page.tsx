import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/auth";
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
import Modal from "@/components/Modal";

const CASH_ENTITY_CATEGORIES: CashEntityCategory[] = ["CASH_ACCOUNT", "CASH_ENTITY", "INVESTOR", "LEASING_COMPANY"];

export default async function CashPage() {
  const profile = await getCurrentUserProfile();
  const supabase = await createClient();
  const [entitiesRes, balancesRes, transfersRes, pendingSalesRes] = await Promise.all([
    supabase.from("cash_entities").select("*").order("name"),
    supabase.from("cash_entity_balance").select("*").order("type").order("name"),
    supabase
      .from("cash_transfers")
      .select("*, source_entity:source_entity_id(*), destination_entity:destination_entity_id(*)")
      .order("transfer_date", { ascending: false })
      .limit(200),
    supabase.from("sales").select("leasing_company_id").eq("leasing_status", "PENDING"),
  ]);

  const entities = (entitiesRes.data ?? []) as CashEntity[];
  const balances = (balancesRes.data ?? []) as CashEntityBalance[];
  const transfers = (transfersRes.data ?? []) as CashTransfer[];
  const pendingCountByLeasingCompanyId: Record<string, number> = {};
  for (const s of (pendingSalesRes.data ?? []) as { leasing_company_id: string | null }[]) {
    if (!s.leasing_company_id) continue;
    pendingCountByLeasingCompanyId[s.leasing_company_id] = (pendingCountByLeasingCompanyId[s.leasing_company_id] ?? 0) + 1;
  }

  const chassisByCashTransferId: Record<string, string> = {};
  if (transfers.length > 0) {
    const transferIds = transfers.map((t) => t.id);
    const [vehicleExpensesRes, saleReceiptsRes] = await Promise.all([
      supabase.from("vehicle_expenses").select("cash_transfer_id, chassis_number").in("cash_transfer_id", transferIds),
      supabase.from("sale_receipts").select("cash_transfer_id, sales(chassis_number)").in("cash_transfer_id", transferIds),
    ]);
    for (const ve of (vehicleExpensesRes.data ?? []) as { cash_transfer_id: string; chassis_number: string }[]) {
      chassisByCashTransferId[ve.cash_transfer_id] = ve.chassis_number;
    }
    for (const sr of (saleReceiptsRes.data ?? []) as {
      cash_transfer_id: string;
      sales: { chassis_number: string }[] | null;
    }[]) {
      const chassisNumber = sr.sales?.[0]?.chassis_number;
      if (sr.cash_transfer_id && chassisNumber) {
        chassisByCashTransferId[sr.cash_transfer_id] = chassisNumber;
      }
    }
  }

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
        <div className="flex items-center gap-4">
          {profile?.role === "ADMIN" && (
            <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-800">
              + Add cash entity (Settings)
            </Link>
          )}
          <Modal triggerLabel="+ Log a transfer" title="Log a transfer">
            <CashTransferForm entities={entities} />
          </Modal>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-900">Entity balances</h2>
        {CASH_ENTITY_CATEGORIES.map((category) => {
          const categoryBalances = balances.filter((b) => b.category === category);
          const balanceLabel = category === "CASH_ENTITY" ? "Cash Paid" : "Balance";
          const isLeasing = category === "LEASING_COMPANY";
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
                        {isLeasing ? (
                          <th className="px-4 py-2">Pending Settlements</th>
                        ) : (
                          <>
                            <th className="px-4 py-2">{balanceLabel} (native)</th>
                            <th className="px-4 py-2">{balanceLabel} (LKR)</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {categoryBalances.map((b) => {
                        const logoUrl = b.logo_path ? getPublicUrl(supabase, "cash-entity-logos", b.logo_path) : null;
                        const href = b.supplier_id ? `/suppliers/${b.supplier_id}` : `/cash/${b.entity_id}`;
                        const pendingCount = pendingCountByLeasingCompanyId[b.entity_id] ?? 0;
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
                            {isLeasing ? (
                              <td className="px-4 py-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                    pendingCount > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                                  }`}
                                >
                                  {pendingCount}
                                </span>
                              </td>
                            ) : (
                              <>
                                <td className={`px-4 py-2 ${b.balance_native < 0 ? "text-red-700" : "text-gray-600"}`}>
                                  {formatMoney(b.balance_native, b.primary_currency)}
                                </td>
                                <td className={`px-4 py-2 font-medium ${b.balance_lkr < 0 ? "text-red-700" : "text-gray-900"}`}>
                                  {formatMoney(b.balance_lkr)}
                                </td>
                              </>
                            )}
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
                  <th className="px-4 py-2">Vehicle</th>
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
                    <td className="px-4 py-2 text-gray-600">
                      {chassisByCashTransferId[t.id] ? (
                        <Link
                          href={`/vehicles/${encodeURIComponent(chassisByCashTransferId[t.id])}`}
                          className="text-gray-900 hover:underline"
                        >
                          {chassisByCashTransferId[t.id]}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
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
