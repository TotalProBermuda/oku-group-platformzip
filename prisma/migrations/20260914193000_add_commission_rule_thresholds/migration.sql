-- Versioned commission rules can optionally select a higher percentage once
-- the commissionable revenue reaches an inclusive threshold.
ALTER TABLE "CommissionRule"
  ADD COLUMN "thresholdCents" INTEGER,
  ADD COLUMN "percentageBpsAtOrAboveThreshold" INTEGER;
