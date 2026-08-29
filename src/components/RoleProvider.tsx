"use client";

import { createContext, useContext } from "react";
import type { UserRole } from "@/lib/types";

const RoleContext = createContext<UserRole | null>(null);

export function RoleProvider({
  role,
  children,
}: {
  role: UserRole | null;
  children: React.ReactNode;
}) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
