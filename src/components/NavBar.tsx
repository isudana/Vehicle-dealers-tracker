"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

export default function NavBar({
  appName,
  logoUrl,
  role,
  displayName,
}: {
  appName: string;
  logoUrl: string | null;
  role: UserRole | null;
  displayName: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
            )}
            {appName}
          </Link>
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
            Dashboard
          </Link>
          <Link href="/vehicles" className="text-sm text-gray-600 hover:text-gray-900">
            Vehicles
          </Link>
          <Link href="/suppliers" className="text-sm text-gray-600 hover:text-gray-900">
            Suppliers
          </Link>
          <Link href="/customers" className="text-sm text-gray-600 hover:text-gray-900">
            Customers
          </Link>
          <Link href="/cash" className="text-sm text-gray-600 hover:text-gray-900">
            Cash
          </Link>
          <Link href="/overheads" className="text-sm text-gray-600 hover:text-gray-900">
            Overheads
          </Link>
          <Link href="/resources" className="text-sm text-gray-600 hover:text-gray-900">
            Resources
          </Link>
          {role === "ADMIN" && (
            <Link href="/settings" className="text-sm text-gray-600 hover:text-gray-900">
              Settings
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          {displayName && <span className="text-sm text-gray-500">{displayName}</span>}
          <button onClick={handleSignOut} className="text-sm text-gray-500 hover:text-gray-900">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
