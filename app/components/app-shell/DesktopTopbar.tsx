import { AppBreadcrumbs } from "./AppBreadcrumbs";
import { ThemeToggle } from "./ThemeToggle";

export function DesktopTopbar() {
  return (
    <header className="studio-toolbar sticky top-0 z-30 hidden h-14 items-center justify-between gap-4 px-6 md:flex xl:px-8">
      <AppBreadcrumbs className="flex-1" />
      <div className="flex shrink-0 items-center justify-end gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
