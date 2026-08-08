// Lightweight in-memory Prisma stand-in for unit/integration tests.
// Implements only the surface area used by beneficiaryService and
// payoutBatchService — not a general-purpose Prisma mock.

type Profile = {
  id: string;
  userId: string;
  banescoAccountNumberEncrypted: string | null;
  banescoAccountLast4: string | null;
  bankName: string | null;
  accountHolderName: string | null;
  accountType: "CHECKING" | "SAVINGS" | null;
  currency: string;
  swiftBic: string | null;
  proofOfAddressStatus: string;
  identificationStatus: string;
  taxOrRucStatus: string;
  sourceOfFundsStatus: string;
  incomeCertificationRequired: boolean;
  incomeCertificationExpiresAt: Date | null;
  bankReadinessStatus: string;
  complianceHoldReason: string | null;
  adminVerificationNotes: string | null;
  okuApprovedAt: Date | null;
  okuApprovedById: string | null;
  bankReadyAt: Date | null;
  bankReadyById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Influencer = {
  id: string;
  userId: string;
  displayName: string | null;
  handle: string | null;
  approved: boolean;
  approvalStatus: string;
};

type LedgerEntry = {
  id: string;
  type: "COMMISSION_EARNED" | "COMMISSION_REVERSED";
  amountCents: number;
  currency: string;
  createdAt: Date;
  note: string | null;
  influencerId: string;
  orderId: string | null;
  payoutBatchId: string | null;
};

type SubCommissionLedger = {
  id: string;
  orderId: string;
  eventReferrerAssignmentId: string;
  parentInfluencerId: string | null;
  parentPartnerId: string | null;
  referrerShareCents: number;
  currency: string;
  payoutStatus: string;
  payoutResponsibility: string;
  payoutBatchId: string | null;
  createdAt: Date;
};

type PayoutBatch = {
  id: string;
  name: string;
  notes: string | null;
  from: Date;
  to: Date;
  status: string;
  currency: string;
  totalCents: number;
  lineCount: number;
  createdById: string;
  submittedAt: Date | null;
  submittedById: string | null;
  approvedAt: Date | null;
  approvedById: string | null;
  rejectedAt: Date | null;
  rejectedById: string | null;
  rejectionReason: string | null;
  exportedAt?: Date | null;
  exportedById?: string | null;
  exportFormat?: string | null;
  exportFileHash?: string | null;
  exportPayload?: string | null;
  closedAt?: Date | null;
};

type Order = { id: string; orderNumber: string; totalCents: number };
type User = { id: string; name: string | null; email: string };

const PROFILE_DEFAULTS: Omit<Profile, "userId" | "id" | "createdAt" | "updatedAt"> = {
  banescoAccountNumberEncrypted: null,
  banescoAccountLast4: null,
  bankName: null,
  accountHolderName: null,
  accountType: null,
  currency: "USD",
  swiftBic: null,
  proofOfAddressStatus: "MISSING",
  identificationStatus: "MISSING",
  taxOrRucStatus: "MISSING",
  sourceOfFundsStatus: "NOT_REQUIRED",
  incomeCertificationRequired: false,
  incomeCertificationExpiresAt: null,
  bankReadinessStatus: "MISSING_INFO",
  complianceHoldReason: null,
  adminVerificationNotes: null,
  okuApprovedAt: null,
  okuApprovedById: null,
  bankReadyAt: null,
  bankReadyById: null,
};

let counter = 0;
const cuid = (prefix = "id") => `${prefix}_${++counter}_${Date.now()}`;

function applyRelationalUpdate(target: Profile, data: Record<string, unknown>): Profile {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(data)) {
    if (k === "okuApprovedBy") {
      const rel = v as { connect?: { id: string }; disconnect?: boolean };
      if (rel?.connect) out.okuApprovedById = rel.connect.id;
      if (rel?.disconnect) out.okuApprovedById = null;
      continue;
    }
    if (k === "bankReadyBy") {
      const rel = v as { connect?: { id: string }; disconnect?: boolean };
      if (rel?.connect) out.bankReadyById = rel.connect.id;
      if (rel?.disconnect) out.bankReadyById = null;
      continue;
    }
    out[k] = v;
  }
  out.updatedAt = new Date();
  return out as Profile;
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;

/** Singleton mock used by vi.mock factories — same instance across tests. */
export const mockPrisma = createSingleton();

function createSingleton() {
  const mp = createMockPrisma();
  return mp;
}

export function resetMockPrisma() {
  mockPrisma.store.profiles.clear();
  mockPrisma.store.users.clear();
  mockPrisma.store.influencers.clear();
  mockPrisma.store.ledger.clear();
  mockPrisma.store.batches.clear();
  mockPrisma.store.orders.clear();
  mockPrisma.store.subCommissions.clear();
  mockPrisma.store.auditLogs.length = 0;
}

export function createMockPrisma() {
  const profiles = new Map<string, Profile>();
  const users = new Map<string, User>();
  const influencers = new Map<string, Influencer>();
  const ledger = new Map<string, LedgerEntry>();
  const batches = new Map<string, PayoutBatch>();
  const orders = new Map<string, Order>();
  const subCommissions = new Map<string, SubCommissionLedger>();
  const auditLogs: Array<{ actorId: string; action: string; metadata: unknown }> = [];

  const beneficiaryProfile = {
    findUnique: async ({
      where,
      include,
    }: {
      where: { userId: string };
      include?: { user?: unknown };
    }) => {
      const p = profiles.get(where.userId);
      if (!p) return null;
      if (include?.user) {
        const u = users.get(p.userId) ?? { id: p.userId, name: null, email: `${p.userId}@example.com` };
        return { ...p, user: { email: u.email, name: u.name } };
      }
      return { ...p };
    },
    findMany: async ({
      where,
      include,
    }: {
      where?: { userId?: { in: string[] }; bankReadinessStatus?: string; OR?: unknown };
      include?: { user?: unknown };
      orderBy?: unknown;
      take?: number;
    } = {}) => {
      let rows = Array.from(profiles.values());
      if (where?.userId?.in) {
        const set = new Set(where.userId.in);
        rows = rows.filter(r => set.has(r.userId));
      }
      if (where?.bankReadinessStatus) {
        rows = rows.filter(r => r.bankReadinessStatus === where.bankReadinessStatus);
      }
      return rows.map(r => {
        if (include?.user) {
          const u = users.get(r.userId) ?? { id: r.userId, name: null, email: `${r.userId}@example.com` };
          return { ...r, user: { id: u.id, name: u.name, email: u.email } };
        }
        return { ...r };
      });
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const userId = data.userId as string;
      if (!userId) throw new Error("userId required");
      const merged: Profile = {
        ...PROFILE_DEFAULTS,
        ...(data as Partial<Profile>),
        id: (data.id as string) ?? cuid("bp"),
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      profiles.set(userId, merged);
      return { ...merged };
    },
    update: async ({ where, data }: { where: { userId: string }; data: Record<string, unknown> }) => {
      const existing = profiles.get(where.userId);
      if (!existing) throw new Error(`BeneficiaryProfile not found: ${where.userId}`);
      const next = applyRelationalUpdate(existing, data);
      profiles.set(where.userId, next);
      return { ...next };
    },
  };

  const auditLog = {
    create: async ({ data }: { data: { actorId: string; action: string; metadata: unknown } }) => {
      auditLogs.push({ ...data });
      return data;
    },
  };

  const influencerProfile = {
    findMany: async ({
      where,
      select: _select,
    }: {
      where?: { id?: { in: string[] } };
      select?: unknown;
    } = {}) => {
      let rows = Array.from(influencers.values());
      if (where?.id?.in) {
        const set = new Set(where.id.in);
        rows = rows.filter(r => set.has(r.id));
      }
      return rows.map(r => ({ ...r }));
    },
  };

  const ledgerEntry = {
    findMany: async ({
      where,
    }: {
      where?: {
        payoutBatchId?: string | null;
        id?: { in: string[] };
        type?: { in: string[] };
        createdAt?: { gte?: Date; lte?: Date };
      };
      select?: unknown;
      orderBy?: unknown;
    } = {}) => {
      let rows = Array.from(ledger.values());
      if (where) {
        if ("payoutBatchId" in where) {
          rows = rows.filter(r => r.payoutBatchId === where.payoutBatchId);
        }
        if (where.id?.in) {
          const set = new Set(where.id.in);
          rows = rows.filter(r => set.has(r.id));
        }
        if (where.type?.in) {
          const set = new Set(where.type.in);
          rows = rows.filter(r => set.has(r.type));
        }
        if (where.createdAt?.gte) {
          const gte = where.createdAt.gte;
          rows = rows.filter(r => r.createdAt >= gte);
        }
        if (where.createdAt?.lte) {
          const lte = where.createdAt.lte;
          rows = rows.filter(r => r.createdAt <= lte);
        }
      }
      // Decorate with relations like Prisma's selected fields would.
      return rows.map(r => {
        const infl = influencers.get(r.influencerId);
        const ord = r.orderId ? orders.get(r.orderId) : null;
        return {
          ...r,
          influencer: infl ? { ...infl } : null,
          order: ord ? { ...ord } : null,
        };
      });
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: { in: string[] }; payoutBatchId?: string | null };
      data: { payoutBatchId?: string | null };
    }) => {
      let count = 0;
      for (const r of ledger.values()) {
        let match = true;
        if (where.id?.in) match = match && where.id.in.includes(r.id);
        if ("payoutBatchId" in where) match = match && r.payoutBatchId === where.payoutBatchId;
        if (match) {
          if ("payoutBatchId" in data) r.payoutBatchId = data.payoutBatchId ?? null;
          count += 1;
        }
      }
      return { count };
    },
  };

  const influencerSubCommissionLedger = {
    findMany: async ({
      where,
    }: {
      where?: {
        id?: { in: string[] };
        payoutBatchId?: string | null;
        payoutStatus?: string;
        payoutResponsibility?: string;
        createdAt?: { gte?: Date; lte?: Date };
      };
      select?: unknown;
      orderBy?: unknown;
    } = {}) => {
      let rows = Array.from(subCommissions.values());
      if (where) {
        if ("payoutBatchId" in where) {
          rows = rows.filter(r => r.payoutBatchId === where.payoutBatchId);
        }
        if (where.id?.in) {
          const set = new Set(where.id.in);
          rows = rows.filter(r => set.has(r.id));
        }
        if (where.payoutStatus !== undefined) {
          rows = rows.filter(r => r.payoutStatus === where.payoutStatus);
        }
        if (where.payoutResponsibility !== undefined) {
          rows = rows.filter(r => r.payoutResponsibility === where.payoutResponsibility);
        }
        if (where.createdAt?.gte) {
          const gte = where.createdAt.gte;
          rows = rows.filter(r => r.createdAt >= gte);
        }
        if (where.createdAt?.lte) {
          const lte = where.createdAt.lte;
          rows = rows.filter(r => r.createdAt <= lte);
        }
      }
      return rows.map(r => {
        const infl = r.parentInfluencerId ? influencers.get(r.parentInfluencerId) : null;
        return {
          ...r,
          parentInfluencer: infl ? { id: infl.id, displayName: infl.displayName } : null,
          eventReferrerAssignment: { id: r.eventReferrerAssignmentId, displayName: null },
          order: { orderNumber: null, series: null },
        };
      });
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: { in: string[] }; payoutBatchId?: string | null };
      data: { payoutBatchId?: string | null; payoutStatus?: string };
    }) => {
      let count = 0;
      for (const r of subCommissions.values()) {
        let match = true;
        if (where.id?.in) match = match && where.id.in.includes(r.id);
        if ("payoutBatchId" in where) match = match && r.payoutBatchId === where.payoutBatchId;
        if (match) {
          if ("payoutBatchId" in data) r.payoutBatchId = data.payoutBatchId ?? null;
          if ("payoutStatus" in data && data.payoutStatus !== undefined) r.payoutStatus = data.payoutStatus;
          count += 1;
        }
      }
      return { count };
    },
  };

  const payoutBatch = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const b = batches.get(where.id);
      return b ? { ...b } : null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const id = (data.id as string) ?? cuid("batch");
      const row: PayoutBatch = {
        id,
        name: (data.name as string) ?? "",
        notes: (data.notes as string | null) ?? null,
        from: (data.from as Date) ?? new Date(),
        to: (data.to as Date) ?? new Date(),
        status: (data.status as string) ?? "DRAFT",
        currency: (data.currency as string) ?? "USD",
        totalCents: (data.totalCents as number) ?? 0,
        lineCount: (data.lineCount as number) ?? 0,
        createdById: (data.createdById as string) ?? "",
        submittedAt: null,
        submittedById: null,
        approvedAt: null,
        approvedById: null,
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,
        exportedAt: null,
        exportedById: null,
        exportFormat: null,
        exportFileHash: null,
        exportPayload: null,
        closedAt: null,
      };
      batches.set(id, row);
      return { ...row };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string; status?: string };
      data: Record<string, unknown>;
    }) => {
      const existing = batches.get(where.id);
      if (!existing) throw new Error("PayoutBatch not found");
      if (where.status && existing.status !== where.status) {
        throw new Error("Concurrent status change");
      }
      const next = { ...existing, ...(data as Partial<PayoutBatch>) };
      batches.set(where.id, next);
      return { ...next };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = batches.get(where.id);
      if (!existing) throw new Error("PayoutBatch not found");
      batches.delete(where.id);
      return { ...existing };
    },
  };

  const $transaction = async <T,>(fn: (tx: typeof client) => Promise<T>): Promise<T> => fn(client);

  const client = {
    beneficiaryProfile,
    auditLog,
    influencerProfile,
    ledgerEntry,
    influencerSubCommissionLedger,
    payoutBatch,
    $transaction,
  };

  return {
    client,
    store: {
      profiles,
      users,
      influencers,
      ledger,
      batches,
      orders,
      subCommissions,
      auditLogs,
    },
    seedProfile(userId: string, overrides: Partial<Profile> = {}) {
      const p: Profile = {
        ...PROFILE_DEFAULTS,
        ...overrides,
        id: cuid("bp"),
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      profiles.set(userId, p);
      return p;
    },
    seedUser(id: string, name: string | null, email: string) {
      users.set(id, { id, name, email });
    },
    seedInfluencer(o: Partial<Influencer> & { id: string; userId: string }) {
      const row: Influencer = {
        displayName: o.displayName ?? null,
        handle: o.handle ?? null,
        approved: o.approved ?? true,
        approvalStatus: o.approvalStatus ?? "APPROVED",
        ...o,
      } as Influencer;
      influencers.set(row.id, row);
      return row;
    },
    seedLedgerEntry(o: Partial<LedgerEntry> & { id: string; influencerId: string; amountCents: number }) {
      const row: LedgerEntry = {
        type: "COMMISSION_EARNED",
        currency: "USD",
        createdAt: new Date(),
        note: null,
        orderId: null,
        payoutBatchId: null,
        ...o,
      } as LedgerEntry;
      ledger.set(row.id, row);
      return row;
    },
    seedOrder(o: Order) {
      orders.set(o.id, o);
    },
    seedSubCommission(
      o: Partial<SubCommissionLedger> & { id: string },
    ) {
      const row: SubCommissionLedger = {
        orderId: o.orderId ?? cuid("ord"),
        eventReferrerAssignmentId: o.eventReferrerAssignmentId ?? cuid("era"),
        parentInfluencerId: o.parentInfluencerId ?? null,
        parentPartnerId: o.parentPartnerId ?? null,
        referrerShareCents: o.referrerShareCents ?? 500,
        currency: o.currency ?? "USD",
        payoutStatus: o.payoutStatus ?? "PENDING",
        payoutResponsibility: o.payoutResponsibility ?? "PLATFORM",
        payoutBatchId: o.payoutBatchId ?? null,
        createdAt: o.createdAt ?? new Date(),
        ...o,
      };
      subCommissions.set(row.id, row);
      return row;
    },
    /** Seed a batch directly (bypassing the service) for testing post-state transitions. */
    seedBatch(
      o: Partial<PayoutBatch> & { id: string; status: string },
    ) {
      const row: PayoutBatch = {
        name: "Test Batch",
        notes: null,
        from: new Date("2025-01-01"),
        to: new Date("2025-01-31"),
        currency: "USD",
        totalCents: 0,
        lineCount: 0,
        createdById: "admin",
        submittedAt: null,
        submittedById: null,
        approvedAt: null,
        approvedById: null,
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,
        exportedAt: null,
        exportedById: null,
        exportFormat: null,
        exportFileHash: null,
        exportPayload: null,
        closedAt: null,
        ...o,
      };
      batches.set(row.id, row);
      return row;
    },
  };
}
