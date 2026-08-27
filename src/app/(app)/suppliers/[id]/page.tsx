import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl, getSignedUrl } from "@/lib/storage";
import {
  ADVANCE_TYPE_LABEL,
  formatMoney,
  VEHICLE_STATUS_LABEL,
  type Supplier,
  type SupplierAdvance,
  type SupplierBalance,
  type Vehicle,
} from "@/lib/types";
import SupplierAdvanceForm from "@/components/SupplierAdvanceForm";
import EntityDeleteButton from "@/components/EntityDeleteButton";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [supplierRes, balanceRes, advancesRes, vehiclesRes] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).single(),
    supabase.from("supplier_balance").select("*").eq("supplier_id", id).maybeSingle(),
    supabase.from("supplier_advances").select("*").eq("supplier_id", id).order("transfer_date", { ascending: false }),
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
  const balance = balanceRes.data as SupplierBalance | null;
  const advances = (advancesRes.data ?? []) as SupplierAdvance[];
  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];
  const logoUrl = supplier.logo_path ? getPublicUrl(supabase, "supplier-logos", supplier.logo_path) : null;
  const receiptUrls = await Promise.all(
    advances.map((a) =>
      a.receipt_path ? getSignedUrl(supabase, "receipt-attachments", a.receipt_path) : Promise.resolve(null),
    ),
  );
  const lcDocUrls = await Promise.all(
    advances.map((a) =>
      a.lc_document_path ? getSignedUrl(supabase, "receipt-attachments", a.lc_document_path) : Promise.resolve(null),
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
            restrictHint={`Can't delete — ${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"} still reference this supplier. Remove or reassign them first.`}
            redirectTo="/suppliers"
            size="md"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          In {supplier.primary_currency}
        </p>
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            label="Total deposits"
            value={formatMoney(balance?.total_deposits_native ?? 0, supplier.primary_currency)}
          />
          <SummaryCard
            label="Deducted (LC/TT)"
            value={formatMoney(balance?.total_deducted_native ?? 0, supplier.primary_currency)}
          />
          <SummaryCard
            label="Refunds"
            value={formatMoney(balance?.total_refunds_native ?? 0, supplier.primary_currency)}
          />
          <SummaryCard
            label="Available balance"
            value={formatMoney(balance?.available_balance_native ?? 0, supplier.primary_currency)}
            highlight={(balance?.available_balance_native ?? 0) < 0}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">In LKR (all currencies)</p>
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard label="Total deposits" value={formatMoney(balance?.total_deposits_lkr ?? 0)} />
          <SummaryCard label="Deducted (LC/TT)" value={formatMoney(balance?.total_deducted_lkr ?? 0)} />
          <SummaryCard label="Refunds" value={formatMoney(balance?.total_refunds_lkr ?? 0)} />
          <SummaryCard
            label="Available balance"
            value={formatMoney(balance?.available_balance_lkr ?? 0)}
            highlight={(balance?.available_balance_lkr ?? 0) < 0}
          />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Log an advance transfer or refund</h2>
        <SupplierAdvanceForm supplierId={supplier.id} defaultCurrency={supplier.primary_currency} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Transfer history</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {advances.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No transfers recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Bank reference</th>
                  <th className="px-4 py-2">Rate to LKR</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">LKR equiv.</th>
                  <th className="px-4 py-2">Receipt</th>
                  <th className="px-4 py-2">LC Doc</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {advances.map((a, i) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-600">{a.transfer_date}</td>
                    <td className="px-4 py-2 text-gray-600">{ADVANCE_TYPE_LABEL[a.type]}</td>
                    <td className="px-4 py-2 text-gray-600">{a.bank_reference ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{a.exchange_rate_to_lkr}</td>
                    <td className="px-4 py-2 text-gray-900">{formatMoney(a.amount, a.currency)}</td>
                    <td className="px-4 py-2 text-gray-600">{formatMoney(a.amount_lkr)}</td>
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
                        table="supplier_advances"
                        id={a.id}
                        filesToDelete={[
                          ...(a.receipt_path ? [{ bucket: "receipt-attachments", path: a.receipt_path }] : []),
                          ...(a.lc_document_path
                            ? [{ bucket: "receipt-attachments", path: a.lc_document_path }]
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
                      {v.make} {v.vehicle_models?.name}
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
