import { prisma } from "@/lib/prisma";
import {
  SeriesVisibilityMode,
  EventPermissionStatus,
  EventPermissionType,
  EventReferrerStatus,
} from "@prisma/client";

export interface PermissionContext {
  userId?: string;
  userRoles?: string[];
  isAuthenticated: boolean;
}

export interface EventPermissions {
  canViewEventCard: boolean;
  canClickEvent: boolean;
  canViewEventDetails: boolean;
  canViewAttendeeList: boolean;
  canPurchaseTickets: boolean;
  canShareEvent: boolean;
  canManageEventReferrers: boolean;
  isShell: boolean;
  isHidden: boolean;
}

export async function evaluateSeriesPermissions(
  seriesId: string,
  ctx: PermissionContext
): Promise<EventPermissions> {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: {
      seriesVisibilityMode: true,
      attendeeListMode: true,
      influencerId: true,
      commercialOwnerInfluencerId: true,
    },
  });

  if (!series) {
    return denied();
  }

  const isSuperadmin = ctx.userRoles?.includes("SUPERADMIN") ?? false;
  const isAdmin = ctx.userRoles?.includes("ADMIN") ?? false;

  if (isSuperadmin || isAdmin) {
    return fullAccess();
  }

  const isInfluencerHost = ctx.userId
    ? await isSeriesInfluencerHost(seriesId, ctx.userId)
    : false;

  if (isInfluencerHost) {
    return fullAccess();
  }

  const mode = series.seriesVisibilityMode;

  if (mode === SeriesVisibilityMode.PUBLIC) {
    const canViewAttendees = await resolveAttendeeListAccess(
      seriesId,
      series.attendeeListMode,
      ctx
    );
    return {
      canViewEventCard: true,
      canClickEvent: true,
      canViewEventDetails: true,
      canViewAttendeeList: canViewAttendees,
      canPurchaseTickets: true,
      canShareEvent: true,
      canManageEventReferrers: false,
      isShell: false,
      isHidden: false,
    };
  }

  if (mode === SeriesVisibilityMode.PRIVATE_SHELL) {
    const hasPermission = ctx.userId
      ? await hasExplicitPermission(seriesId, ctx.userId, [
          EventPermissionType.VIEW,
          EventPermissionType.BUY,
          EventPermissionType.REFERRER,
          EventPermissionType.MANAGE_REFERRERS,
        ])
      : false;

    if (!hasPermission) {
      return {
        canViewEventCard: true,
        canClickEvent: false,
        canViewEventDetails: false,
        canViewAttendeeList: false,
        canPurchaseTickets: false,
        canShareEvent: false,
        canManageEventReferrers: false,
        isShell: true,
        isHidden: false,
      };
    }

    const canViewAttendees = await resolveAttendeeListAccess(
      seriesId,
      series.attendeeListMode,
      ctx
    );
    const canManage = await hasExplicitPermission(seriesId, ctx.userId!, [
      EventPermissionType.MANAGE_REFERRERS,
    ]);
    return {
      canViewEventCard: true,
      canClickEvent: true,
      canViewEventDetails: true,
      canViewAttendeeList: canViewAttendees,
      canPurchaseTickets: await hasExplicitPermission(seriesId, ctx.userId!, [
        EventPermissionType.BUY,
      ]),
      canShareEvent: true,
      canManageEventReferrers: canManage,
      isShell: false,
      isHidden: false,
    };
  }

  if (mode === SeriesVisibilityMode.PRIVATE_HIDDEN) {
    if (!ctx.userId) return denied();
    const hasPermission = await hasExplicitPermission(seriesId, ctx.userId, [
      EventPermissionType.VIEW,
      EventPermissionType.BUY,
      EventPermissionType.REFERRER,
      EventPermissionType.MANAGE_REFERRERS,
    ]);
    if (!hasPermission) return { ...denied(), isHidden: true };

    const canViewAttendees = await resolveAttendeeListAccess(
      seriesId,
      series.attendeeListMode,
      ctx
    );
    const canManage = await hasExplicitPermission(seriesId, ctx.userId, [
      EventPermissionType.MANAGE_REFERRERS,
    ]);
    return {
      canViewEventCard: true,
      canClickEvent: true,
      canViewEventDetails: true,
      canViewAttendeeList: canViewAttendees,
      canPurchaseTickets: await hasExplicitPermission(seriesId, ctx.userId, [
        EventPermissionType.BUY,
      ]),
      canShareEvent: true,
      canManageEventReferrers: canManage,
      isShell: false,
      isHidden: false,
    };
  }

  return denied();
}

async function hasExplicitPermission(
  seriesId: string,
  userId: string,
  types: EventPermissionType[]
): Promise<boolean> {
  const count = await prisma.eventPermission.count({
    where: {
      seriesId,
      userId,
      status: EventPermissionStatus.ACTIVE,
      permissionType: { in: types },
    },
  });
  return count > 0;
}

async function isSeriesInfluencerHost(
  seriesId: string,
  userId: string
): Promise<boolean> {
  const influencer = await prisma.influencerProfile.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!influencer) return false;

  const series = await prisma.series.findFirst({
    where: {
      id: seriesId,
      OR: [
        { influencerId: influencer.id },
        { commercialOwnerInfluencerId: influencer.id },
      ],
    },
    select: { id: true },
  });
  return !!series;
}

async function resolveAttendeeListAccess(
  seriesId: string,
  attendeeListMode: string,
  ctx: PermissionContext
): Promise<boolean> {
  if (attendeeListMode === "PUBLIC") return true;
  if (attendeeListMode === "HIDDEN") return false;
  if (attendeeListMode === "BUYERS_ONLY" && ctx.userId) {
    const hasBought = await prisma.order.count({
      where: { seriesId, userId: ctx.userId, status: "PAID" },
    });
    return hasBought > 0;
  }
  if (attendeeListMode === "PARTIAL") return true;
  return false;
}

function denied(): EventPermissions {
  return {
    canViewEventCard: false,
    canClickEvent: false,
    canViewEventDetails: false,
    canViewAttendeeList: false,
    canPurchaseTickets: false,
    canShareEvent: false,
    canManageEventReferrers: false,
    isShell: false,
    isHidden: true,
  };
}

function fullAccess(): EventPermissions {
  return {
    canViewEventCard: true,
    canClickEvent: true,
    canViewEventDetails: true,
    canViewAttendeeList: true,
    canPurchaseTickets: true,
    canShareEvent: true,
    canManageEventReferrers: true,
    isShell: false,
    isHidden: false,
  };
}

export async function resolveEventReferrerPermissions(
  seriesId: string,
  userId: string
) {
  const influencer = await prisma.influencerProfile.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!influencer) return { isReferrer: false, assignment: null };

  const assignment = await prisma.eventReferrerAssignment.findFirst({
    where: {
      seriesId,
      OR: [
        { assignedUserId: userId },
        { parentInfluencerId: influencer.id },
        { createdByInfluencerId: influencer.id },
      ],
      status: EventReferrerStatus.ACTIVE,
    },
  });

  return { isReferrer: !!assignment, assignment };
}
