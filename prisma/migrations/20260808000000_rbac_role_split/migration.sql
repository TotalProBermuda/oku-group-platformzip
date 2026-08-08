-- Migration: rbac_role_split
-- Adds FB_DIRECTOR and RESTAURANT_SUPERVISOR to the RoleKey enum.
-- ADMIN_COMMERCIAL is intentionally retained in the enum for backward-
-- compatibility with existing session tokens and DB rows; it is zeroed out
-- in src/lib/permissions.ts (fail-closed, grants no permissions).

ALTER TYPE "RoleKey" ADD VALUE IF NOT EXISTS 'FB_DIRECTOR';
ALTER TYPE "RoleKey" ADD VALUE IF NOT EXISTS 'RESTAURANT_SUPERVISOR';
