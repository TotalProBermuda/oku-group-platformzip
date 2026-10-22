export function getAdminApiErrorDetails(error: unknown): { message: string; status: number } {
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : 500;
  return { message: error instanceof Error ? error.message : "Internal error", status };
}
