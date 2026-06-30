import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { approvalStatusForUser } from "./userAccess";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function adminEmail() {
  const email = normalizeEmail(process.env.AUTH_ADMIN_EMAIL);
  if (!email) throw new Error("AUTH_ADMIN_EMAIL must be configured.");
  return email;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params: Record<string, unknown>) {
        const now = Date.now();
        const email = normalizeEmail(params.email);
        const name = String(params.name ?? email.split("@")[0] ?? "User").trim();
        const isAdmin = email === adminEmail();

        if (!email) throw new Error("Email is required.");

        if (params.flow === "signUp" && isAdmin) {
          const expectedSecret = process.env.AUTH_SETUP_SECRET;
          if (!expectedSecret) throw new Error("AUTH_SETUP_SECRET must be configured before first registration.");
          if (params.setupSecret !== expectedSecret) throw new Error("Invalid setup secret.");
        }

        return {
          email,
          name,
          role: isAdmin ? "admin" : "user",
          approvalStatus: isAdmin ? "approved" : "pending",
          ...(isAdmin ? { approvalUpdatedAt: now } : {}),
          createdAt: now,
          updatedAt: now
        };
      }
    })
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx) {
      const users = await ctx.db.query("users").collect();
      const hasAdmin = users.some((user) => normalizeEmail(user.email) === adminEmail() && user.role === "admin");
      if (!hasAdmin) throw new Error("Create the admin account before requesting user access.");
    },
    async beforeSessionCreation(ctx, { userId }) {
      const user = await ctx.db.get(userId);
      if (!user) throw new Error("This account is not authorized.");

      if (approvalStatusForUser(user) !== "approved") {
        throw new Error("This account is waiting for admin approval.");
      }
    }
  }
});
