import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding IR documents and SOP documents...");

  // ── IR Documents ────────────────────────────────────────────────────────────
  const irDocs = [
    {
      title: "Q1 2025 Investor Update",
      description: "Revenue summary, venue performance metrics, and pipeline overview for Q1 2025.",
      visibility: "APPROVED_INVESTORS" as const,
    },
    {
      title: "Q4 2024 Financial Report",
      description: "Full-year 2024 financials including P&L, EBITDA by venue, and cash position.",
      visibility: "APPROVED_INVESTORS" as const,
    },
    {
      title: "OKÜ Growth Strategy Deck — 2025–2027",
      description: "Three-year expansion roadmap covering new venue openings, membership growth targets, and brand licensing opportunities.",
      visibility: "APPROVED_INVESTORS" as const,
    },
    {
      title: "Cap Table & Ownership Summary",
      description: "Current capitalization table, share classes, and vesting schedule summary.",
      visibility: "PRIVATE" as const,
    },
    {
      title: "OKÜ Membership Platform Overview",
      description: "Platform architecture, membership tier economics, and projected LTV by tier for the Patron and Founder programs.",
      visibility: "APPROVED_INVESTORS" as const,
    },
  ];

  for (const doc of irDocs) {
    const existing = await prisma.iRDocument.findFirst({ where: { title: doc.title } });
    if (!existing) {
      await prisma.iRDocument.create({ data: doc });
      console.log("  ✓ IR:", doc.title);
    } else {
      console.log("  – IR (already exists):", doc.title);
    }
  }

  // ── SOP Documents ────────────────────────────────────────────────────────────
  const sops = [
    {
      title: "Front of House Opening Procedures",
      department: "FOH" as const,
      venue: "OKU" as const,
      contentMd: `# Front of House Opening Procedures

## Pre-Opening Checklist (1.5 hours before service)

1. **Unlock and inspect** the main entrance, host stand, and dining floor.
2. **Review the reservation book** — confirm covers, note VIP guests, flag special requests.
3. **Set floor plan** — confirm table assignments match the reservation map. Adjust for walk-in capacity.
4. **Inspect table settings** — linen, glassware, flatware, candles. Replace any imperfect pieces.
5. **Confirm POS is online** — test a dummy check-in on the host terminal.
6. **Brief the team** — 15-minute stand-up at 30 minutes before service. Cover menu changes, VIP guests, 86'd items.
7. **Light candles and set music** at 10 minutes before first reservation.

## Guest Greeting Standard
- Acknowledge within 5 seconds of arrival.
- Greet by name for known guests and Patron/Founder members.
- Escort (never point) guests to their table.

## Handling Walk-Ins
- Check availability on the host system before quoting a wait time.
- Offer a seat at the bar or lounge during any wait.
- Update the waitlist every 10 minutes.`,
    },
    {
      title: "Back of House Food Safety & Sanitation SOP",
      department: "BOH" as const,
      venue: null,
      contentMd: `# BOH Food Safety & Sanitation SOP

## Daily Requirements

### Temperature Logs
- Record walk-in refrigerator temperature every 4 hours (target: 34–38°F / 1–3°C).
- Record freezer temperature twice daily (target: 0°F / -18°C or below).
- Log all readings in the Food Safety Binder on the prep station.

### Handwashing
- Wash hands for a minimum of 20 seconds with soap: before starting service, after handling raw protein, after any break.
- Use designated hand-washing sinks only — never the prep sink.

### Cross-Contamination Prevention
- Use color-coded cutting boards: **Red** for raw beef/pork, **Yellow** for poultry, **Green** for produce, **Blue** for seafood.
- Store raw proteins below ready-to-eat foods in all coolers.

## Closing Sanitation Checklist
- [ ] All surfaces sanitized with approved solution (200ppm chlorine)
- [ ] Floor swept and mopped
- [ ] Grease traps checked
- [ ] All food labeled with prep date and best-by date
- [ ] Walk-in organized and door sealed`,
    },
    {
      title: "Bar Program & Service Standards",
      department: "BAR" as const,
      venue: "CATCH" as const,
      contentMd: `# Bar Program & Service Standards

## Mise en Place
Complete the following before bar service opens:
- Batch cocktails for the evening per the current prep sheet
- Verify ice levels (cube and crushed)
- Stock garnishes — cut citrus, herbs, olives, cherries
- Confirm all spirits and modifiers are at minimum par level
- Inspect glassware — polish stems, check for chips

## Service Speed Standards
- Initial acknowledgement within **30 seconds** of guest seating at bar
- First drink delivered within **6 minutes** of order
- Food order relayed to kitchen within **2 minutes**

## Upsell Protocol
- Always suggest a premium spirit upgrade on classic requests
- Introduce the seasonal cocktail menu verbally on first contact
- Recommend a wine pairing with food orders

## End-of-Night Breakdown
1. Bank the bar (count and record cash/card split)
2. Restock all speed wells and back bar to par
3. Sanitize all bar surfaces and tools
4. Drain and clean ice wells
5. Complete the bar close checklist in the POS`,
    },
    {
      title: "Private Events Execution Guide",
      department: "EVENTS" as const,
      venue: null,
      contentMd: `# Private Events Execution Guide

## Pre-Event (72 Hours Out)
- Confirm final guest count with the client
- Distribute the run-of-show to all department leads
- Brief kitchen on custom menu, dietary restrictions, and service timing
- Walk the event space with the setup team — confirm AV, lighting, floral, and décor placement

## Day-Of Timeline
| Time | Action |
|------|--------|
| T-3h | Venue setup complete, AV test |
| T-2h | Bar stocked, kitchen prep final |
| T-1h | Full team briefing, doors walkthrough |
| T-30min | Host stand ready, welcome drink staged |
| T-0 | Doors open |

## During Service
- Assign one event coordinator as the single point of contact for the client
- Check in with the client at 30-minute intervals
- Log any incidents, special requests, or service failures in the event debrief sheet

## Post-Event
- Conduct a 15-minute debrief with all team leads within 30 minutes of close
- Complete the event satisfaction form and share with the client within 24 hours
- File the debrief in the Events Archive folder`,
    },
    {
      title: "New Staff Onboarding Checklist",
      department: "MANAGEMENT" as const,
      venue: null,
      contentMd: `# New Staff Onboarding Checklist

## Before First Day
- [ ] Offer letter signed and returned
- [ ] I-9 documentation collected
- [ ] Payroll information submitted
- [ ] Uniform sized and ordered
- [ ] System access (POS, scheduling software) provisioned

## Day 1
- Welcome tour of the venue(s)
- Introduction to department lead and team
- Review of brand standards and OKÜ service philosophy
- Safety orientation (emergency exits, first aid locations, incident reporting)
- Sign acknowledgement of Employee Handbook

## Week 1
- Shadow shifts with an assigned mentor (minimum 3 shifts)
- Complete all required food safety certifications
- Review the relevant departmental SOPs for their role
- Complete an initial performance check-in with department lead

## 30-Day Review
- Formal check-in with HR and department lead
- Review feedback from mentor and floor managers
- Set 60-day and 90-day performance goals`,
    },
    {
      title: "Management Shift Lead Responsibilities",
      department: "MANAGEMENT" as const,
      venue: null,
      contentMd: `# Management Shift Lead Responsibilities

## Opening Lead Duties
- Receive the venue from the closing manager (walk the space, review the log)
- Confirm all stations are properly staffed and mise en place is complete
- Review reservation book — identify VIPs, high covers, special events
- Brief the team on the day's priorities and any operational notes

## During Service
- Make floor rounds every 30 minutes
- Personally greet Patron and Founder members
- Handle guest escalations within 3 minutes of notification
- Monitor pacing and communicate with the kitchen on any delays

## Incident Reporting
All incidents must be logged in the Shift Log within 15 minutes of occurrence, including:
- Guest complaints and resolution
- Staff incidents or injuries
- Equipment failures
- Any service failure affecting the guest experience

## Closing Lead Duties
- Confirm all cash drawers are counted and balanced
- Review and sign off on tip distributions
- Complete the end-of-night Shift Log entry
- Walk the full venue before arming the alarm
- Send the closing report to the GM within 30 minutes of last guest departure`,
    },
  ];

  for (const sop of sops) {
    const existing = await prisma.sopDocument.findFirst({ where: { title: sop.title } });
    if (!existing) {
      await prisma.sopDocument.create({ data: { ...sop, version: 1, isActive: true } });
      console.log("  ✓ SOP:", sop.title);
    } else {
      console.log("  – SOP (already exists):", sop.title);
    }
  }

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
