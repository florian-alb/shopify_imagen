import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

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
        const name = String(params.name ?? email.split("@")[0] ?? "Admin").trim();
        if (!email) throw new Error("Email is required.");
        if (email !== adminEmail()) throw new Error("Invalid credentials.");
        if (params.flow === "signUp") {
          const expectedSecret = process.env.AUTH_SETUP_SECRET;
          if (!expectedSecret) throw new Error("AUTH_SETUP_SECRET must be configured for the first registration.");
          if (params.setupSecret !== expectedSecret) throw new Error("Invalid setup secret.");
        }
        return {
          email,
          name,
          role: "admin",
          createdAt: now,
          updatedAt: now
        };
      }
    })
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      const users = await ctx.db.query("users").collect();
      if (users.some((user) => user._id !== userId)) {
        throw new Error("Registration is disabled after the admin account is created.");
      }
    },
    async beforeSessionCreation(ctx, { userId }) {
      const user = await ctx.db.get(userId);
      if (!user || user.email !== adminEmail() || user.role !== "admin") {
        throw new Error("This account is not authorized.");
      }
    }
  }
});
