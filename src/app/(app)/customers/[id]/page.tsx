import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Customer, type Sale } from "@/lib/types";
import EntityDeleteButton from "@/components/EntityDeleteButton";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [customerRes, salesRes] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).single(),
    supabase
      .from("sales")
      .select("*, vehicles(*, vehicle_models(*))")
      .eq("customer_id", id)
      .order("sale_date", { ascending: false }),
  ]);

  if (customerRes.error || !customerRes.data) {
    notFound();
  }

  const customer = customerRes.data as Customer;
  const sales = (salesRes.data ?? []) as Sale[];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/customers" className="text-sm text-gray-500 hover:text-gray-800">
            ← Back to customers
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-gray-900">{customer.full_name}</h1>
          <p className="text-sm text-gray-500">
            {customer.nic_passport} · {customer.phone}
            {customer.email ? ` · ${customer.email}` : ""}
          </p>
          {customer.address && <p className="text-sm text-gray-500">{customer.address}</p>}
        </div>
        <EntityDeleteButton
          what={`customer "${customer.full_name}"`}
          table="customers"
          id={customer.id}
          restrictHint={`Can't delete — ${sales.length} sale${sales.length === 1 ? "" : "s"} still reference this customer.`}
          redirectTo="/customers"
          size="md"
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Purchase history</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {sales.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No purchases yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Vehicle</th>
                  <th className="px-4 py-2">Payment type</th>
                  <th className="px-4 py-2">Agreed price</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
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
                    <td className="px-4 py-2 text-gray-600">{s.payment_type}</td>
                    <td className="px-4 py-2 text-gray-900">{formatMoney(s.agreed_sale_price)}</td>
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
