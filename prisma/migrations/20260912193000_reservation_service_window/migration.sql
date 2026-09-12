-- One superadmin-controlled booking window shared by guest reservation flows.
ALTER TABLE "CommerceSettings"
  ADD COLUMN "reservationServiceStartMinutes" INTEGER NOT NULL DEFAULT 1020,
  ADD COLUMN "reservationServiceEndMinutes" INTEGER NOT NULL DEFAULT 1410;
