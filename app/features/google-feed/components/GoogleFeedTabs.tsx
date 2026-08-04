import { Link } from "@tanstack/react-router"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export type GoogleFeedTab = "catalog" | "rules" | "history"

const tabs = [
  { value: "catalog", label: "Catalogue", to: "/google-feed" },
  { value: "rules", label: "Règles", to: "/google-feed/rules" },
  { value: "history", label: "Historique", to: "/google-feed/history" },
] as const

export function GoogleFeedTabs({ active }: { active: GoogleFeedTab }) {
  return (
    <Tabs value={active} className="mb-4">
      <TabsList aria-label="Sections du Flux Google">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} asChild>
            <Link to={tab.to}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
