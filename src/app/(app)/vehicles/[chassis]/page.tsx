import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl, getSignedUrl } from "@/lib/storage";
import {
  formatMoney,
  VEHICLE_STATUS_LABEL,
  SPARE_KEY_STATUS_LABEL,
  RECEIPT_METHOD_LABEL,
  TRANSFER_METHOD_LABEL,
  type CashEntity,
  type Supplier,
  type Vehicle,
  type VehicleDocument,
  type VehicleExpense,
  type VehicleModel,
  type VehiclePhoto,
  type VehiclePnl,
  type Sale,
  type SaleReceipt,
  type Customer,
} from "@/lib/types";
import VehicleExpenseForm from "@/components/VehicleExpenseForm";
import VehiclePhotoUploader from "@/components/VehiclePhotoUploader";
import VehicleDocumentUploader from "@/components/VehicleDocumentUploader";
import VehicleEditForm from "@/components/VehicleEditForm";
import SaleForm from "@/components/SaleForm";
import SaleLeasingEditForm from "@/components/SaleLeasingEditForm";
import ReceiptForm from "@/components/ReceiptForm";
import GenerateInvoiceButton from "@/components/GenerateInvoiceButton";
import MarkReceivedButton from "@/components/MarkReceivedButton";
import EntityDeleteButton from "@/components/EntityDeleteButton";
import DeleteVehicleButton from "@/components/DeleteVehicleButton";
import Modal from "@/components/Modal";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ chassis: string }>;
}) {
  const { chassis } = await params;
  const chassisNumber = decodeURIComponent(chassis);
  const supabase = await createClient();

  const [
    vehicleRes,
    pnlRes,
    expensesRes,
    costHeadsRes,
    saleRes,
    customersRes,
    photosRes,
    documentsRes,
    entitiesRes,
    suppliersRes,
    modelsRes,
  ] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*, suppliers(*), vehicle_models(*)")
      .eq("chassis_number", chassisNumber)
      .single(),
    supabase.from("vehicle_pnl").select("*").eq("chassis_number", chassisNumber).single(),
    supabase
      .from("vehicle_expenses")
      .select("*, cost_heads(*), cash_transfers(*, source_entity:source_entity_id(*), destination_entity:destination_entity_id(*))")
      .eq("chassis_number", chassisNumber),
    supabase.from("cost_heads").select("*").order("group_name"),
    supabase
      .from("sales")
      .select("*, customers(*), leasing_company:leasing_company_id(*)")
      .eq("chassis_number", chassisNumber)
      .maybeSingle(),
    supabase.from("customers").select("*").order("full_name"),
    supabase
      .from("vehicle_photos")
      .select("*")
      .eq("chassis_number", chassisNumber)
      .order("created_at", { ascending: false }),
    supabase
      .from("vehicle_documents")
      .select("*")
      .eq("chassis_number", chassisNumber)
      .order("created_at", { ascending: false }),
    supabase.from("cash_entities").select("*").order("name"),
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("vehicle_models").select("*").order("make").order("name"),
  ]);

  if (vehicleRes.error || !vehicleRes.data) {
    notFound();
  }

  const vehicle = vehicleRes.data as Vehicle;
  const pnl = pnlRes.data as VehiclePnl | null;
  const expenses = ((expensesRes.data ?? []) as VehicleExpense[]).sort((a, b) =>
    (b.cash_transfers?.transfer_date ?? "").localeCompare(a.cash_transfers?.transfer_date ?? ""),
  );
  const costHeads = costHeadsRes.data ?? [];
  const sale = saleRes.data as Sale | null;
  const customers = (customersRes.data ?? []) as Customer[];
  const photos = (photosRes.data ?? []) as VehiclePhoto[];
  const photoUrls = photos.map((p) => getPublicUrl(supabase, "vehicle-photos", p.storage_path));
  const documents = (documentsRes.data ?? []) as VehicleDocument[];
  const documentUrls = await Promise.all(
    documents.map((d) => getSignedUrl(supabase, "vehicle-documents", d.storage_path)),
  );
  const entities = (entitiesRes.data ?? []) as CashEntity[];
  const supplierAccount = entities.find(
    (e) => e.supplier_id === vehicle.supplier_id && e.category === "CASH_ACCOUNT",
  );
  const supplierEntity = entities.find(
    (e) => e.supplier_id === vehicle.supplier_id && e.category === "CASH_ENTITY",
  );
  const suppliers = (suppliersRes.data ?? []) as Supplier[];
  const models = (modelsRes.data ?? []) as VehicleModel[];
  const leasingCompanies = entities.filter((e) => e.category === "LEASING_COMPANY");
  const customerPaymentsEntity = entities.find((e) => e.name === "Customer Payments");
  const accountOptions = entities.filter(
    (e) => e.category === "CASH_ACCOUNT" && e.id !== customerPaymentsEntity?.id,
  );

  const expenseAttachmentUrls = await Promise.all(
    expenses.map((e) =>
      e.cash_transfers?.receipt_path
        ? getSignedUrl(supabase, "receipt-attachments", e.cash_transfers.receipt_path)
        : Promise.resolve(null),
    ),
  );

  let receipts: SaleReceipt[] = [];
  let invoiceIdByReceiptId: Record<string, string> = {};
  if (sale) {
    const [receiptsRes, invoicesRes] = await Promise.all([
      supabase
        .from("sale_receipts")
        .select("*")
        .eq("sale_id", sale.id)
        .order("received_date", { ascending: false }),
      supabase.from("invoices").select("id, sale_receipt_id").eq("chassis_number", chassisNumber),
    ]);
    receipts = (receiptsRes.data ?? []) as SaleReceipt[];
    invoiceIdByReceiptId = Object.fromEntries(
      ((invoicesRes.data ?? []) as { id: string; sale_receipt_id: string }[]).map((inv) => [
        inv.sale_receipt_id,
        inv.id,
      ]),
    );
  }

  const profit = pnl?.net_profit ?? pnl?.projected_profit ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/vehicles" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to vehicles
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">
            {vehicle.year ? `${vehicle.year} ` : ""}
            {vehicle.vehicle_models?.make} {vehicle.vehicle_models?.name}
          </h1>
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
            {VEHICLE_STATUS_LABEL[vehicle.vehicle_status]}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Chassis: {vehicle.chassis_number} · Supplier: {vehicle.suppliers?.name ?? "—"}
            {vehicle.color ? ` · ${vehicle.color}` : ""}
          </p>
          <DeleteVehicleButton
            chassisNumber={vehicle.chassis_number}
            saleId={sale?.id ?? null}
            photoPaths={photos.map((p) => p.storage_path)}
            documentPaths={documents.map((d) => d.storage_path)}
            expenseCashTransferIds={expenses.map((e) => e.cash_transfer_id)}
            expenseReceiptPaths={expenses.flatMap((e) =>
              e.cash_transfers?.receipt_path ? [e.cash_transfers.receipt_path] : [],
            )}
          />
        </div>
      </div>

      {vehicle.vehicle_status === "BOUGHT_NOT_RECEIVED" && (
        <MarkReceivedButton chassisNumber={vehicle.chassis_number} />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Photos</h2>
        {photoUrls.length > 0 && (
          <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
            {photoUrls.map((url, i) => (
              <div key={photos[i].id} className="space-y-1">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="aspect-square w-full rounded-md border border-gray-200 object-cover"
                  />
                </a>
                <EntityDeleteButton
                  what="this photo"
                  table="vehicle_photos"
                  id={photos[i].id}
                  filesToDelete={[{ bucket: "vehicle-photos", path: photos[i].storage_path }]}
                />
              </div>
            ))}
          </div>
        )}
        <VehiclePhotoUploader chassisNumber={vehicle.chassis_number} />
      </section>

      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Total landed cost" value={formatMoney(pnl?.total_landed_cost ?? 0)} />
        <SummaryCard
          label={sale ? "Agreed sale price" : "Target listing price"}
          value={formatMoney(sale ? pnl?.agreed_sale_price ?? 0 : vehicle.target_listing_price)}
        />
        <SummaryCard
          label="Balance due"
          value={pnl?.balance_due != null ? formatMoney(pnl.balance_due) : "—"}
          tone={pnl?.balance_due != null && pnl.balance_due > 0 ? "negative" : undefined}
        />
        <SummaryCard
          label={sale ? "Net profit" : "Projected profit"}
          value={profit != null ? formatMoney(profit) : "—"}
          tone={profit != null ? (profit >= 0 ? "positive" : "negative") : undefined}
        />
      </div>

      {pnl?.profit_margin_percent != null && (
        <p className="text-sm text-gray-500">ROI: {pnl.profit_margin_percent}%</p>
      )}

      <section className="space-y-2">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>
            Auction (FOB) price:{" "}
            <span className="text-gray-900">
              {vehicle.auction_price != null
                ? formatMoney(vehicle.auction_price, vehicle.auction_price_currency)
                : "—"}
            </span>
          </span>
          <span>
            CIF price:{" "}
            <span className="text-gray-900">
              {vehicle.cif_price != null ? formatMoney(vehicle.cif_price, vehicle.cif_price_currency) : "—"}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <span>
            Auction purchase date: <span className="text-gray-900">{vehicle.purchase_date ?? "—"}</span>
          </span>
          <span>
            LC open date: <span className="text-gray-900">{vehicle.lc_open_date ?? "—"}</span>
          </span>
          <span>
            Landed date: <span className="text-gray-900">{vehicle.landed_date ?? "—"}</span>
          </span>
          <span>
            Cleared date: <span className="text-gray-900">{vehicle.cleared_date ?? "—"}</span>
          </span>
          <span>
            Spare key: <span className="text-gray-900">{SPARE_KEY_STATUS_LABEL[vehicle.spare_key_status]}</span>
          </span>
        </div>
        <VehicleEditForm vehicle={vehicle} suppliers={suppliers} models={models} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Documents</h2>
        {documents.length > 0 && (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
            {documents.map((d, i) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-2">
                <span className="text-gray-700">{d.file_name}</span>
                <div className="flex items-center gap-3">
                  {documentUrls[i] ? (
                    <a
                      href={documentUrls[i]!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-900 underline"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                  <EntityDeleteButton
                    what="this document"
                    table="vehicle_documents"
                    id={d.id}
                    filesToDelete={[{ bucket: "vehicle-documents", path: d.storage_path }]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <VehicleDocumentUploader chassisNumber={vehicle.chassis_number} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-900">Cost ledger</h2>
          <Modal triggerLabel="+ Add expense" title="Add expense">
            <VehicleExpenseForm
              chassisNumber={vehicle.chassis_number}
              costHeads={costHeads}
              entities={entities}
              supplierAccountId={supplierAccount?.id}
              supplierEntityId={supplierEntity?.id}
            />
          </Modal>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {expenses.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No expenses recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Cost head</th>
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
                    <td className="px-4 py-2 text-gray-600">
                      {e.cost_heads?.name ?? "—"}
                      <span className="ml-1 text-xs text-gray-400">({e.cost_heads?.group_name})</span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{ct?.source_entity?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{ct?.destination_entity?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{ct ? TRANSFER_METHOD_LABEL[ct.method] : "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{e.remarks ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-900">{ct ? formatMoney(ct.amount, ct.currency) : "—"}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {ct && ct.currency !== "LKR" ? formatMoney(ct.amount_lkr) : "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {expenseAttachmentUrls[i] ? (
                        <a
                          href={expenseAttachmentUrls[i]!}
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
                      <EntityDeleteButton what="this expense" table="cash_transfers" id={e.cash_transfer_id} />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Sale</h2>
        {!sale ? (
          <SaleForm chassisNumber={vehicle.chassis_number} customers={customers} leasingCompanies={leasingCompanies} />
        ) : (
          <div className="space-y-3">
            {vehicle.vehicle_status === "BOUGHT_NOT_RECEIVED" && (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
                Reserved — this vehicle isn&apos;t in stock yet. It&apos;ll move to Sold once it lands.
              </p>
            )}
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
              <div className="flex items-start justify-between">
                <p>
                  <span className="font-medium">{sale.customers?.full_name}</span> ({sale.customers?.nic_passport}) ·{" "}
                  {sale.customers?.phone}
                </p>
                <EntityDeleteButton what="this sale (and its receipts)" table="sales" id={sale.id} />
              </div>
              <p className="mt-1 text-gray-600">
                Payment type: {sale.payment_type} · Sale date: {sale.sale_date}
              </p>
              {sale.payment_type !== "DIRECT_CASH" && (
                <SaleLeasingEditForm sale={sale} leasingCompanies={leasingCompanies} />
              )}
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">Receipts</h3>
              <Modal triggerLabel="+ Record receipt" title="Record receipt">
                <ReceiptForm
                  saleId={sale.id}
                  leasingCompanyId={sale.leasing_company_id}
                  customerPaymentsEntityId={customerPaymentsEntity?.id}
                  accountOptions={accountOptions}
                />
              </Modal>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              {receipts.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500">No receipts recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Method</th>
                      <th className="px-4 py-2">Reference</th>
                      <th className="px-4 py-2">Amount</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-gray-600">{r.received_date}</td>
                        <td className="px-4 py-2 text-gray-600">{RECEIPT_METHOD_LABEL[r.payment_method]}</td>
                        <td className="px-4 py-2 text-gray-600">{r.reference ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-900">{formatMoney(r.amount)}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            {invoiceIdByReceiptId[r.id] ? (
                              <Link href={`/invoices/${invoiceIdByReceiptId[r.id]}`} className="text-gray-900 underline">
                                View Invoice
                              </Link>
                            ) : (
                              <GenerateInvoiceButton
                                saleReceiptId={r.id}
                                chassisNumber={chassisNumber}
                                defaultAmount={r.amount}
                              />
                            )}
                            <EntityDeleteButton what="this receipt" table="sale_receipts" id={r.id} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          tone === "positive" ? "text-green-700" : tone === "negative" ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
