import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, VEHICLE_STATUS_LABEL, type VehiclePnl } from "@/lib/types";

export default async function VehiclesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("vehicle_pnl").select("*").order("chassis_number");
  const vehicles = (data ?? []) as VehiclePnl[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Vehicles</h1>
        <Link
          href="/vehicles/new"
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add vehicle
        </Link>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

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
                <th className="px-4 py-2">Landed cost</th>
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
                    {v.make} {v.model}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                      {VEHICLE_STATUS_LABEL[v.vehicle_status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{formatMoney(v.total_landed_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
