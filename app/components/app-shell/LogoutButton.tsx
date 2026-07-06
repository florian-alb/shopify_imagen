import { useAuthActions } from "@convex-dev/auth/react";
import { LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function LogoutButton({ desktop = false }: { desktop?: boolean }) {
  const { signOut } = useAuthActions();
  const [signingOut, setSigningOut] = useState(false);

  async function logout() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  if (desktop) {
    return (
      <SidebarMenuButton
        tooltip="Deconnexion"
        className="h-10 gap-3 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        disabled={signingOut}
        onClick={() => void logout()}
      >
        <Avatar size="sm" className="rounded-md">
          <AvatarFallback className="rounded-md">
            <UserRound className="size-3.5" />
          </AvatarFallback>
        </Avatar>
        <span>{signingOut ? "Deconnexion..." : "Compte"}</span>
        <LogOut className="ml-auto size-4" />
      </SidebarMenuButton>
    );
  }

  return (
    <Button
      variant="outline"
      className="w-full justify-start gap-3"
      disabled={signingOut}
      onClick={() => void logout()}
    >
      <LogOut className="size-4" />
      {signingOut ? "Deconnexion..." : "Se deconnecter"}
    </Button>
  );
}
