import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl, getSignedUrl } from "@/lib/storage";
import {
  TRANSFER_METHOD_LABEL,
  formatMoney,
  VEHICLE_STATUS_LABEL,
  type CashEntity,
  type CashEntityBalance,
  type CashTransfer,
  type Supplier,
  type Vehicle,
} from "@/lib/types";
import SupplierTransferForm from "@/components/SupplierTransferForm";
import EntityDeleteButton from "@/components/EntityDeleteButton";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [supplierRes, entitiesRes, vehiclesRes] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).single(),
    supabase.from("cash_entities").select("*").order("name"),
    supabase
      .from("vehicles")
      .select("*, vehicle_models(*)")
      .eq("supplier_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (supplierRes.error || !supplierRes.data) {
    notFound();
  }

  const supplier = supplierRes.data as Supplier;
  const entities = (entitiesRes.data ?? []) as CashEntity[];
  const supplierAccount = entities.find((e) => e.supplier_id === supplier.id && e.category === "CASH_ACCOUNT");
  const supplierEntity = entities.find((e) => e.supplier_id === supplier.id && e.category === "CASH_ENTITY");
  const otherEntities = entities.filter((e) => e.supplier_id !== supplier.id);
  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];
  const logoUrl = supplier.logo_path ? getPublicUrl(supabase, "supplier-logos", supplier.logo_path) : null;

  let balance: CashEntityBalance | null = null;
  let entityBalance: CashEntityBalance | null = null;
  let transfers: CashTransfer[] = [];
  if (supplierAccount && supplierEntity) {
    const [balanceRes, entityBalanceRes, transfersRes] = await Promise.all([
      supabase.from("cash_entity_balance").select("*").eq("entity_id", supplierAccount.id).maybeSingle(),
      supabase.from("cash_entity_balance").select("*").eq("entity_id", supplierEntity.id).maybeSingle(),
      supabase
        .from("cash_transfers")
        .select("*, source_entity:source_entity_id(*), destination_entity:destination_entity_id(*)")
        .or(
          `source_entity_id.in.(${supplierAccount.id},${supplierEntity.id}),destination_entity_id.in.(${supplierAccount.id},${supplierEntity.id})`,
        )
        .order("transfer_date", { ascending: false }),
    ]);
    balance = balanceRes.data as CashEntityBalance | null;
    entityBalance = entityBalanceRes.data as CashEntityBalance | null;
    transfers = (transfersRes.data ?? []) as CashTransfer[];
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
      <div className="flex items-start gap-4">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-14 w-14 rounded-md border border-gray-200 object-cover" />
        )}
        <div className="flex flex-1 items-start justify-between">
          <div>
            <Link href="/suppliers" className="text-sm text-gray-500 hover:text-gray-800">
              ← Back to suppliers
            </Link>
            <h1 className="mt-2 text-lg font-semibold text-gray-900">{supplier.name}</h1>
            <p className="text-sm text-gray-500">
              {supplier.country}
              {supplier.contact_person ? ` · ${supplier.contact_person}` : ""}
              {supplier.phone ? ` · ${supplier.phone}` : ""}
            </p>
          </div>
          <EntityDeleteButton
            what={`supplier "${supplier.name}"`}
            table="suppliers"
            id={supplier.id}
            filesToDelete={supplier.logo_path ? [{ bucket: "supplier-logos", path: supplier.logo_path }] : []}
            restrictHint={`Can't delete — ${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"} and/or transfer history still reference this supplier. Remove those first.`}
            redirectTo="/suppliers"
            size="md"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          Account balance — undrawn prepaid credit, in {supplier.primary_currency}
        </p>
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard label="Total in" value={formatMoney(balance?.total_in_native ?? 0, supplier.primary_currency)} />
          <SummaryCard label="Total out" value={formatMoney(balance?.total_out_native ?? 0, supplier.primary_currency)} />
          <SummaryCard
            label="Balance"
            value={formatMoney(balance?.balance_native ?? 0, supplier.primary_currency)}
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
            label="Balance"
            value={formatMoney(balance?.balance_lkr ?? 0)}
            highlight={(balance?.balance_lkr ?? 0) < 0}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          Total paid for vehicles (all time)
        </p>
        <div className="grid grid-cols-2 gap-4">
          <SummaryCard
            label={`In ${supplier.primary_currency}`}
            value={formatMoney(entityBalance?.balance_native ?? 0, supplier.primary_currency)}
          />
          <SummaryCard label="In LKR" value={formatMoney(entityBalance?.balance_lkr ?? 0)} />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Log a transfer with this supplier&rsquo;s account</h2>
        {supplierAccount ? (
          <SupplierTransferForm
            supplierAccountId={supplierAccount.id}
            defaultCurrency={supplier.primary_currency}
            otherEntities={otherEntities}
          />
        ) : (
          <p className="text-sm text-gray-500">Setting up this supplier&rsquo;s cash account…</p>
        )}
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

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-gray-900">Vehicles from this supplier</h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            {vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"} bought
          </span>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {vehicles.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No vehicles yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Chassis No.</th>
                  <th className="px-4 py-2">Vehicle</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.chassis_number} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-600">
                      <Link
                        href={`/vehicles/${encodeURIComponent(v.chassis_number)}`}
                        className="text-gray-900 hover:underline"
                      >
                        {v.chassis_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {v.year ? `${v.year} ` : ""}
                      {v.vehicle_models?.make} {v.vehicle_models?.name}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{VEHICLE_STATUS_LABEL[v.vehicle_status]}</td>
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
