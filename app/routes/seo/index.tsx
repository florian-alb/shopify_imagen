import { createFileRoute } from "@tanstack/react-router"
import { SeoHome } from "@/features/seo/components/SeoHome"
export const Route = createFileRoute("/seo/")({ component: SeoHome })
