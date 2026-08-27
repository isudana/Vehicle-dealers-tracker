"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import type { AppSettings } from "@/lib/types";

export default function AppBrandingForm({ settings }: { settings: AppSettings }) {
  const router = useRouter();
  const supabase = createClient();
  const [appName, setAppName] = useState(settings.app_name);
  const [address, setAddress] = useState(settings.address ?? "");
  const [phone, setPhone] = useState(settings.phone ?? "");
  const [email, setEmail] = useState(settings.email ?? "");
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    let logoPath = settings.logo_path;

    if (logo) {
      try {
        logoPath = await uploadFile(supabase, "app-branding", "app", logo);
      } catch (err) {
        setSaving(false);
        setError(err instanceof Error ? err.message : "Logo upload failed");
        return;
      }
    }

    const { error } = await supabase
      .from("app_settings")
      .update({
        app_name: appName,
        logo_path: logoPath,
        address: address || null,
        phone: phone || null,
        email: email || null,
      })
      .eq("id", 1);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setLogo(null);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">App name</span>
        <input required value={appName} onChange={(e) => setAppName(e.target.value)} className="input w-64" />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Address (for invoices)</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} className="input w-64" />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Phone (for invoices)</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input w-40" />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Email (for invoices)</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input w-64" />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500">Logo (optional)</span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "…" : "Save branding"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
