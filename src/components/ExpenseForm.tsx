"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ExpenseCategory, Supplier } from "@/lib/types";

export default function ExpenseForm({
  carId,
  categories,
  suppliers,
}: {
  carId: string;
  categories: ExpenseCategory[];
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("expenses").insert({
      car_id: carId,
      category_id: categoryId || null,
      supplier_id: supplierId || null,
      amount: Number(amount),
      expense_date: expenseDate,
      description: description || null,
      created_by: userData.user?.id,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setAmount("");
    setDescription("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-6 gap-2 rounded-md border border-gray-200 p-3">
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="input col-span-1"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={supplierId}
        onChange={(e) => setSupplierId(e.target.value)}
        className="input col-span-1"
      >
        <option value="">No supplier</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={expenseDate}
        onChange={(e) => setExpenseDate(e.target.value)}
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
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="input col-span-1"
      />
      <button
        type="submit"
        disabled={saving}
        className="col-span-1 rounded-md bg-gray-900 px-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Add expense"}
      </button>
      {error && <p className="col-span-6 text-sm text-red-600">{error}</p>}
    </form>
  );
}
