import { describe, expect, it } from "vitest";
import { InvuPayloadType } from "@prisma/client";
import { normalizePayload } from "@/server/services/invu/invuNormalizationService";

describe("INVU invoice-detail normalization", () => {
  it("normalizes the documented citas/view envelope for automatic closeout", () => {
    const normalized = normalizePayload({
      id: "1-2-4982-44729",
      num_cita: "1-2-4982-44729",
      orden_datos: {
        mesa: "Oku 1",
        fecha_cierre: 1_788_719_875,
        impuesto: 1,
      },
      status: { id: 1, descripcion: "Cerrada" },
      pagos: [{ monto: 11 }],
    }, InvuPayloadType.CLOSED_ORDER);

    expect(normalized).toMatchObject({
      invuOrderId: "1-2-4982-44729",
      publicOrderNumber: "1-2-4982-44729",
      tableLabel: "Oku 1",
      statusCanonical: "CLOSED",
      grossCents: 1100,
      taxCents: 100,
    });
    expect(normalized.closedAt).toBeInstanceOf(Date);
  });
});
