import { Prisma } from "@prisma/client";

export function getHostApiErrorDetails(error: unknown): { message: string; status: number } {
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : 500;
  return { message: error instanceof Error ? error.message : "Internal error", status };
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
