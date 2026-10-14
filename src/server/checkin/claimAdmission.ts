import { prisma } from "@/lib/prisma";
import { lockSessionInventory } from "@/server/commerce/sessionInventory";

/** The same occurrence lock used by postponement prevents a check-in/hold race. */
export async function claimAdmission(input: { ticketId: string; sessionId: string; actorId: string; at: Date }) {
  return prisma.$transaction(async tx => {
    await lockSessionInventory(tx, input.sessionId);
    const session = await tx.session.findUnique({ where: { id: input.sessionId }, select: { status: true } });
    if (!session || !["SCHEDULED", "SOLD_OUT"].includes(session.status)) throw Object.assign(new Error("Check-in is paused for this occurrence. Keep the existing ticket pending the confirmed date."), { status: 409 });
    return tx.ticket.updateMany({
      where: { id: input.ticketId, sessionId: input.sessionId, ticketStatus: "ISSUED", order: { status: { notIn: ["CANCELLED", "REFUNDED", "FAILED"] } } },
      data: { ticketStatus: "CHECKED_IN", checkedInAt: input.at, checkedInById: input.actorId },
    });
  });
}
