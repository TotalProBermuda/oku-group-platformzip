"use client";

export const GROUP_BOOKING_CHAT_EVENT = "oku:group-booking-chat";
export type GroupBookingChatDetail = { context: string; guestName?: string; guestPhone?: string };
export function openGroupBookingChat(detail: GroupBookingChatDetail) {
  window.dispatchEvent(new CustomEvent<GroupBookingChatDetail>(GROUP_BOOKING_CHAT_EVENT, { detail }));
}
