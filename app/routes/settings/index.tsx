import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings/components/SettingsPage";

import { validateSettingsSearch } from "@/features/settings/lib/settingsSearch";

export const Route = createFileRoute("/settings/")({
  validateSearch: validateSettingsSearch,
  component: SettingsRoute,
});

function SettingsRoute() {
  return <SettingsPage search={Route.useSearch()} />;
}
