import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { pageContentClass } from "@/components/page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { Doc } from "@/lib/convex"
import { ProductImageHistory } from "./ProductImageHistory"

export function ArchivedProductHistory({ product, images, hasProductJobs }: {
  product: Doc<"products">
  images: Doc<"generatedImages">[]
  hasProductJobs: boolean
}) {
  return (
    <main className={pageContentClass}>
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/products"><ArrowLeft data-icon="inline-start" />Retour aux produits</Link>
      </Button>
      <h1 className="mb-4 break-words text-2xl font-semibold tracking-tight">{product.title}</h1>
      <Alert className="mb-6" role="status">
        <AlertTitle>Produit supprimé de Shopify</AlertTitle>
        <AlertDescription>Ce produit a été retiré du catalogue actif. Ses générations, images et résultats restent consultables dans cet historique.</AlertDescription>
      </Alert>
      <ProductImageHistory productId={product._id} images={images} hasProductJobs={hasProductJobs} />
    </main>
  )
}
