import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl, getSignedUrl } from "@/lib/storage";
import {
  CASH_ENTITY_CATEGORY_LABEL,
  CASH_ENTITY_TYPE_LABEL,
  TRANSFER_METHOD_LABEL,
  formatMoney,
  type CashEntity,
  type CashEntityBalance,
  type CashTransfer,
  type Sale,
} from "@/lib/types";
import CashEntityEditForm from "@/components/CashEntityEditForm";
import EntityDeleteButton from "@/components/EntityDeleteButton";

export default async function CashEntityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [entityRes, balanceRes, transfersRes] = await Promise.all([
    supabase.from("cash_entities").select("*").eq("id", id).single(),
    supabase.from("cash_entity_balance").select("*").eq("entity_id", id).maybeSingle(),
    supabase
      .from("cash_transfers")
      .select("*, source_entity:source_entity_id(*), destination_entity:destination_entity_id(*)")
      .or(`source_entity_id.eq.${id},destination_entity_id.eq.${id}`)
      .order("transfer_date", { ascending: false }),
  ]);

  if (entityRes.error || !entityRes.data) {
    notFound();
  }

  const entity = entityRes.data as CashEntity;
  const balance = balanceRes.data as CashEntityBalance | null;
  const transfers = (transfersRes.data ?? []) as CashTransfer[];
  const logoUrl = entity.logo_path ? getPublicUrl(supabase, "cash-entity-logos", entity.logo_path) : null;

  let pendingSettlements: Sale[] = [];
  if (entity.category === "LEASING_COMPANY") {
    const { data } = await supabase
      .from("sales")
      .select("*, customers(*), vehicles(*, vehicle_models(*))")
      .eq("leasing_company_id", entity.id)
      .eq("leasing_status", "PENDING")
      .order("sale_date", { ascending: false });
    pendingSettlements = (data ?? []) as Sale[];
  }

  const receiptUrls = await Promise.all(
    transfers.map((t) => (t.receipt_path ? getSignedUrl(supabase, "receipt-attachments", t.receipt_path) : Promise.resolve(null))),
  );
  const lcDocUrls = await Promise.all(
    transfers.map((t) =>
      t.lc_document_path ? getSignedUrl(supabase, "receipt-attachments", t.lc_document_path) : Promise.resolve(null),
    ),
  );

  const balanceLabel = entity.category === "CASH_ENTITY" ? "Cash Paid" : "Balance";

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-14 w-14 rounded-md border border-gray-200 object-cover" />
        )}
        <div className="flex flex-1 items-start justify-between">
          <div>
            <Link href="/cash" className="text-sm text-gray-500 hover:text-gray-800">
              ← Back to cash
            </Link>
            <h1 className="mt-2 text-lg font-semibold text-gray-900">{entity.name}</h1>
            <p className="text-sm text-gray-500">
              {CASH_ENTITY_CATEGORY_LABEL[entity.category]} · {CASH_ENTITY_TYPE_LABEL[entity.type]} ·{" "}
              {entity.primary_currency}
            </p>
          </div>
          <EntityDeleteButton
            what={`entity "${entity.name}"`}
            table="cash_entities"
            id={entity.id}
            filesToDelete={entity.logo_path ? [{ bucket: "cash-entity-logos", path: entity.logo_path }] : []}
            restrictHint="Can't delete — this entity has transfer history. Remove those transfers first."
            redirectTo="/cash"
            size="md"
          />
        </div>
      </div>

      <CashEntityEditForm entityId={entity.id} name={entity.name} primaryCurrency={entity.primary_currency} />

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          In {entity.primary_currency}
        </p>
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard label="Total in" value={formatMoney(balance?.total_in_native ?? 0, entity.primary_currency)} />
          <SummaryCard label="Total out" value={formatMoney(balance?.total_out_native ?? 0, entity.primary_currency)} />
          <SummaryCard
            label={balanceLabel}
            value={formatMoney(balance?.balance_native ?? 0, entity.primary_currency)}
            highlight={(balance?.balance_native ?? 0) < 0}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">In LKR (all currencies)</p>
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard label="Total in" value={formatMoney(balance?.total_in_lkr ?? 0)} />
          <SummaryCard label="Total out" value={formatMoney(balance?.total_out_lkr ?? 0)} />
          <SummaryCard
            label={balanceLabel}
            value={formatMoney(balance?.balance_lkr ?? 0)}
            highlight={(balance?.balance_lkr ?? 0) < 0}
          />
        </div>
      </div>

      {entity.category === "LEASING_COMPANY" && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-gray-900">Pending settlements</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {pendingSettlements.length}
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {pendingSettlements.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">No pending settlements.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="px-4 py-2">Sale date</th>
                    <th className="px-4 py-2">Vehicle</th>
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2">Approved amount</th>
                    <th className="px-4 py-2">RO status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingSettlements.map((s) => (
                    <tr key={s.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-600">{s.sale_date}</td>
                      <td className="px-4 py-2 text-gray-600">
                        <Link
                          href={`/vehicles/${encodeURIComponent(s.chassis_number)}`}
                          className="text-gray-900 hover:underline"
                        >
                          {s.vehicles?.year ? `${s.vehicles.year} ` : ""}
                          {s.vehicles?.vehicle_models?.make} {s.vehicles?.vehicle_models?.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{s.customers?.full_name}</td>
                      <td className="px-4 py-2 text-gray-900">{formatMoney(s.leasing_amount_approved)}</td>
                      <td className="px-4 py-2 text-gray-600">{s.release_order_status ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

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
                  <th className="px-4 py-2">Bank reference</th>
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
                    <td className="px-4 py-2 text-gray-600">{t.bank_reference ?? "—"}</td>
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

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${highlight ? "text-red-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
