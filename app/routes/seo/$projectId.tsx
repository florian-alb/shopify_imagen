import { createFileRoute } from "@tanstack/react-router"
import { SeoWorkspace } from "@/features/seo/components/SeoWorkspace"
export const Route = createFileRoute("/seo/$projectId")({ component: Page })
function Page() { return <SeoWorkspace projectId={Route.useParams().projectId} /> }
