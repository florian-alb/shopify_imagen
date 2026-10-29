import { useQuery } from "convex/react"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getShopifyAdminUrl } from "@/features/shopify"
import { api, type Id } from "@/lib/convex"

export function GoogleFeedShopifyProductLink({ productId }: { productId: Id<"products"> }) {
  const product = useQuery(api.products.get, { productId })
  const shop = useQuery(api.settings.shopInfo)
  const url = getShopifyAdminUrl(product, shop?.storeHandle)
  if (!url || (product?.shopId ?? null) !== (shop?.shopId ?? null)) return null

  return (
    <Button asChild variant="link" size="sm" className="h-auto self-start p-0">
      <a href={url} target="_blank" rel="noopener noreferrer"
        aria-label="Ouvrir le produit dans Shopify (nouvel onglet)">
        Ouvrir dans Shopify
        <ExternalLink data-icon="inline-end" aria-hidden="true" />
      </a>
    </Button>
  )
}
