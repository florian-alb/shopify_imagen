import { CircleGauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AppBreadcrumbs } from "./AppBreadcrumbs";
import { ThemeToggle } from "./ThemeToggle";

export function DesktopTopbar() {
  return (
    <header className="hidden h-16 items-center justify-between gap-4 px-5 md:flex">
      <AppBreadcrumbs className="flex-1" />
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Badge
          variant="outline"
          className="border-primary/25 bg-primary/10 text-primary"
        >
          <CircleGauge className="mr-1 size-3" />
          Cles API serveur
        </Badge>
        <Badge
          variant="outline"
          className="hidden tabular-nums lg:inline-flex"
        >
          Cout suivi par job
        </Badge>
        <ThemeToggle />
      </div>
    </header>
  );
}
