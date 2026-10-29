import { Button } from "@/components/ui/button"
import { effectiveMenu, type Structure } from "../../../../convex/catalogue/model"
import { collectionKey } from "../../../../convex/catalogue/source"

export function CatalogMenu({ structure, origin, showCollection }: {
  structure: Structure
  origin: string
  showCollection: (key: string) => void
}) {
  const nodes = effectiveMenu(structure, origin)
  const outside = structure.collections.filter((col) => col.outsideMenu && !col.ignored)
  return (
    <section className="max-w-3xl space-y-6 px-4 py-5 md:px-6 xl:px-8">
      {nodes.length ? <MenuTree nodes={nodes} showCollection={showCollection} /> : <p className="text-sm text-muted-foreground">Aucun élément de menu.</p>}
      {outside.length > 0 && <details className="border-t pt-4 text-sm">
        <summary className="w-fit cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-ring">
          Collections hors menu ({outside.length})
        </summary>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {outside.map((col) => <Button key={col.key} variant="link" className="h-auto max-w-full whitespace-normal px-0 py-1 text-left"
            onClick={() => showCollection(col.key)}>{col.title}</Button>)}
        </div>
      </details>}
    </section>
  )
}

function MenuTree({ nodes, showCollection }: {
  nodes: Structure["menu"]
  showCollection: (key: string) => void
}) {
  const show = (url: string) => {
    const key = collectionKey(url, new URL(url).origin)
    if (key) showCollection(key)
  }
  return (
    <ul className="space-y-2 text-sm">
      {nodes.map((node) => <li key={node.key} className="[overflow-wrap:anywhere]">
        {node.children.length ? (
          <details open>
            <summary className="cursor-pointer rounded-sm py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring">{node.title}</summary>
            <div className="ml-2 border-l pl-4">
              {node.url && <Button variant="link" size="sm" className="px-0" onClick={() => show(node.url!)}>Voir les produits</Button>}
              <MenuTree nodes={node.children} showCollection={showCollection} />
            </div>
          </details>
        ) : node.url ? (
          <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal px-0 py-2 text-left" onClick={() => show(node.url!)}>{node.title}</Button>
        ) : <span className="inline-block py-2">{node.title}</span>}
      </li>)}
    </ul>
  )
}
