import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage";
import { getCurrentUserProfile } from "@/lib/auth";
import { formatMoney, type ModelSummary, type VehiclePnl } from "@/lib/types";
import VehicleSearchableTable from "@/components/VehicleSearchableTable";

export default async function VehiclesPage() {
  const profile = await getCurrentUserProfile();
  const supabase = await createClient();
  const [vehiclesRes, photosRes, modelSummaryRes] = await Promise.all([
    supabase.from("vehicle_pnl").select("*").order("chassis_number"),
    supabase.from("vehicle_photos").select("chassis_number, storage_path").order("created_at"),
    supabase.from("model_summary").select("*"),
  ]);
  const { data, error } = vehiclesRes;
  const vehicles = (data ?? []) as VehiclePnl[];
  const modelSummaries = (modelSummaryRes.data ?? []) as ModelSummary[];

  const photoUrlByChassis: Record<string, string> = {};
  for (const p of photosRes.data ?? []) {
    if (!photoUrlByChassis[p.chassis_number]) {
      photoUrlByChassis[p.chassis_number] = getPublicUrl(supabase, "vehicle-photos", p.storage_path);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Vehicles</h1>
        {profile?.role !== "VIEWER" && (
          <Link
            href="/vehicles/new"
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add vehicle
          </Link>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <VehicleSearchableTable vehicles={vehicles} photoUrlByChassis={photoUrlByChassis} />

      <ModelSummaryTable rows={modelSummaries} />
    </div>
  );
}

function ModelSummaryTable({ rows }: { rows: ModelSummary[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-900">By Model</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">No vehicles yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="px-4 py-2">Model</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Available</th>
              <th className="px-4 py-2">Pending payment</th>
              <th className="px-4 py-2">Sold</th>
              <th className="px-4 py-2">Landed cost</th>
              <th className="px-4 py-2">Realized profit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.model_id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-900">{m.model}</td>
                <td className="px-4 py-2 text-gray-600">{m.total_vehicles}</td>
                <td className="px-4 py-2 text-gray-600">{m.available_count}</td>
                <td className="px-4 py-2 text-gray-600">{m.pending_payment_count}</td>
                <td className="px-4 py-2 text-gray-600">{m.sold_count}</td>
                <td className="px-4 py-2 text-gray-600">{formatMoney(m.total_landed_cost)}</td>
                <td className="px-4 py-2 text-gray-600">{formatMoney(m.total_realized_profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
