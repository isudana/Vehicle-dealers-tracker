"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function GenerateInvoiceButton({
  saleReceiptId,
  chassisNumber,
  defaultAmount,
}: {
  saleReceiptId: string;
  chassisNumber: string;
  defaultAmount: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSaving(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        sale_receipt_id: saleReceiptId,
        chassis_number: chassisNumber,
        invoiced_amount: defaultAmount,
        created_by: userData.user?.id,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error || !data) {
      setError(error?.message ?? "Failed to generate invoice");
      return;
    }

    router.push(`/invoices/${data.id}`);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={saving}
        className="text-gray-900 underline disabled:opacity-50"
      >
        {saving ? "…" : "Generate Invoice"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
