-- Add PENDING_APPROVAL to ReservationStatus enum
-- Required for the requiresApproval space booking flow (Task #200):
-- a space marked requiresApproval creates a PENDING_APPROVAL reservation
-- that sits in the host queue awaiting Accept / Waitlist / Reject action.
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
