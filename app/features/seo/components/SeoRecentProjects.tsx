import { Link } from "@tanstack/react-router"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/lib/convex"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { findSeoLanguage } from "../lib/market"

export function SeoRecentProjects({ projects }: { projects: FunctionReturnType<typeof api.seoProjects.list> | undefined }) {
  return <aside className="min-w-0 border-t pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0" aria-labelledby="seo-recent-title">
    <h2 id="seo-recent-title" className="mb-4 text-base font-semibold">Projets récents</h2>
    {projects === undefined ? <div className="flex flex-col gap-3"><Skeleton className="h-5 w-28" /><Skeleton className="h-4 w-40" /></div> :
      projects.length ? <div className="flex flex-col divide-y">{projects.map(project => <Link key={project._id} to="/seo/$projectId" params={{ projectId: project._id }}
        className="flex min-w-0 flex-col gap-1 rounded-md px-2 py-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <span className="truncate text-sm font-medium">{project.config.theme}</span>
        <span className="text-sm text-muted-foreground">{project.config.targetCountry} · {findSeoLanguage(project.config.targetLanguage)?.label || project.config.targetLanguage}</span>
        <span className="text-sm text-muted-foreground">{project.keywordCount} mots-clés</span>
      </Link>)}</div> : <p className="text-sm leading-6 text-muted-foreground">Ton premier projet apparaîtra ici après l’import de ton export Excel.</p>}
    <Separator className="my-5" />
    <p className="max-w-prose text-sm leading-6 text-muted-foreground">Retrouve ici tes projets pour corriger puis exporter leur arborescence.</p>
  </aside>
}
