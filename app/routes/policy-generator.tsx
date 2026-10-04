import { createFileRoute } from "@tanstack/react-router"
import { PolicyGeneratorPage } from "@/features/policy-generator/components/PolicyGeneratorPage"

export const Route = createFileRoute("/policy-generator")({
  component: PolicyGeneratorPage,
  head: () => ({ meta: [{ title: "Générateur de politiques · Image Studio" }] }),
})
