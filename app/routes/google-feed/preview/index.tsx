import { createFileRoute, redirect } from "@tanstack/react-router"

import { validateGoogleFeedPreviewSearch } from "@/features/google-feed/lib/search"

export const Route = createFileRoute("/google-feed/preview/")({
  validateSearch: validateGoogleFeedPreviewSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/google-feed",
      search: {
        view: search.status === "conflict" || search.status === "invalid" ? "review" : "ready",
      },
      replace: true,
    })
  },
})
