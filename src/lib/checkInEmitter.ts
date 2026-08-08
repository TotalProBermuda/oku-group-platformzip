import { EventEmitter } from "events";

export interface CheckInEvent {
  ticketId: string;
  ticketCode: string;
  sessionId: string | null;
  seriesId: string | null;
  userId: string;
  orderId: string | null;
  attendeeName: string | null;
  attendeeEmail: string | null;
  checkedInAt: string;
  result: "VALID";
}

class CheckInEventEmitter extends EventEmitter {}

const g = globalThis as unknown as { _checkInEmitter?: CheckInEventEmitter };
if (!g._checkInEmitter) {
  g._checkInEmitter = new CheckInEventEmitter();
  g._checkInEmitter.setMaxListeners(500);
}

export const checkInEmitter = g._checkInEmitter;
