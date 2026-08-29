"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { USER_ROLE_LABEL, type UserRole } from "@/lib/types";

const ROLES: UserRole[] = ["ADMIN", "STAFF", "VIEWER"];

export default function UserRoleSelect({ userId, role }: { userId: string; role: UserRole }) {
  const router = useRouter();
  const supabase = createClient();
  const [value, setValue] = useState(role);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: UserRole) {
    setValue(next);
    setError(null);

    const { error } = await supabase.from("profiles").update({ role: next }).eq("id", userId);

    if (error) {
      setValue(role);
      setError(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value as UserRole)}
        className="input w-32"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {USER_ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
