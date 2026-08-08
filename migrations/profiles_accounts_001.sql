-- ============================================================
-- OKÜ Group — Profiles + Accounts Architecture
-- Migration: 001 — Initial tables (additive, non-destructive)
-- Existing entity/user tables remain intact during Phase 1
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE "ProfileType" AS ENUM ('PERSON','COMPANY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProfileStatus" AS ENUM ('DRAFT','ACTIVE','INACTIVE','ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AccountProfileRelationship" AS ENUM (
    'OWNER','MANAGER','MEMBER','REPRESENTATIVE','HOST','EDITOR','VIEWER','BILLING_CONTACT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProfileRelationshipType" AS ENUM (
    'MEMBER_OF','REPRESENTS','OWNS','SUBSIDIARY_OF','PARTNER_OF','HOSTED_BY','MANAGED_BY','BRAND_OF'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SeriesAssignmentRole" AS ENUM (
    'HOST','CO_HOST','MC','PRESENTER','PARTNER','SPONSOR','CURATOR','REFERRER_ORG'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── profiles ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Profile" (
  id                    TEXT PRIMARY KEY DEFAULT concat('prof_', gen_random_uuid()::text),
  "profileType"         "ProfileType"   NOT NULL,
  "displayName"         TEXT            NOT NULL,
  "legalName"           TEXT,
  slug                  TEXT            UNIQUE,
  "primaryCategory"     TEXT,
  categories            TEXT[]          NOT NULL DEFAULT '{}',
  bio                   TEXT,
  "shortDescription"    TEXT,
  email                 TEXT,
  phone                 TEXT,
  "websiteUrl"          TEXT,
  "instagramUrl"        TEXT,
  "twitterUrl"          TEXT,
  "avatarUrl"           TEXT,
  "logoUrl"             TEXT,
  "coverImageUrl"       TEXT,
  "publicVisible"       BOOLEAN         NOT NULL DEFAULT false,
  "compensationEligible" BOOLEAN        NOT NULL DEFAULT false,
  "assignableToSeries"  BOOLEAN         NOT NULL DEFAULT true,
  "assignableToSessions" BOOLEAN        NOT NULL DEFAULT true,
  status               "ProfileStatus"  NOT NULL DEFAULT 'ACTIVE',
  metadata              JSONB           NOT NULL DEFAULT '{}',
  "createdByUserId"     TEXT,
  "updatedByUserId"     TEXT,
  "createdAt"           TIMESTAMPTZ     NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Profile_profileType_idx"       ON "Profile"("profileType");
CREATE INDEX IF NOT EXISTS "Profile_status_idx"            ON "Profile"(status);
CREATE INDEX IF NOT EXISTS "Profile_primaryCategory_idx"   ON "Profile"("primaryCategory");
CREATE INDEX IF NOT EXISTS "Profile_publicVisible_idx"     ON "Profile"("publicVisible");

-- ── account_profile_links ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "AccountProfileLink" (
  id                       TEXT PRIMARY KEY DEFAULT concat('apl_', gen_random_uuid()::text),
  "userId"                 TEXT NOT NULL,
  "profileId"              TEXT NOT NULL,
  "relationshipType"       "AccountProfileRelationship" NOT NULL,
  "canManage"              BOOLEAN NOT NULL DEFAULT false,
  "isPrimary"              BOOLEAN NOT NULL DEFAULT false,
  "isPublicRepresentative" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY ("userId")    REFERENCES "User"(id)    ON DELETE CASCADE,
  FOREIGN KEY ("profileId") REFERENCES "Profile"(id) ON DELETE CASCADE,
  UNIQUE ("userId", "profileId", "relationshipType")
);

CREATE INDEX IF NOT EXISTS "AccountProfileLink_userId_idx"    ON "AccountProfileLink"("userId");
CREATE INDEX IF NOT EXISTS "AccountProfileLink_profileId_idx" ON "AccountProfileLink"("profileId");

-- ── profile_relationships ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProfileRelationship" (
  id                 TEXT PRIMARY KEY DEFAULT concat('pr_', gen_random_uuid()::text),
  "parentProfileId"  TEXT NOT NULL,
  "childProfileId"   TEXT NOT NULL,
  "relationshipType" "ProfileRelationshipType" NOT NULL,
  metadata           JSONB NOT NULL DEFAULT '{}',
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY ("parentProfileId") REFERENCES "Profile"(id) ON DELETE CASCADE,
  FOREIGN KEY ("childProfileId")  REFERENCES "Profile"(id) ON DELETE CASCADE,
  UNIQUE ("parentProfileId", "childProfileId", "relationshipType")
);

CREATE INDEX IF NOT EXISTS "ProfileRelationship_parentProfileId_idx" ON "ProfileRelationship"("parentProfileId");
CREATE INDEX IF NOT EXISTS "ProfileRelationship_childProfileId_idx"  ON "ProfileRelationship"("childProfileId");

-- ── series_profile_assignments ─────────────────────────────
CREATE TABLE IF NOT EXISTS "SeriesProfileAssignment" (
  id               TEXT PRIMARY KEY DEFAULT concat('spa_', gen_random_uuid()::text),
  "seriesId"       TEXT NOT NULL,
  "profileId"      TEXT NOT NULL,
  "assignmentRole" "SeriesAssignmentRole" NOT NULL,
  "displayOrder"   INTEGER NOT NULL DEFAULT 0,
  "isPrimary"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY ("seriesId")  REFERENCES "Series"(id)  ON DELETE CASCADE,
  FOREIGN KEY ("profileId") REFERENCES "Profile"(id) ON DELETE CASCADE,
  UNIQUE ("seriesId", "profileId", "assignmentRole")
);

CREATE INDEX IF NOT EXISTS "SeriesProfileAssignment_seriesId_idx"  ON "SeriesProfileAssignment"("seriesId");
CREATE INDEX IF NOT EXISTS "SeriesProfileAssignment_profileId_idx" ON "SeriesProfileAssignment"("profileId");

-- ── session_profile_assignments ────────────────────────────
CREATE TABLE IF NOT EXISTS "SessionProfileAssignment" (
  id               TEXT PRIMARY KEY DEFAULT concat('sspa_', gen_random_uuid()::text),
  "sessionId"      TEXT NOT NULL,
  "profileId"      TEXT NOT NULL,
  "assignmentRole" "SeriesAssignmentRole" NOT NULL,
  "displayOrder"   INTEGER NOT NULL DEFAULT 0,
  "isPrimary"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY ("sessionId") REFERENCES "Session"(id)  ON DELETE CASCADE,
  FOREIGN KEY ("profileId") REFERENCES "Profile"(id)  ON DELETE CASCADE,
  UNIQUE ("sessionId", "profileId", "assignmentRole")
);

CREATE INDEX IF NOT EXISTS "SessionProfileAssignment_sessionId_idx"  ON "SessionProfileAssignment"("sessionId");
CREATE INDEX IF NOT EXISTS "SessionProfileAssignment_profileId_idx"  ON "SessionProfileAssignment"("profileId");

-- ── profile_compensation_settings ─────────────────────────
CREATE TABLE IF NOT EXISTS "ProfileCompensationSettings" (
  id                    TEXT PRIMARY KEY DEFAULT concat('pcs_', gen_random_uuid()::text),
  "profileId"           TEXT NOT NULL UNIQUE,
  "compensationPlanId"  TEXT,
  "payoutEnabled"       BOOLEAN NOT NULL DEFAULT false,
  "payoutMethod"        TEXT,
  "payoutMetadata"      JSONB NOT NULL DEFAULT '{}',
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY ("profileId") REFERENCES "Profile"(id) ON DELETE CASCADE
);

-- ── compatibility redirects note ──────────────────────────
-- /admin/entities → /admin/profiles   (Next.js redirect)
-- /admin/users    → /admin/accounts   (Next.js redirect)
