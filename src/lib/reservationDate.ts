// Restaurant reservations are entered in Panama local time. Constructing a
// Date without an offset uses the guest device timezone and can shift the
// booking before server validation. Panama is UTC-05:00 year-round.
export function panamaReservationIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00-05:00`).toISOString();
}
