import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage";
import { RECEIPT_METHOD_LABEL, formatInvoiceNo, formatMoney, type AppSettings, type Invoice } from "@/lib/types";
import InvoiceEditForm from "@/components/InvoiceEditForm";
import PrintButton from "@/components/PrintButton";
import EntityDeleteButton from "@/components/EntityDeleteButton";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [invoiceRes, settingsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, sale_receipts(*, sales(*, customers(*))), vehicles(*, vehicle_models(*))")
      .eq("id", id)
      .single(),
    supabase.from("app_settings").select("*").eq("id", 1).single(),
  ]);

  if (invoiceRes.error || !invoiceRes.data) {
    notFound();
  }

  const invoice = invoiceRes.data as Invoice;
  const settings = settingsRes.data as AppSettings;
  const receipt = invoice.sale_receipts;
  const sale = receipt?.sales;
  const customer = sale?.customers;
  const vehicle = invoice.vehicles;
  const logoUrl = settings.logo_path ? getPublicUrl(supabase, "app-branding", settings.logo_path) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/vehicles/${encodeURIComponent(invoice.chassis_number)}`}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← Back to vehicle
        </Link>
        <div className="flex items-center gap-2">
          <PrintButton />
          <EntityDeleteButton
            what="this invoice"
            table="invoices"
            id={invoice.id}
            redirectTo={`/vehicles/${encodeURIComponent(invoice.chassis_number)}`}
          />
        </div>
      </div>

      <InvoiceEditForm
        invoiceId={invoice.id}
        invoicedAmount={invoice.invoiced_amount}
        issueDate={invoice.issue_date}
        notes={invoice.notes}
      />

      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-8 print:border-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-gray-200 pb-4">
          <div className="flex items-center gap-3">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-12 w-12 rounded object-cover" />
            )}
            <div>
              <p className="text-lg font-semibold text-gray-900">{settings.app_name}</p>
              {settings.address && <p className="text-sm text-gray-600">{settings.address}</p>}
              {(settings.phone || settings.email) && (
                <p className="text-sm text-gray-600">{[settings.phone, settings.email].filter(Boolean).join(" · ")}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-gray-900">INVOICE</p>
            <p className="text-sm text-gray-600">{formatInvoiceNo(invoice.invoice_no)}</p>
            <p className="text-sm text-gray-600">Date: {invoice.issue_date}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Bill to</p>
            <p className="mt-1 font-medium text-gray-900">{customer?.full_name ?? "—"}</p>
            <p className="text-gray-600">{customer?.nic_passport}</p>
            <p className="text-gray-600">{customer?.phone}</p>
            {customer?.email && <p className="text-gray-600">{customer.email}</p>}
            {customer?.address && <p className="text-gray-600">{customer.address}</p>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Vehicle</p>
            <p className="mt-1 font-medium text-gray-900">
              {vehicle?.year ? `${vehicle.year} ` : ""}
              {vehicle?.vehicle_models?.make} {vehicle?.vehicle_models?.name}
            </p>
            <p className="text-gray-600">Chassis: {vehicle?.chassis_number}</p>
            {sale && <p className="text-gray-600">Sale date: {sale.sale_date}</p>}
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-3 text-gray-700">
                Payment received — {receipt ? RECEIPT_METHOD_LABEL[receipt.payment_method] : "—"}
                {receipt?.received_date ? ` on ${receipt.received_date}` : ""}
                {receipt?.reference ? ` (Ref: ${receipt.reference})` : ""}
              </td>
              <td className="py-3 text-right text-gray-900">{formatMoney(invoice.invoiced_amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="py-3 text-right font-medium text-gray-900">Total</td>
              <td className="py-3 text-right text-lg font-semibold text-gray-900">
                {formatMoney(invoice.invoiced_amount)}
              </td>
            </tr>
          </tfoot>
        </table>

        {sale && <p className="mt-2 text-xs text-gray-400">Agreed sale price: {formatMoney(sale.agreed_sale_price)}</p>}

        {invoice.notes && <p className="mt-4 text-sm text-gray-600">{invoice.notes}</p>}

        <p className="mt-8 text-center text-sm text-gray-500">Thank you for your business.</p>
      </div>
    </div>
  );
}
