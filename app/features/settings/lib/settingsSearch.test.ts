import { describe, expect, it } from "vitest";
import { validateSettingsSearch } from "./settingsSearch";

describe("settings navigation", () => {
  it("retains the selected tab and OAuth feedback, never connection credentials", () => {
    expect(validateSettingsSearch({ tab: "generation", shopify_oauth: "success", clientSecret: "not-a-real-secret", clientId: "test" })).toEqual({ tab: "generation", shopify_oauth: "success" });
  });
  it("falls back safely for invalid or array-valued tabs", () => {
    expect(validateSettingsSearch({ tab: "unknown", shopify_oauth: "unknown" })).toEqual({ tab: undefined, shopify_oauth: undefined });
    expect(validateSettingsSearch({ tab: ["generation"] }).tab).toBeUndefined();
  });
});
