import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/auth";
import type { Customer } from "@/lib/types";

export default async function CustomersPage() {
  const profile = await getCurrentUserProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").select("*").order("full_name");
  const customers = (data ?? []) as Customer[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Customers</h1>
        {profile?.role !== "VIEWER" && (
          <Link
            href="/customers/new"
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add customer
          </Link>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {customers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">No customers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">NIC / Passport</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Email</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <Link href={`/customers/${c.id}`} className="text-gray-900 hover:underline">
                      {c.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{c.nic_passport}</td>
                  <td className="px-4 py-2 text-gray-600">{c.phone}</td>
                  <td className="px-4 py-2 text-gray-600">{c.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
