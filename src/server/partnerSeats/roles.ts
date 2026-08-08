import { PartnerDelegateRole } from "@prisma/client";

export interface PermissionBundle {
  // Operational scope
  can_view_attendees: boolean;
  can_export_attendees: boolean;
  can_check_in: boolean;
  can_send_invites: boolean;
  can_manage_co_leads: boolean;
  can_view_earnings: boolean;
  can_edit_session: boolean;
  can_edit_series: boolean;
}

export interface RoleTemplate {
  code: PartnerDelegateRole;
  label: string;
  description: string;
  defaultScope: "series" | "session";
  permissions: PermissionBundle;
}

const FALSE_BUNDLE: PermissionBundle = {
  can_view_attendees: false,
  can_export_attendees: false,
  can_check_in: false,
  can_send_invites: false,
  can_manage_co_leads: false,
  can_view_earnings: false,
  can_edit_session: false,
  can_edit_series: false,
};

export const ROLE_TEMPLATES: Record<PartnerDelegateRole, RoleTemplate> = {
  SERIES_CO_LEAD: {
    code: "SERIES_CO_LEAD",
    label: "Series Co-Lead",
    description: "Full operational lead across every session in the series.",
    defaultScope: "series",
    permissions: {
      ...FALSE_BUNDLE,
      can_view_attendees: true,
      can_export_attendees: true,
      can_check_in: true,
      can_send_invites: true,
      can_view_earnings: true,
      can_edit_session: true,
    },
  },
  SESSION_CO_LEAD: {
    code: "SESSION_CO_LEAD",
    label: "Session Co-Lead",
    description: "Operational lead for a single session.",
    defaultScope: "session",
    permissions: {
      ...FALSE_BUNDLE,
      can_view_attendees: true,
      can_export_attendees: true,
      can_check_in: true,
      can_send_invites: true,
      can_edit_session: true,
    },
  },
  GUEST_LIST_LEAD: {
    code: "GUEST_LIST_LEAD",
    label: "Guest List Lead",
    description: "Manages invites and check-in only.",
    defaultScope: "session",
    permissions: {
      ...FALSE_BUNDLE,
      can_view_attendees: true,
      can_check_in: true,
      can_send_invites: true,
    },
  },
};

export function getRoleTemplate(code: PartnerDelegateRole): RoleTemplate {
  return ROLE_TEMPLATES[code];
}

export function listRoleTemplates(): RoleTemplate[] {
  return Object.values(ROLE_TEMPLATES);
}

export function snapshotPermissions(code: PartnerDelegateRole): PermissionBundle {
  return { ...getRoleTemplate(code).permissions };
}
