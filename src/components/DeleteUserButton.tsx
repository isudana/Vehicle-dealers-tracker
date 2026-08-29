"use client";

import DeleteButton from "@/components/DeleteButton";

export default function DeleteUserButton({ userId, what }: { userId: string; what: string }) {
  async function handleConfirm() {
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error ?? "Failed to delete user");
    }
  }

  return <DeleteButton what={what} onConfirm={handleConfirm} />;
}
