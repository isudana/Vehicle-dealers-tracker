"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewCustomerPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [nicPassport, setNicPassport] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data, error } = await supabase
      .from("customers")
      .insert({
        full_name: fullName,
        nic_passport: nicPassport,
        phone,
        address: address || null,
        email: email || null,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(`/customers/${data.id}`);
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Add a customer</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Full name</span>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">NIC / Passport</span>
          <input
            required
            value={nicPassport}
            onChange={(e) => setNicPassport(e.target.value)}
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Phone</span>
          <input required value={phone} onChange={(e) => setPhone(e.target.value)} className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Address</span>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="input mt-1" rows={2} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1" />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save customer"}
        </button>
      </form>
    </div>
  );
}
