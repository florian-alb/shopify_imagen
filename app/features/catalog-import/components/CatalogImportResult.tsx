import type { CatalogueImportResult } from "../types"

export function CatalogImportResult({ result }: { result: CatalogueImportResult }) {
  const products = result.selection?.products !== false
  return (
    <details className="mt-4 text-sm">
      <summary className="w-fit cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-ring">
        Dernier import · {result.domain}
        {products && <> · {result.complete} {result.complete === 1 ? "produit importé" : "produits importés"}</>}
        {products && result.failed > 0 && <> · {result.failed} {result.failed === 1 ? "échec" : "échecs"}</>}
      </summary>
      <ul className="mt-2 space-y-1">
        {products && <li>
          {result.created} {result.created === 1 ? "créé" : "créés"} en brouillon · {result.existing} {result.existing === 1 ? "existant" : "existants"} · {result.skipped} {result.skipped === 1 ? "non importé" : "non importés"}
        </li>}
        {result.collections !== undefined && result.selection?.collections !== false && <li>
          {result.collections} {result.collections === 1 ? "collection traitée" : "collections traitées"}
        </li>}
        {result.menuId && <li>Menu créé, non affecté au thème.</li>}
      </ul>
    </details>
  )
}
