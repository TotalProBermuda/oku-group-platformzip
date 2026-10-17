import { describe, expect, it } from "vitest";
import { defaultField, effectiveField, type State } from "@/server/series/sessionState";

function fixture(defaults: unknown = null, withSession = true) {
  const session = { capacity: 17, fieldModes: { capacity: { mode: "inherit" } } };
  const state = {
    series: { capacityTotal: 9999, sessionDefaults: defaults },
    sessions: withSession ? [session] : [], translations: [], sponsors: [],
  } as unknown as State;
  return { state, session: session as unknown as State["sessions"][number] };
}

describe("per-session capacity defaults", () => {
  it("never substitutes the series aggregate for a submitted occurrence capacity", () => {
    const { state, session } = fixture();
    expect(effectiveField(state, session, "capacity").value).toBe(17);
    expect(defaultField(state, "capacity").value).toBeNull();
  });
  it("applies an explicit occurrence default and preserves capacity when it is removed", () => {
    const { state, session } = fixture({ capacity: { mode: "override", value: 33 } });
    expect(effectiveField(state, session, "capacity").value).toBe(33);
    expect(defaultField(state, "capacity").value).toBe(33);
    state.series.sessionDefaults = { capacity: { mode: "inherit" } };
    expect(effectiveField(state, session, "capacity").value).toBe(17);
    expect(defaultField(state, "capacity").value).toBeNull();
  });
  it("does not show the aggregate as a default even when the series has no sessions", () => {
    expect(defaultField(fixture(null, false).state, "capacity").value).toBeNull();
    expect(defaultField(fixture({ capacity: { mode: "override", value: 33 } }, false).state, "capacity").value).toBe(33);
  });
});
