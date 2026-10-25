import { describe, expect, it } from "vitest";
import { validateProductSearch } from "../../../lib/productFilters";
import { adjacentProductSearch, productActionSearch, validateProductWorkspaceSearch } from "./productWorkspaceSearch";

const list = { q: "lin", collection: "salon", action: "review" as const, page: 3, pageSize: 50 };

describe("product workspace navigation", () => {
  it("opens the requested task without overwriting the list filter", () => {
    expect(productActionSearch(list, "review")).toMatchObject({ ...list, view: "images", images: "pending" });
    expect(productActionSearch(list, "push")).toMatchObject({ ...list, images: "ready", prepare: "publish" });
    expect(productActionSearch(list, "wait").images).toBe("running");
    expect(productActionSearch(list, "fix_errors").images).toBe("failed");
  });

  it("preserves the exact list context on return, discarding workspace state", () => {
    const search = validateProductWorkspaceSearch({ ...list, view: "history", images: "failed", group: "group-a", prepare: "publish" });
    expect(validateProductSearch(search)).toEqual(validateProductSearch(list));
    expect(search).toMatchObject({ group: "group-a", view: "history", images: "failed", prepare: "publish" });
  });

  it("keeps the review view on the next product but clears product-specific scope and intent", () => {
    expect(adjacentProductSearch({ ...list, group: "group-a", view: "images", images: "pending", prepare: "publish" }))
      .toMatchObject({ ...list, view: "images", images: "pending", group: undefined, prepare: undefined });
  });

  it("rejects unknown URL views and never treats truthy values as a publish intent", () => {
    expect(validateProductWorkspaceSearch({ view: "delete", images: "everything", group: 4, prepare: true }))
      .toMatchObject({ view: undefined, images: undefined, group: undefined, prepare: undefined });
    expect(validateProductWorkspaceSearch({ group: "  " }).group).toBeUndefined();
  });
});
