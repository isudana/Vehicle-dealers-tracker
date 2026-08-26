"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NavBar() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold text-gray-900">
            Vehicle Import Tracker
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
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
