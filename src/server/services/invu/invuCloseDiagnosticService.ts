import { prisma } from "@/lib/prisma";
import { decrypt } from "./invuEncryptionService";

const INVU_API_BASE = "https://api6.invupos.com/invuApiPos/index.php";

type ProbeResult = {
  probe: string;
  httpStatus: number;
  responseKind: "json" | "non_json";
  topLevelKeys: string[];
  arrayCounts: Record<string, number>;
  containsInternalOrderId: boolean;
  containsPublicOrderNumber: boolean;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function summarisePayload(
  probe: string,
  httpStatus: number,
  text: string,
  internalOrderId: string,
  publicOrderNumber: string
): ProbeResult {
  try {
    const parsed: unknown = JSON.parse(text);
    const object = asObject(parsed);
    const topLevelKeys = object ? Object.keys(object).slice(0, 12) : [];
    const arrayCounts: Record<string, number> = Array.isArray(parsed)
      ? { root: parsed.length }
      : Object.fromEntries(
          (object ? Object.entries(object) : [])
            .filter(([, value]) => Array.isArray(value))
            .map(([key, value]) => [key, (value as unknown[]).length])
        );
    // Both identifiers are supplied by the host's existing binding and never
    // returned to the browser. This is only a boolean evidence check.
    const serialised = JSON.stringify(parsed);
    return {
      probe,
      httpStatus,
      responseKind: "json",
      topLevelKeys,
      arrayCounts,
      containsInternalOrderId: serialised.includes(internalOrderId),
      containsPublicOrderNumber: serialised.includes(publicOrderNumber),
    };
  } catch {
    return {
      probe,
      httpStatus,
      responseKind: "non_json",
      topLevelKeys: [],
      arrayCounts: {},
      containsInternalOrderId: false,
      containsPublicOrderNumber: false,
    };
  }
}

/**
 * One-time, read-only evidence probe for a bound ticket that INVU did not
 * return through the normal closed-orders pull. It deliberately returns
 * metadata only: no token, customer data, line items, or provider payload.
 */
export async function diagnoseMissingInvuClose(params: {
  venueId: string;
  internalOrderId: string;
}): Promise<ProbeResult[]> {
  const mapping = await prisma.integrationBranchMapping.findFirst({
    where: { venueId: params.venueId, isSyncEnabled: true },
    include: { credential: true },
    orderBy: { createdAt: "asc" },
  });
  if (!mapping?.credential || mapping.credential.status !== "CONNECTED") {
    return [];
  }

  const encrypted = mapping.credential.accessTokenEncrypted ?? mapping.credential.apiPasswordEncrypted;
  if (!encrypted) return [];
  const token = decrypt(encrypted);
  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const secondsStart = Math.floor(start / 1000);
  const secondsEnd = Math.floor(now / 1000);
  const publicOrderNumber = params.internalOrderId.split("-").slice(1).join("");
  const query = (suffix: string) => `${INVU_API_BASE}?r=citas/ordenesAllAdv/fini/${suffix}`;

  // These five GETs are capped and use the same documented route family. They
  // distinguish filter, grouping, and time-unit mistakes without altering POS,
  // integration, or commission data.
  const probes = [
    { probe: "seconds_tipo_1_grouping_1", suffix: `${secondsStart}/ffin/${secondsEnd}/tipo/1/grouping/1` },
    { probe: "seconds_tipo_1", suffix: `${secondsStart}/ffin/${secondsEnd}/tipo/1` },
    { probe: "seconds_tipo_0_grouping_1", suffix: `${secondsStart}/ffin/${secondsEnd}/tipo/0/grouping/1` },
    { probe: "seconds_unfiltered", suffix: `${secondsStart}/ffin/${secondsEnd}` },
    { probe: "milliseconds_tipo_1_grouping_1", suffix: `${start}/ffin/${now}/tipo/1/grouping/1` },
  ];

  const results: ProbeResult[] = [];
  for (const candidate of probes) {
    try {
      const response = await fetch(query(candidate.suffix), {
        headers: { accept: "application/json", authorization: token },
      });
      const text = await response.text().catch(() => "");
      results.push(summarisePayload(
        candidate.probe,
        response.status,
        text,
        params.internalOrderId,
        publicOrderNumber
      ));
    } catch {
      results.push({
        probe: candidate.probe,
        httpStatus: 0,
        responseKind: "non_json",
        topLevelKeys: [],
        arrayCounts: {},
        containsInternalOrderId: false,
        containsPublicOrderNumber: false,
      });
    }
  }
  return results;
}
