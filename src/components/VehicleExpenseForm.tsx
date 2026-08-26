"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CostHead } from "@/lib/types";

export default function VehicleExpenseForm({
  chassisNumber,
  costHeads,
}: {
  chassisNumber: string;
  costHeads: CostHead[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [costHeadId, setCostHeadId] = useState(costHeads[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [dateRecorded, setDateRecorded] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const groups = Array.from(new Set(costHeads.map((c) => c.group_name)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("vehicle_expenses").insert({
      chassis_number: chassisNumber,
      cost_head_id: costHeadId,
      amount: Number(amount),
      date_recorded: dateRecorded,
      remarks: remarks || null,
      created_by: userData.user?.id,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setAmount("");
    setRemarks("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-5 gap-2 rounded-md border border-gray-200 p-3">
      <select value={costHeadId} onChange={(e) => setCostHeadId(e.target.value)} className="input col-span-1">
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {costHeads
              .filter((c) => c.group_name === group)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <input
        type="date"
        value={dateRecorded}
        onChange={(e) => setDateRecorded(e.target.value)}
        className="input col-span-1"
      />
      <input
        type="number"
        step="0.01"
        required
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="input col-span-1"
      />
      <input
        type="text"
        placeholder="Remarks"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        className="input col-span-1"
      />
      <button
        type="submit"
        disabled={saving}
        className="col-span-1 rounded-md bg-gray-900 px-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Add expense"}
      </button>
      {error && <p className="col-span-5 text-sm text-red-600">{error}</p>}
    </form>
  );
}
