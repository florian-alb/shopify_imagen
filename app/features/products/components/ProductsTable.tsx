import { useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProductSearch } from "@/lib/productFilters";
import { cn } from "@/lib/utils";
import type { BulkProductLock, ProductListItem } from "../types";
import { ProductQuickView } from "./ProductQuickView";
import { ProductTableRow } from "./ProductTableRow";

export function ProductsTable({ products, search, selected, bulkLocksByProductId, allVisibleSelected, onToggleProduct, onToggleVisible, onGenerateOne }: {
  products: ProductListItem[];
  search: ProductSearch;
  selected: Set<ProductListItem["_id"]>;
  bulkLocksByProductId: ReadonlyMap<ProductListItem["_id"], BulkProductLock>;
  allVisibleSelected: boolean;
  onToggleProduct: (productId: ProductListItem["_id"]) => void;
  onToggleVisible: () => void;
  onGenerateOne: (product: ProductListItem) => void;
}) {
  const [inspectedId, setInspectedId] = useState<ProductListItem["_id"] | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const inspected = products.find(product => product._id === inspectedId);
  function inspect(product: ProductListItem) {
    opener.current = document.activeElement as HTMLElement | null;
    setInspectedId(product._id);
  }
  function close() {
    setInspectedId(null);
    requestAnimationFrame(() => opener.current?.focus());
  }

  return (
    <div className={cn("grid min-w-0 items-start gap-5", inspected && "xl:grid-cols-[minmax(0,1fr)_19rem]")}>
      <div className={cn("studio-panel @container min-w-0 overflow-hidden", inspected && "max-xl:hidden")}>
        <Table className="table-fixed [&_td]:py-4">
          <TableHeader><TableRow className="hover:bg-transparent">
            <TableHead className="w-10 !pl-3 !pr-0 sm:!pl-4"><Checkbox checked={allVisibleSelected || (products.some(p => selected.has(p._id)) ? "indeterminate" : false)} onCheckedChange={onToggleVisible} aria-label="Sélectionner la page" /></TableHead>
            <TableHead>Produit</TableHead>
            <TableHead className="hidden w-28 @[44rem]:table-cell">Visuels</TableHead>
            <TableHead className="hidden w-36 @[30rem]:table-cell">Prochaine action</TableHead>
            <TableHead className="w-12 @[52rem]:w-36"><span className="sr-only">Actions</span></TableHead>
          </TableRow></TableHeader>
          <TableBody>{products.map(product => <ProductTableRow key={product._id} product={product} search={search}
            selected={selected.has(product._id)} inspecting={inspectedId === product._id} bulkLock={bulkLocksByProductId.get(product._id)}
            onToggle={() => onToggleProduct(product._id)} onGenerateOne={() => onGenerateOne(product)} onInspect={() => inspect(product)} />)}</TableBody>
        </Table>
      </div>
      {inspected && <ProductQuickView product={inspected} search={search} onClose={close} onGenerate={() => onGenerateOne(inspected)} />}
    </div>
  );
}
