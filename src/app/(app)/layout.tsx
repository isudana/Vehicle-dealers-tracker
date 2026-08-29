import { createClient } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage";
import { getCurrentUserProfile } from "@/lib/auth";
import type { AppSettings } from "@/lib/types";
import NavBar from "@/components/NavBar";
import { RoleProvider } from "@/components/RoleProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  const settings = data as AppSettings | null;
  const logoUrl = settings?.logo_path ? getPublicUrl(supabase, "app-branding", settings.logo_path) : null;
  const profile = await getCurrentUserProfile();

  return (
    <RoleProvider role={profile?.role ?? null}>
      <div className="flex min-h-screen flex-col bg-gray-50 print:bg-white">
        <div className="print:hidden">
          <NavBar
            appName={settings?.app_name ?? "Vehicle Dealers Tracker"}
            logoUrl={logoUrl}
            role={profile?.role ?? null}
            displayName={profile?.display_name ?? null}
          />
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </RoleProvider>
  );
}
