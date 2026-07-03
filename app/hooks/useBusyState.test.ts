import { describe, expect, it } from "vitest";

import { busyStateIsActive, busyStateKey, busyStateValue } from "./useBusyState";

describe("busy state helpers", () => {
  it("represents anonymous busy work", () => {
    const value = busyStateValue();

    expect(value).toBe(true);
    expect(busyStateKey(value)).toBeNull();
    expect(busyStateIsActive(value)).toBe(true);
    expect(busyStateIsActive(value, "save")).toBe(false);
  });

  it("represents keyed busy work", () => {
    const value = busyStateValue("save");

    expect(value).toBe("save");
    expect(busyStateKey(value)).toBe("save");
    expect(busyStateIsActive(value)).toBe(true);
    expect(busyStateIsActive(value, "save")).toBe(true);
    expect(busyStateIsActive(value, "publish")).toBe(false);
  });

  it("treats null as idle", () => {
    expect(busyStateKey(null)).toBeNull();
    expect(busyStateIsActive(null)).toBe(false);
    expect(busyStateIsActive(null, "save")).toBe(false);
  });
});
