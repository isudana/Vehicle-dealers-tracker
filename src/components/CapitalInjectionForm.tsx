"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES } from "@/lib/types";

export default function CapitalInjectionForm() {
  const router = useRouter();
  const supabase = createClient();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("LKR");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [storageLocation, setStorageLocation] = useState("");
  const [source, setSource] = useState("");
  const [injectionDate, setInjectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleCurrencyChange(value: string) {
    setCurrency(value);
    if (value === "LKR") setExchangeRate("1");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("capital_injections").insert({
      amount: Number(amount),
      currency,
      exchange_rate_to_lkr: currency === "LKR" ? 1 : Number(exchangeRate),
      storage_location: storageLocation,
      source: source || null,
      injection_date: injectionDate,
      created_by: userData.user?.id,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setAmount("");
    setStorageLocation("");
    setSource("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
      <Field label="Date">
        <input
          type="date"
          value={injectionDate}
          onChange={(e) => setInjectionDate(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Amount">
        <input
          type="number"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input w-28"
        />
      </Field>
      <Field label="Currency">
        <select value={currency} onChange={(e) => handleCurrencyChange(e.target.value)} className="input">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Rate to LKR">
        <input
          type="number"
          step="0.000001"
          required
          disabled={currency === "LKR"}
          value={exchangeRate}
          onChange={(e) => setExchangeRate(e.target.value)}
          className="input w-24 disabled:bg-gray-100 disabled:text-gray-400"
        />
      </Field>
      <Field label="Stored in">
        <input
          type="text"
          required
          placeholder="e.g. Commercial Bank - 001, Cash in hand"
          value={storageLocation}
          onChange={(e) => setStorageLocation(e.target.value)}
          className="input w-56"
        />
      </Field>
      <Field label="Source">
        <input
          type="text"
          placeholder="e.g. Owner, Investor"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="input"
        />
      </Field>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Log capital"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}
