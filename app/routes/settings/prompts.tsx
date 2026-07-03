import { createFileRoute } from "@tanstack/react-router";
import { PromptSettingsPage } from "@/features/settings/components/PromptSettingsPage";

export const Route = createFileRoute("/settings/prompts")({
  component: PromptSettingsPage,
});
