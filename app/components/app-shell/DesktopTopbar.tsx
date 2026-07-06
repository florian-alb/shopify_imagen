import { CircleGauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./ThemeToggle";

export function DesktopTopbar() {
  return (
    <header className="hidden h-16 items-center justify-between gap-4 px-5 md:flex">
      <div className="flex w-full items-center justify-end gap-2">
        <Badge
          variant="outline"
          className="border-primary/25 bg-primary/10 text-primary"
        >
          <CircleGauge className="mr-1 size-3" />
          Cles API serveur
        </Badge>
        <Badge
          variant="outline"
          className="hidden border-white/10 bg-white/[0.03] tabular-nums lg:inline-flex"
        >
          Cout suivi par job
        </Badge>
        <ThemeToggle />
      </div>
    </header>
  );
}
