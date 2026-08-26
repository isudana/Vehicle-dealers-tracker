"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function MarkReceivedButton({ chassisNumber }: { chassisNumber: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("vehicles")
      .update({ vehicle_status: "IN_STOCK" })
      .eq("chassis_number", chassisNumber);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={saving}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Mark received (port cleared)"}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
