import { createClient } from "@/lib/supabase/server";
import {
  CASH_ENTITY_CATEGORY_LABEL,
  CASH_ENTITY_TYPE_LABEL,
  type AppSettings,
  type CashEntity,
  type CashEntityCategory,
  type VehicleModel,
} from "@/lib/types";
import { getPublicUrl } from "@/lib/storage";
import AppBrandingForm from "@/components/AppBrandingForm";
import VehicleModelForm from "@/components/VehicleModelForm";
import SupplierForm from "@/components/SupplierForm";
import ResourceForm from "@/components/ResourceForm";
import CashEntityForm from "@/components/CashEntityForm";
import CashEntityEditForm from "@/components/CashEntityEditForm";
import EntityDeleteButton from "@/components/EntityDeleteButton";

const CASH_ENTITY_CATEGORIES: CashEntityCategory[] = ["CASH_ACCOUNT", "CASH_ENTITY", "INVESTOR", "LEASING_COMPANY"];

export default async function SettingsPage() {
  const supabase = await createClient();
  const [settingsRes, modelsRes, entitiesRes] = await Promise.all([
    supabase.from("app_settings").select("*").eq("id", 1).single(),
    supabase.from("vehicle_models").select("*").order("make").order("name"),
    supabase.from("cash_entities").select("*").order("category").order("type").order("name"),
  ]);

  const settings = settingsRes.data as AppSettings;
  const models = (modelsRes.data ?? []) as VehicleModel[];
  const entities = (entitiesRes.data ?? []) as CashEntity[];
  const standaloneEntities = entities.filter((e) => e.type !== "SUPPLIER");

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
                  <span>
                    <span className="font-medium text-gray-900">{m.make}</span> — {m.name}
                    {m.chassis_code && <span className="ml-1 text-xs text-gray-400">({m.chassis_code})</span>}
                  </span>
                  <EntityDeleteButton
                    what={`model "${m.make} ${m.name}"`}
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
        <h2 className="text-sm font-medium text-gray-900">Cash Entities ({standaloneEntities.length})</h2>
        <p className="text-xs text-gray-500">
          Cash Accounts and Investors are bidirectional; Cash Entities are destination-only — you pay into them but
          never draw a balance back out. Suppliers get one of each automatically when you add them below.
        </p>
        <CashEntityForm />
        {CASH_ENTITY_CATEGORIES.map((category) => {
          const categoryEntities = standaloneEntities.filter((e) => e.category === category);
          return (
            <div key={category} className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {CASH_ENTITY_CATEGORY_LABEL[category]} ({categoryEntities.length})
              </p>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                {categoryEntities.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-gray-500">None yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 text-sm text-gray-700">
                    {categoryEntities.map((en) => {
                      const logoUrl = en.logo_path ? getPublicUrl(supabase, "cash-entity-logos", en.logo_path) : null;
                      return (
                        <li key={en.id} className="flex items-center justify-between gap-2 px-4 py-2">
                          <div className="flex items-center gap-2">
                            {logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
                            ) : (
                              <div className="h-6 w-6 rounded bg-gray-100" />
                            )}
                            <span>{en.name}</span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {CASH_ENTITY_TYPE_LABEL[en.type]}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <CashEntityEditForm
                              entityId={en.id}
                              name={en.name}
                              primaryCurrency={en.primary_currency}
                            />
                            <EntityDeleteButton
                              what={`entity "${en.name}"`}
                              table="cash_entities"
                              id={en.id}
                              filesToDelete={en.logo_path ? [{ bucket: "cash-entity-logos", path: en.logo_path }] : []}
                              restrictHint="Can't delete — this entity has transfer history. Remove those transfers first."
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
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
