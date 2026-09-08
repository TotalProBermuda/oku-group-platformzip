import { describe, expect, it, vi } from "vitest";
import { InvuPayloadType } from "@prisma/client";
import { normalizePayload } from "@/server/services/invu/invuNormalizationService";
import { operationalBindingIdentifiers, resolveTier2OperationalBinding } from "@/server/services/invu/invuMatchService";

describe("INVU identifier integrity", () => {
  it("preserves public num_cita independently of the internal order ID", () => {
    const normalized = normalizePayload({
      id: "5038",
      num_cita: "1-2-5032-39986",
      totales: { subtotal: "10.00", tax: "1.00", total: "11.00" },
    }, InvuPayloadType.CLOSED_ORDER);

    expect(normalized.invuOrderId).toBe("5038");
    expect(normalized.publicOrderNumber).toBe("1-2-5032-39986");
    expect(normalized.grossCents).toBe(1100);
    expect(normalized.taxCents).toBe(100);
    expect(operationalBindingIdentifiers(normalized as never)).toEqual(["1-2-5032-39986", "5038"]);
  });

  it("matches a host binding by num_cita before trying the internal ID", async () => {
    const findFirst = vi.fn().mockImplementation(async ({ where }) => {
      if (where.invuOrderId !== "1-2-5032-39986") return null;
      return {
        id: "binding-1",
        invuOrderId: "1-2-5032-39986",
        bindingType: "TABLE_OPEN_BINDING",
        attributionSession: {
          id: "attribution-1",
          reservationId: "reservation-1",
          venueId: "gold-house",
          bookingCode: "OKU-2026-ABCDEFGH",
        },
      };
    });

    const result = await resolveTier2OperationalBinding({
      venueId: "gold-house",
      invuOrderId: "5038",
      publicOrderNumber: "1-2-5032-39986",
    } as never, { operationalBinding: { findFirst } } as never);

    expect(result?.status).toBe("AUTO_MATCHED");
    expect(result?.reservationId).toBe("reservation-1");
    expect(result?.proof?.sourceField).toBe("num_cita");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
