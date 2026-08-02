"use client";

import { AdminContext } from "@/contexts/AdminContext";
import AdminNav from "./AdminNav";

interface AdminNavLabels {
  administration: string;
  adminConsole: string;
  overview: string;
  experiences: string;
  series: string;
  entities: string;
  profiles: string;
  accounts: string;
  analytics: string;
  orders: string;
  users: string;
  payouts: string;
  memberships: string;
  irDocuments: string;
  hr: string;
  hiring: string;
  compensation: string;
  partners: string;
  scorecards: string;
  sponsorship: string;
  launchReadiness: string;
}

interface Props {
  roles: string[];
  navLabels?: Partial<AdminNavLabels>;
  children: React.ReactNode;
}

// Every admin page inherits the same 1200px content grid that lines up with
// AdminNav. There are no per-page bypasses — pages that need an edge-to-edge
// look use the .admin-hero-card slab inside AdminPageShell.
export default function AdminShell({ roles, navLabels, children }: Props) {
  return (
    <AdminContext.Provider value={{ roles }}>
      <AdminNav labels={navLabels} />
      <div className="admin-shell-container">
        {children}
      </div>
    </AdminContext.Provider>
  );
}
