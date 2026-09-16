-- Read-only Superadmin access to a partner's commercial workspace is a
-- support action and must be visible in the existing immutable user audit log.
ALTER TYPE "UserAdminAction" ADD VALUE IF NOT EXISTS 'PARTNER_SUPPORT_VIEWED';
