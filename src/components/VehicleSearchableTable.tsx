"use client";

import { useState } from "react";
import Link from "next/link";
import {
  formatMoney,
  landedAgeTone,
  LANDED_AGE_TONE_CLASSES,
  VEHICLE_STATUS_LABEL,
  type VehiclePnl,
  type VehicleStatus,
} from "@/lib/types";

const STATE_ORDER: VehicleStatus[] = [
  "BOUGHT_NOT_RECEIVED",
  "IN_STOCK",
  "SOLD_PENDING_PAYMENT",
  "SOLD_FULLY_CLOSED",
];

export default function VehicleSearchableTable({
  vehicles,
  photoUrlByChassis,
}: {
  vehicles: VehiclePnl[];
  photoUrlByChassis: Record<string, string>;
}) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? vehicles.filter((v) =>
        [v.chassis_number, v.make, v.model]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(q)),
      )
    : vehicles;

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by chassis number, make, or model…"
        className="input w-full max-w-sm"
      />

      {vehicles.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">No vehicles yet.</p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">No vehicles match your search.</p>
      ) : (
        STATE_ORDER.map((status) => (
          <StatusTable
            key={status}
            title={VEHICLE_STATUS_LABEL[status]}
            rows={filtered.filter((v) => v.vehicle_status === status)}
            photoUrlByChassis={photoUrlByChassis}
            showLandedAge={status === "IN_STOCK"}
          />
        ))
      )}
    </div>
  );
}

function StatusTable({
  title,
  rows,
  photoUrlByChassis,
  showLandedAge,
}: {
  title: string;
  rows: VehiclePnl[];
  photoUrlByChassis: Record<string, string>;
  showLandedAge: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-900">
        {title} <span className="text-gray-400">({rows.length})</span>
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="px-4 py-2"></th>
            <th className="px-4 py-2">Chassis No.</th>
            <th className="px-4 py-2">Vehicle</th>
            {showLandedAge && <th className="px-4 py-2">Days since landed</th>}
            <th className="px-4 py-2">Landed cost</th>
            <th className="px-4 py-2">Sale price</th>
            <th className="px-4 py-2">Balance due</th>
            <th className="px-4 py-2">{rows[0]?.sale_id ? "Net profit" : "Projected profit"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const photoUrl = photoUrlByChassis[v.chassis_number];
            const profit = v.net_profit ?? v.projected_profit;
            const tone = landedAgeTone(v.days_since_landed);
            return (
              <tr key={v.chassis_number} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-gray-100" />
                  )}
                </td>
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
                  {v.vehicle_status === "BOUGHT_NOT_RECEIVED" && v.sale_id && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Reserved
                    </span>
                  )}
                </td>
                {showLandedAge && (
                  <td className="px-4 py-2">
                    {v.days_since_landed != null ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          tone ? LANDED_AGE_TONE_CLASSES[tone] : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {v.days_since_landed}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-2 text-gray-600">{formatMoney(v.total_landed_cost)}</td>
                <td className="px-4 py-2 text-gray-600">
                  {v.agreed_sale_price != null ? formatMoney(v.agreed_sale_price) : "—"}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {v.balance_due != null ? formatMoney(v.balance_due) : "—"}
                </td>
                <td
                  className={`px-4 py-2 font-medium ${
                    profit == null ? "text-gray-400" : profit >= 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {profit != null ? formatMoney(profit) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
