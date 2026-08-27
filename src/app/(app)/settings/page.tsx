import { createClient } from "@/lib/supabase/server";
import type { AppSettings, VehicleModel } from "@/lib/types";
import AppBrandingForm from "@/components/AppBrandingForm";
import VehicleModelForm from "@/components/VehicleModelForm";
import SupplierForm from "@/components/SupplierForm";
import ResourceForm from "@/components/ResourceForm";
import EntityDeleteButton from "@/components/EntityDeleteButton";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [settingsRes, modelsRes] = await Promise.all([
    supabase.from("app_settings").select("*").eq("id", 1).single(),
    supabase.from("vehicle_models").select("*").order("name"),
  ]);

  const settings = settingsRes.data as AppSettings;
  const models = (modelsRes.data ?? []) as VehicleModel[];

  return (
    <div className="space-y-10">
      <h1 className="text-lg font-semibold text-gray-900">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">App Branding</h2>
        <AppBrandingForm settings={settings} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Vehicle Models ({models.length})</h2>
        <VehicleModelForm />
        <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white">
          {models.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No models yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm text-gray-700">
              {models.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-4 py-2">
                  <span>{m.name}</span>
                  <EntityDeleteButton
                    what={`model "${m.name}"`}
                    table="vehicle_models"
                    id={m.id}
                    restrictHint="Can't delete — one or more vehicles use this model."
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Add a Supplier</h2>
        <div className="max-w-lg">
          <SupplierForm />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-900">Add a Resource</h2>
        <ResourceForm />
      </section>
    </div>
  );
}
