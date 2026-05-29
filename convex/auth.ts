import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params: Record<string, unknown>) {
        const now = Date.now();
        const email = String(params.email ?? "").trim().toLowerCase();
        const name = String(params.name ?? email.split("@")[0] ?? "Admin").trim();
        if (!email) throw new Error("Email is required.");
        return {
          email,
          name,
          role: "admin",
          createdAt: now,
          updatedAt: now
        };
      }
    })
  ]
});
