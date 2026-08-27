import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage";
import type { Resource } from "@/lib/types";
import EntityDeleteButton from "@/components/EntityDeleteButton";

export default async function ResourcesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("resources").select("*").order("created_at");
  const resources = (data ?? []) as Resource[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Business Resources</h1>
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-800">
          + Add resource (Settings)
        </Link>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <div className="grid grid-cols-2 gap-4">
        {resources.map((r) => {
          const logoUrl = r.logo_path ? getPublicUrl(supabase, "resource-logos", r.logo_path) : null;
          return (
            <div
              key={r.id}
              className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-400"
            >
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-start gap-3">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                    🔗
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{r.title}</p>
                  {r.description && <p className="mt-1 text-sm text-gray-500">{r.description}</p>}
                  <p className="mt-2 truncate text-xs text-gray-400">{r.url}</p>
                </div>
              </a>
              <EntityDeleteButton
                what={`resource "${r.title}"`}
                table="resources"
                id={r.id}
                filesToDelete={r.logo_path ? [{ bucket: "resource-logos", path: r.logo_path }] : []}
              />
            </div>
          );
        })}
        {resources.length === 0 && <p className="text-sm text-gray-500">No resources yet.</p>}
      </div>
    </div>
  );
}
