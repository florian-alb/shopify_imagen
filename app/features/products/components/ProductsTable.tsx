import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductSearch } from "@/lib/productFilters";

import type { BulkProductLock, ProductListItem } from "../types";
import { ProductTableRow } from "./ProductTableRow";

export function ProductsTable({
  products,
  search,
  selected,
  bulkLocksByProductId,
  allVisibleSelected,
  onToggleProduct,
  onToggleVisible,
  onGenerateOne,
}: {
  products: ProductListItem[];
  search: ProductSearch;
  selected: Set<ProductListItem["_id"]>;
  bulkLocksByProductId: ReadonlyMap<ProductListItem["_id"], BulkProductLock>;
  allVisibleSelected: boolean;
  onToggleProduct: (productId: ProductListItem["_id"]) => void;
  onToggleVisible: () => void;
  onGenerateOne: (product: ProductListItem) => void;
}) {
  return (
    <Card className="overflow-hidden rounded-lg">
      <Table className="[&_td]:h-16 [&_th]:text-[0.72rem] [&_th]:font-medium [&_th]:text-muted-foreground min-w-[980px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={onToggleVisible}
                aria-label="Selectionner la page"
              />
            </TableHead>
            <TableHead>Produit</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Generation</TableHead>
            <TableHead>Review</TableHead>
            <TableHead>Publication</TableHead>
            <TableHead>Images</TableHead>
            <TableHead>Shopify</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <ProductTableRow
              key={product._id}
              product={product}
              search={search}
              selected={selected.has(product._id)}
              bulkLock={bulkLocksByProductId.get(product._id)}
              onToggle={() => onToggleProduct(product._id)}
              onGenerateOne={() => onGenerateOne(product)}
            />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
