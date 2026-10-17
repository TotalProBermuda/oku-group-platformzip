import { afterEach, describe, expect, it, vi } from "vitest";
import { hasConfiguredAuthSecret, resolveAuthSecret } from "@/lib/authSecret";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe.each(["production", "development", "test"])("auth secret in %s", mode => {
  it.each([
    ["primary only", "primary-test-fixture ", undefined, "primary-test-fixture "],
    ["alias only", undefined, "alias-test-fixture ", "alias-test-fixture "],
    ["both: primary wins", "primary-test-fixture", "alias-test-fixture", "primary-test-fixture"],
    ["empty primary uses alias", "", "alias-test-fixture", "alias-test-fixture"],
    ["empty alias keeps primary", "primary-test-fixture", "", "primary-test-fixture"],
  ])("%s, without rewriting or logging secret bytes", (_name, primary, alias, expected) => {
    vi.stubEnv("NODE_ENV", mode);
    vi.stubEnv("NEXTAUTH_SECRET", primary);
    vi.stubEnv("AUTH_SECRET", alias);
    const logs = ["log", "info", "warn", "error"].map(level =>
      vi.spyOn(console, level as "log").mockImplementation(() => {}));
    expect(hasConfiguredAuthSecret()).toBe(true);
    expect(resolveAuthSecret()).toBe(expected);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});

it.each([undefined, ""])("fails closed in production when both are %s", missing => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXTAUTH_SECRET", missing);
  vi.stubEnv("AUTH_SECRET", missing);
  expect(hasConfiguredAuthSecret()).toBe(false);
  expect(resolveAuthSecret).toThrow("NEXTAUTH_SECRET or AUTH_SECRET is required in production");
});

it.each(["test", "development"])("retains the existing non-production default in %s only", mode => {
  vi.stubEnv("NODE_ENV", mode);
  vi.stubEnv("NEXTAUTH_SECRET", undefined);
  vi.stubEnv("AUTH_SECRET", undefined);
  expect(hasConfiguredAuthSecret()).toBe(false);
  expect(resolveAuthSecret()).toBe("replace-me");
});
