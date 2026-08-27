"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteFile } from "@/lib/storage";
import DeleteButton from "@/components/DeleteButton";

export default function DeleteVehicleButton({
  chassisNumber,
  saleId,
  photoPaths,
  documentPaths,
  expenseCashTransferIds,
  expenseReceiptPaths,
}: {
  chassisNumber: string;
  saleId: string | null;
  photoPaths: string[];
  documentPaths: string[];
  expenseCashTransferIds: string[];
  expenseReceiptPaths: string[];
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleConfirm() {
    if (saleId) {
      const { error } = await supabase.from("sales").delete().eq("id", saleId);
      if (error) throw error;
    }

    for (const path of photoPaths) {
      try {
        await deleteFile(supabase, "vehicle-photos", path);
      } catch {
        // best-effort
      }
    }
    for (const path of documentPaths) {
      try {
        await deleteFile(supabase, "vehicle-documents", path);
      } catch {
        // best-effort
      }
    }
    for (const path of expenseReceiptPaths) {
      try {
        await deleteFile(supabase, "receipt-attachments", path);
      } catch {
        // best-effort
      }
    }

    if (expenseCashTransferIds.length > 0) {
      const { error } = await supabase.from("cash_transfers").delete().in("id", expenseCashTransferIds);
      if (error) throw error;
    }

    const { error } = await supabase.from("vehicles").delete().eq("chassis_number", chassisNumber);
    if (error) throw error;
  }

  return (
    <DeleteButton
      what={
        saleId
          ? `vehicle ${chassisNumber} — this also removes its sale, receipts, expenses, photos, and documents`
          : `vehicle ${chassisNumber} — this also removes its expenses, photos, and documents`
      }
      onConfirm={handleConfirm}
      onDeleted={() => router.push("/vehicles")}
      size="md"
    />
  );
}
