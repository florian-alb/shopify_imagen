import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AppLogo } from "./AppLogo";
import { LogoutButton } from "./LogoutButton";
import { navGroups } from "./navigation";
import { ShopSwitcher } from "./ShopSwitcher";
import { ThemeToggle } from "./ThemeToggle";

export function MobileTopbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="studio-toolbar sticky top-0 z-30 flex h-14 items-center justify-between px-4 md:hidden">
      <Link to="/products" className="flex items-center gap-2 font-medium">
        <AppLogo size="sm" />
        <span>Image Studio</span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Ouvrir la navigation"
            >
              <Menu className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[19rem] border-sidebar-border bg-sidebar p-0"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
              <div className="flex items-center gap-3">
                <AppLogo />
                <div>
                  <p className="mt-1 text-lg font-semibold">Image Studio</p>
                </div>
              </div>

              <ShopSwitcher compact onNavigate={() => setOpen(false)} />

              <nav className="grid gap-4">
                {navGroups.map((group) => (
                  <div key={group.label}>
                    <p className="mb-2 text-xs text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="grid gap-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Button
                            key={item.to}
                            variant="ghost"
                            className="h-10 justify-start gap-3 aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-primary"
                            asChild
                          >
                            <Link to={item.to} activeOptions={{ exact: item.to === "/settings" }} onClick={() => setOpen(false)}>
                              <Icon className="size-4" />
                              {item.label}
                            </Link>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              <div className="mt-auto">
                <LogoutButton />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
