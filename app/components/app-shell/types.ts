import type { Id } from "../../../convex/_generated/dataModel";

export type ThemeMode = "light" | "dark";

export type ShopOption = {
  _id: Id<"shops"> | null;
  domain: string;
  name: string;
  storeHandle: string;
  isActive: boolean;
};
