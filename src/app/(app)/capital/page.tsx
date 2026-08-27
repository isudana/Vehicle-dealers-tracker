import { createClient } from "@/lib/supabase/server";
import { formatMoney, type CapitalInjection } from "@/lib/types";
import CapitalInjectionForm from "@/components/CapitalInjectionForm";
import EntityDeleteButton from "@/components/EntityDeleteButton";

export default async function CapitalPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("capital_injections")
    .select("*")
    .order("injection_date", { ascending: false });

  const injections = (data ?? []) as CapitalInjection[];
  const totalLkr = injections.reduce((sum, i) => sum + i.amount_lkr, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Capital Injections</h1>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-2">
          <p className="text-xs text-gray-500">Total injected (LKR)</p>
          <p className="text-lg font-semibold text-gray-900">{formatMoney(totalLkr)}</p>
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <CapitalInjectionForm />

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {injections.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">No capital injections recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">LKR equiv.</th>
                <th className="px-4 py-2">Stored in</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {injections.map((i) => (
                <tr key={i.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-600">{i.injection_date}</td>
                  <td className="px-4 py-2 text-gray-900">{formatMoney(i.amount, i.currency)}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {i.currency === "LKR" ? "—" : formatMoney(i.amount_lkr)}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{i.storage_location}</td>
                  <td className="px-4 py-2 text-gray-600">{i.source ?? "—"}</td>
                  <td className="px-4 py-2">
                    <EntityDeleteButton what="this capital entry" table="capital_injections" id={i.id} />
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
