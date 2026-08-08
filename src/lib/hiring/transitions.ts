import { ApplicationStatus } from "@prisma/client";

export const allowedTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW", "REJECTED", "WITHDRAWN"],
  UNDER_REVIEW: ["HR_SCREEN", "REJECTED"],
  HR_SCREEN: ["MANAGER_REVIEW", "INTERVIEW_SCHEDULED", "REJECTED"],
  MANAGER_REVIEW: ["INTERVIEW_SCHEDULED", "REJECTED"],
  INTERVIEW_SCHEDULED: ["TRIAL_SHIFT", "OFFER_PENDING", "REJECTED"],
  TRIAL_SHIFT: ["OFFER_PENDING", "REJECTED"],
  OFFER_PENDING: ["HIRED", "REJECTED"],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
  ARCHIVED: [],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus) {
  return allowedTransitions[from]?.includes(to) ?? false;
}
