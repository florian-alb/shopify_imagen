import type { Doc } from "./_generated/dataModel";

export type ApprovalStatus = "pending" | "approved" | "rejected";

type UserAccessFields = Pick<Doc<"users">, "approvalStatus" | "role">;

export function approvalStatusForUser(user: UserAccessFields | null): ApprovalStatus {
  if (!user) return "rejected";
  if (user.approvalStatus === "approved" || user.approvalStatus === "rejected") {
    return user.approvalStatus;
  }
  return user.role === "admin" ? "approved" : "pending";
}

export function isApprovedUser(user: UserAccessFields | null) {
  return approvalStatusForUser(user) === "approved";
}
