/**
 * Production bootstrap (Task #129).
 *
 * Usage:
 *   npm run prod:bootstrap                    # production-only, real run
 *   npm run prod:bootstrap -- --allow-dry-run # any environment, report-only
 *
 * What it does:
 *   1. Refuses to run when DEMO_MODE_ENABLED=true (exit 2).
 *   2. Refuses to run unless NODE_ENV=production OR --allow-dry-run is passed.
 *   3. Ensures at least one SUPERADMIN user exists. If none, prompts for an
 *      email + display name on stdin and creates one.
 *
 *      IMPORTANT — no password is collected. This project's `User` model has
 *      no `passwordHash` column and the only credential provider in
 *      `src/lib/auth.ts` authenticates by email alone (with OAuth via Google /
 *      Facebook). There is no existing password-hashing helper to "reuse".
 *      Adding password auth would require a Prisma schema migration plus a
 *      new credential provider — out of scope for the launch-readiness task.
 *      The first SUPERADMIN signs in via the same email-credential path the
 *      rest of the platform uses.
 *   4. Calls the shared getLaunchReadiness() service and prints a
 *      human-readable go/no-go report using the same gate names the
 *      audit page shows.
 *   5. Exits non-zero (1) if overall === "NO_GO".
 *
 * Idempotent: rerunning prints the same report and only creates a SUPERADMIN
 * when none exists.
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { prisma } from "@/lib/prisma";
import { getLaunchReadiness } from "@/server/launchReadiness/getLaunchReadiness";

const COLOR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function color(c: keyof typeof COLOR, s: string): string {
  if (!process.stdout.isTTY) return s;
  return `${COLOR[c]}${s}${COLOR.reset}`;
}

function statusBadge(s: "pass" | "warn" | "fail"): string {
  if (s === "pass") return color("green", "PASS");
  if (s === "warn") return color("yellow", "WARN");
  return color("red", "FAIL");
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

async function ensureSuperadmin(dryRun: boolean): Promise<void> {
  const existing = await prisma.userRole.findFirst({
    where: { roleKey: "SUPERADMIN" },
    include: { user: { select: { email: true, name: true } } },
  });
  if (existing) {
    console.log(
      color(
        "dim",
        `SUPERADMIN already exists: ${existing.user.email} (${existing.user.name ?? "no name"}). Skipping create.`,
      ),
    );
    return;
  }

  if (dryRun) {
    console.log(
      color(
        "yellow",
        "No SUPERADMIN exists. Dry-run mode — skipping interactive create.",
      ),
    );
    return;
  }

  console.log(color("bold", "\nNo SUPERADMIN found. Creating the first one.\n"));
  const rl = readline.createInterface({ input, output });
  try {
    let email = "";
    while (!/^\S+@\S+\.\S+$/.test(email)) {
      email = (await rl.question("Superadmin email: ")).trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        console.log(color("red", "  Invalid email, try again."));
      }
      if (email.endsWith("@oku.local")) {
        console.log(
          color(
            "red",
            "  @oku.local addresses are reserved for demo users. Use a real email.",
          ),
        );
        email = "";
      }
    }
    let name = "";
    while (!name) {
      name = (await rl.question("Display name: ")).trim();
      if (!name) console.log(color("red", "  Name cannot be empty."));
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    const user = existingUser
      ? existingUser
      : await prisma.user.create({ data: { email, name } });

    await prisma.userRole.upsert({
      where: { userId_roleKey: { userId: user.id, roleKey: "SUPERADMIN" } },
      update: {},
      create: { userId: user.id, roleKey: "SUPERADMIN" },
    });

    await prisma.auditLog
      .create({
        data: {
          actorId: user.id,
          action: "launch.bootstrap.superadmin_created",
          metadata: {
            email,
            reusedExistingUser: !!existingUser,
            timestamp: new Date().toISOString(),
          },
        },
      })
      .catch(() => {});

    console.log(
      color(
        "green",
        `\nCreated SUPERADMIN ${email}${existingUser ? " (granted role to existing user)" : ""}.`,
      ),
    );
  } finally {
    rl.close();
  }
}

function printReport(snapshot: Awaited<ReturnType<typeof getLaunchReadiness>>): void {
  console.log(color("bold", "\n=== OKÜ Launch Readiness ==="));
  console.log(color("dim", `checked at ${snapshot.checkedAt}\n`));

  const byCategory = new Map<string, typeof snapshot.gates>();
  for (const g of snapshot.gates) {
    const list = byCategory.get(g.category) ?? [];
    list.push(g);
    byCategory.set(g.category, list);
  }

  for (const [cat, gs] of byCategory) {
    console.log(color("cyan", `[${cat}]`));
    for (const g of gs) {
      const sev = g.severity === "informational" ? color("dim", " (info)") : "";
      const gateName = color("dim", `[${g.name}]`);
      console.log(`  ${statusBadge(g.status)} ${gateName} ${g.label}${sev}`);
      if (g.status !== "pass") {
        console.log(color("dim", `       → ${g.remediation}`));
        if (g.details) console.log(color("dim", `       · ${g.details}`));
      }
    }
    console.log("");
  }

  const verdict =
    snapshot.overall === "GO"
      ? color("green", "GO  ✓  Ready to take real money.")
      : color("red", "NO_GO  ✗  Fix blocking failures above before launch.");
  console.log(color("bold", `Verdict: ${verdict}\n`));
}

async function main(): Promise<void> {
  const dryRun = hasFlag("--allow-dry-run");

  if (process.env.DEMO_MODE_ENABLED === "true") {
    console.error(
      color(
        "red",
        "Refusing to run: DEMO_MODE_ENABLED=true. Unset this variable before bootstrapping.",
      ),
    );
    process.exit(2);
  }

  if (process.env.NODE_ENV !== "production" && !dryRun) {
    console.error(
      color(
        "red",
        `Refusing to run: NODE_ENV=${process.env.NODE_ENV ?? "development"}. ` +
          "Set NODE_ENV=production or pass --allow-dry-run to preview the report.",
      ),
    );
    process.exit(2);
  }

  if (dryRun) {
    console.log(color("yellow", "Dry run — no users will be created.\n"));
  }

  await ensureSuperadmin(dryRun);

  const snapshot = await getLaunchReadiness();
  printReport(snapshot);

  // Run-level audit entry — every invocation (including reruns and dry-runs)
  // leaves a trail with verdict + blocking failure count. Uses the first
  // SUPERADMIN as actor (or "system" when none exists yet).
  const firstSuperadmin = await prisma.userRole
    .findFirst({ where: { roleKey: "SUPERADMIN" }, select: { userId: true } })
    .catch(() => null);
  const blockingFailures = snapshot.gates.filter(
    (g) => g.severity === "blocking" && g.status === "fail",
  );
  await prisma.auditLog
    .create({
      data: {
        actorId: firstSuperadmin?.userId ?? "system",
        action: "launch.bootstrap.run",
        metadata: {
          dryRun,
          nodeEnv: process.env.NODE_ENV ?? "development",
          overall: snapshot.overall,
          checkedAt: snapshot.checkedAt,
          blockingFailureCount: blockingFailures.length,
          blockingFailureGates: blockingFailures.map((g) => g.name),
        },
      },
    })
    .catch((err) => {
      console.error(
        color("yellow", `Warning: failed to write run audit log: ${err?.message ?? err}`),
      );
    });

  if (snapshot.overall === "NO_GO") process.exit(1);
}

main()
  .catch((err) => {
    console.error(color("red", `\nBootstrap failed: ${err?.message ?? err}`));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
