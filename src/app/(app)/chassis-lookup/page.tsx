"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChassisYearRange } from "@/lib/types";

type Result = {
  status: "MATCH" | "PROJECTED_2026" | "BEFORE_2024" | "GAP" | "NOT_FOUND";
  year: number | null;
  importable: boolean;
  makes: string | null;
  notes: string | null;
  message: string;
};

export default function ChassisLookupPage() {
  const supabase = createClient();
  const [chassisCode, setChassisCode] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const code = chassisCode.trim();
    const serial = Number(serialNumber.trim());

    if (!code) {
      setError("Enter a chassis code.");
      return;
    }
    if (!serialNumber.trim() || !Number.isFinite(serial)) {
      setError("Enter a valid numeric serial number.");
      return;
    }

    setLoading(true);
    const { data, error: queryError } = await supabase
      .from("chassis_year_ranges")
      .select("*")
      .ilike("chassis_code", code);
    setLoading(false);

    if (queryError) {
      setError(queryError.message);
      return;
    }

    const rows = (data ?? []) as ChassisYearRange[];
    setResult(evaluate(rows, serial));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Chassis Lookup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Look up a vehicle&apos;s manufacture year from its chassis code and serial number, based on
          official JAMA reference tables.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="block">
          <span className="block text-xs font-medium text-gray-500">Chassis Code</span>
          <input
            value={chassisCode}
            onChange={(e) => setChassisCode(e.target.value)}
            placeholder="e.g. MXAA54"
            className="input"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500">Serial Number</span>
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="e.g. 2040000"
            className="input"
          />
        </label>
        <div className="col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Looking up…" : "Look up"}
          </button>
        </div>
        {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
      </form>

      {result && (
        <div
          className={`rounded-lg border p-4 ${
            result.status === "MATCH" && result.importable
              ? "border-green-200 bg-green-50"
              : result.status === "PROJECTED_2026"
                ? "border-blue-200 bg-blue-50"
                : "border-red-200 bg-red-50"
          }`}
        >
          <p className="text-sm font-medium text-gray-900">{result.message}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600">
            {result.year != null && (
              <>
                <dt className="text-gray-400">Manufacture year</dt>
                <dd>{result.year}</dd>
              </>
            )}
            {result.makes && (
              <>
                <dt className="text-gray-400">Make(s)</dt>
                <dd>{result.makes}</dd>
              </>
            )}
            <dt className="text-gray-400">Import status</dt>
            <dd className={result.importable ? "font-medium text-green-700" : "font-medium text-red-700"}>
              {result.importable ? "Importable" : "Cannot import"}
            </dd>
            {result.notes && (
              <>
                <dt className="text-gray-400">Notes</dt>
                <dd>{result.notes}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

function evaluate(rows: ChassisYearRange[], serial: number): Result {
  if (rows.length === 0) {
    return {
      status: "NOT_FOUND",
      year: null,
      importable: false,
      makes: null,
      notes: null,
      message: "Chassis code not recognized.",
    };
  }

  const containing = rows.find((r) => serial >= r.range_start && serial <= r.range_end);
  if (containing) {
    const importable = containing.year >= 2024;
    return {
      status: "MATCH",
      year: containing.year,
      importable,
      makes: containing.makes,
      notes: containing.notes,
      message: importable
        ? `This chassis was manufactured in ${containing.year}.`
        : `This chassis was manufactured in ${containing.year} — predates 2024, cannot import.`,
    };
  }

  const rows2025 = rows.filter((r) => r.year === 2025);
  if (rows2025.length > 0) {
    const max2025 = Math.max(...rows2025.map((r) => r.range_end));
    if (serial > max2025) {
      const makes = Array.from(new Set(rows2025.map((r) => r.makes))).join(", ");
      return {
        status: "PROJECTED_2026",
        year: 2026,
        importable: true,
        makes,
        notes: null,
        message: "This serial is above the highest 2025 range for this model — projected as a 2026 vehicle.",
      };
    }
  }

  const earlyRows = rows.filter((r) => r.year <= 2024);
  if (earlyRows.length > 0) {
    const minEarly = Math.min(...earlyRows.map((r) => r.range_start));
    if (serial < minEarly) {
      return {
        status: "BEFORE_2024",
        year: null,
        importable: false,
        makes: null,
        notes: null,
        message: "This serial is below the lowest listed range for this model — predates 2024, cannot import.",
      };
    }
  }

  return {
    status: "GAP",
    year: null,
    importable: false,
    makes: null,
    notes: null,
    message: "Unrecognized serial — falls in a gap in the available data for this model.",
  };
}
