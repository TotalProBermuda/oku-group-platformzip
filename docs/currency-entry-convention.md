# Currency entry convention

All operator-facing money fields must accept a human-readable amount in **dollars and cents**. Never label a price field “cents” or ask an operator to convert a price such as $45.00 into 4500.

The canonical storage and API value remains an integer number of minor units (for example, 4500 cents for $45.00). Convert only at the UI boundary, display dollars and cents separately with right-aligned digits, validate cents from 00 to 99, and show formatted currency in previews and confirmations.

Reuse `CurrencyAmountInput` for future administrative price and payout amount fields. Keep ledger calculations, payment-provider requests, and database fields in their existing minor-unit representation unless a separately reviewed schema migration is required.
