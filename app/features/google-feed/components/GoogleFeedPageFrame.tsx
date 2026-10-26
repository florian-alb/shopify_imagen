import type { ReactNode } from "react"
import { pageContentClass } from "@/components/page"
import type { FeedSearch } from "../lib/workspace-search"
import { GoogleFeedWorkspaceHeader } from "./GoogleFeedWorkspaceHeader"

export function GoogleFeedPageFrame({
  active,
  backSearch,
  children,
}: {
  active: "rules" | "history"
  backSearch?: FeedSearch
  children: ReactNode
}) {
  return (
    <main className={pageContentClass}>
      <GoogleFeedWorkspaceHeader active={active} backSearch={backSearch} />
      {children}
    </main>
  )
}
