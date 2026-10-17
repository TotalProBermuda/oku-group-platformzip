export function reservationPhone(reservation: { contactPhone?: string | null; contactWhatsapp?: string | null }) {
  return reservation.contactPhone?.trim() || reservation.contactWhatsapp?.trim() || null;
}

export function panamaDateTimeInput(iso: string) {
  return new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 16);
}

export function panamaInputToDate(value: string) {
  return new Date(`${value}-05:00`);
}
