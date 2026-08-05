import { useQuery } from "convex/react";
import { ChevronDown, ChevronRight, PackageOpen } from "lucide-react";
import { Fragment } from "react";

import { StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Id } from "@/lib/convex";
import { cn } from "@/lib/utils";

import { ageGroupOptions, genderOptions, statusLabels } from "../constants";
import { GoogleCategoryCombobox } from "./GoogleCategoryCombobox";
import { GoogleValueSelect } from "./GoogleValueSelect";

export type GoogleFeedCatalogProduct = {
  id: Id<"products">;
  shopifyProductId: string;
  title: string;
  handle: string;
  featuredImageUrl: string | null;
  productType: string | null;
  shopifyStatus: string | null;
  variantCount: number;
  category: string | null;
  categoryDraft: DraftSummary | null;
  gender: string | null;
  genderInconsistent: boolean;
  genderDraftCount: number;
  ageGroupSummary: Array<{ value: string; count: number }>;
  missingAgeGroupCount: number;
  conflictCount: number;
  modifiedCount: number;
  lastSyncedAt: number | null;
};

type DraftSummary = {
  id: Id<"googleFeedDrafts">;
  proposedValue: string;
  sourceLabel: string;
  status:
    | "draft"
    | "conflict"
    | "invalid"
    | "publishing"
    | "confirmed"
    | "failed";
  included: boolean;
};

export function GoogleFeedCatalogTable({
  products,
  expanded,
  selectedProducts,
  selectedVariants,
  pageSelection,
  selectionCount,
  allFilteredSelected,
  selectingAll,
  categoryEnabled,
  genderEnabled,
  ageGroupEnabled,
  onExpand,
  onSelectPage,
  onSelectAllFiltered,
  onClearSelection,
  onSelectProduct,
  onSelectVariant,
  onCategory,
  onGender,
  onAgeGroup,
}: {
  products: GoogleFeedCatalogProduct[];
  expanded: ReadonlySet<Id<"products">>;
  selectedProducts: ReadonlySet<Id<"products">>;
  selectedVariants: ReadonlySet<Id<"productVariants">>;
  pageSelection: boolean | "indeterminate";
  selectionCount: number;
  allFilteredSelected: boolean;
  selectingAll: boolean;
  categoryEnabled: boolean;
  genderEnabled: boolean;
  ageGroupEnabled: boolean;
  onExpand: (productId: Id<"products">) => void;
  onSelectPage: (selected: boolean) => void;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onSelectProduct: (productId: Id<"products">, selected: boolean) => void;
  onSelectVariant: (
    variantId: Id<"productVariants">,
    selected: boolean,
  ) => void;
  onCategory: (productId: Id<"products">, value: string) => void;
  onGender: (productId: Id<"products">, value: string) => void;
  onAgeGroup: (variantId: Id<"productVariants">, value: string) => void;
}) {
  return (
    <>
      <Card className="hidden gap-0 overflow-x-auto rounded-lg py-0 lg:block">
        <Table className="min-w-[1120px] [&_th]:sticky [&_th]:top-0 [&_th]:bg-card">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="left-0 z-20 w-28 min-w-28 max-w-28 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:border-r after:border-border after:content-['']">
                <SelectionControl
                  pageSelection={pageSelection}
                  selectionCount={selectionCount}
                  allFilteredSelected={allFilteredSelected}
                  selectingAll={selectingAll}
                  onSelectPage={onSelectPage}
                  onSelectAllFiltered={onSelectAllFiltered}
                  onClearSelection={onClearSelection}
                />
              </TableHead>
              <TableHead className="z-10 min-w-56">Produit</TableHead>
              <TableHead className="z-10 min-w-72">Catégorie Google</TableHead>
              <TableHead className="z-10 min-w-44">Genre</TableHead>
              <TableHead className="z-10 min-w-48">Tranches d’âge</TableHead>
              <TableHead className="z-10 min-w-40">État</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <DesktopProductRows
                key={product.id}
                product={product}
                expanded={expanded.has(product.id)}
                selected={selectedProducts.has(product.id)}
                selectedVariants={selectedVariants}
                categoryEnabled={categoryEnabled}
                genderEnabled={genderEnabled}
                ageGroupEnabled={ageGroupEnabled}
                onExpand={() => onExpand(product.id)}
                onSelect={(selected) => onSelectProduct(product.id, selected)}
                onSelectVariant={onSelectVariant}
                onCategory={(value) => onCategory(product.id, value)}
                onGender={(value) => onGender(product.id, value)}
                onAgeGroup={onAgeGroup}
              />
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="mb-3 flex h-14 items-center rounded-lg border bg-card px-4 lg:hidden">
        <SelectionControl
          pageSelection={pageSelection}
          selectionCount={selectionCount}
          allFilteredSelected={allFilteredSelected}
          selectingAll={selectingAll}
          onSelectPage={onSelectPage}
          onSelectAllFiltered={onSelectAllFiltered}
          onClearSelection={onClearSelection}
        />
      </div>
      <div className="grid gap-3 lg:hidden">
        {products.map((product) => (
          <MobileProductRow
            key={product.id}
            product={product}
            expanded={expanded.has(product.id)}
            selected={selectedProducts.has(product.id)}
            selectedVariants={selectedVariants}
            categoryEnabled={categoryEnabled}
            genderEnabled={genderEnabled}
            ageGroupEnabled={ageGroupEnabled}
            onExpand={() => onExpand(product.id)}
            onSelect={(selected) => onSelectProduct(product.id, selected)}
            onSelectVariant={onSelectVariant}
            onCategory={(value) => onCategory(product.id, value)}
            onGender={(value) => onGender(product.id, value)}
            onAgeGroup={onAgeGroup}
          />
        ))}
      </div>
    </>
  );
}

function SelectionControl({
  pageSelection,
  selectionCount,
  allFilteredSelected,
  selectingAll,
  onSelectPage,
  onSelectAllFiltered,
  onClearSelection,
}: {
  pageSelection: boolean | "indeterminate";
  selectionCount: number;
  allFilteredSelected: boolean;
  selectingAll: boolean;
  onSelectPage: (selected: boolean) => void;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={pageSelection}
        aria-label="Sélectionner tous les produits de cette page"
        onCheckedChange={(checked) => onSelectPage(checked === true)}
      />
      {selectionCount > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={selectingAll}
              aria-label={`${selectionCount} résultat${selectionCount === 1 ? "" : "s"} sélectionné${selectionCount === 1 ? "" : "s"}. Afficher les options de sélection`}
            >
              {selectionCount}
              <ChevronDown data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-72">
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={allFilteredSelected || selectingAll}
                onSelect={onSelectAllFiltered}
              >
                Tout sélectionner dans les résultats filtrés
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onClearSelection}>
                Tout désélectionner
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

type ProductRowsProps = {
  product: GoogleFeedCatalogProduct;
  expanded: boolean;
  selected: boolean;
  selectedVariants: ReadonlySet<Id<"productVariants">>;
  categoryEnabled: boolean;
  genderEnabled: boolean;
  ageGroupEnabled: boolean;
  onExpand: () => void;
  onSelect: (selected: boolean) => void;
  onSelectVariant: (
    variantId: Id<"productVariants">,
    selected: boolean,
  ) => void;
  onCategory: (value: string) => void;
  onGender: (value: string) => void;
  onAgeGroup: (variantId: Id<"productVariants">, value: string) => void;
};

function DesktopProductRows(props: ProductRowsProps) {
  const { product } = props;
  return (
    <Fragment>
      <TableRow data-state={props.selected ? "selected" : undefined}>
        <TableCell
          className={cn(
            "sticky left-0 z-[5] w-28 min-w-28 max-w-28 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:border-r after:border-border after:content-['']",
            props.selected ? "bg-muted" : "bg-card",
          )}
        >
          <div className="flex items-center gap-2">
            <Checkbox
              checked={props.selected}
              aria-label={`Sélectionner ${product.title}`}
              onCheckedChange={(checked) => props.onSelect(checked === true)}
            />
            <ProductThumbnail product={product} />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={
                props.expanded
                  ? "Replier les variantes"
                  : "Afficher les variantes"
              }
              aria-expanded={props.expanded}
              onClick={props.onExpand}
            >
              {props.expanded ? <ChevronDown /> : <ChevronRight />}
            </Button>
          </div>
        </TableCell>
        <TableCell>
          <ProductDetails product={product} />
        </TableCell>
        <TableCell>
          <GoogleCategoryCombobox
            compact
            disabled={!props.categoryEnabled}
            value={product.categoryDraft?.proposedValue ?? product.category}
            onChange={props.onCategory}
          />
          <DraftCaption
            current={product.category}
            draft={product.categoryDraft}
          />
        </TableCell>
        <TableCell>
          <GoogleValueSelect
            value={product.gender}
            options={genderOptions}
            disabled={!props.genderEnabled}
            label={`Genre de ${product.title}`}
            onChange={props.onGender}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {product.genderDraftCount
              ? `${product.genderDraftCount} variante(s) modifiée(s)`
              : product.genderInconsistent
                ? "Incohérence entre variantes"
                : "Valeur Shopify"}
          </p>
        </TableCell>
        <TableCell>
          <AgeSummary product={product} />
        </TableCell>
        <TableCell>
          <ProductState product={product} />
        </TableCell>
      </TableRow>
      {props.expanded ? <DesktopVariantRows {...props} /> : null}
    </Fragment>
  );
}

function DesktopVariantRows(props: ProductRowsProps) {
  const variants = useQuery(api.googleFeed.variantsForProduct, {
    productId: props.product.id,
  });
  if (variants === undefined) {
    return (
      <TableRow className="bg-muted/35">
        <TableCell colSpan={6} className="py-4 text-sm text-muted-foreground">
          Chargement des variantes…
        </TableCell>
      </TableRow>
    );
  }
  return (
    <>
      {variants.map((variant) => (
        <TableRow key={variant.id} className="bg-muted/35 hover:bg-muted/55">
          <TableCell className="sticky left-0 z-[4] w-28 min-w-28 max-w-28 bg-muted after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:border-r after:border-border after:content-['']">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={
                  props.selected || props.selectedVariants.has(variant.id)
                }
                disabled={props.selected}
                aria-label={`Sélectionner la variante ${variant.title}`}
                onCheckedChange={(checked) =>
                  props.onSelectVariant(variant.id, checked === true)
                }
              />
              <div className="size-10 shrink-0" aria-hidden="true" />
              <div className="size-7 shrink-0" aria-hidden="true" />
            </div>
          </TableCell>
          <TableCell>
            <p className="font-medium">{variant.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {variant.sku || "Sans SKU"} ·{" "}
              {variant.selectedOptions
                .map((option) => `${option.name}: ${option.value}`)
                .join(" · ")}
            </p>
          </TableCell>
          <TableCell className="text-xs text-muted-foreground">
            Héritée du produit
          </TableCell>
          <TableCell>
            <span className="text-sm">
              {variant.genderDraft?.proposedValue ??
                variant.gender ??
                "Non renseigné"}
            </span>
            <DraftCaption
              current={variant.gender}
              draft={variant.genderDraft}
            />
          </TableCell>
          <TableCell>
            <GoogleValueSelect
              value={variant.ageGroupDraft?.proposedValue ?? variant.ageGroup}
              options={ageGroupOptions}
              disabled={!props.ageGroupEnabled}
              label={`Tranche d’âge de ${variant.title}`}
              onChange={(value) => props.onAgeGroup(variant.id, value)}
            />
            <DraftCaption
              current={variant.ageGroup}
              draft={variant.ageGroupDraft}
            />
          </TableCell>
          <TableCell>
            {variant.ageGroupDraft ? (
              <StateBadge
                state={
                  variant.ageGroupDraft.status === "conflict"
                    ? "danger"
                    : "warning"
                }
              >
                {statusLabels[variant.ageGroupDraft.status]}
              </StateBadge>
            ) : (
              <span className="text-xs text-muted-foreground">Synchronisé</span>
            )}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function MobileProductRow(props: ProductRowsProps) {
  const variants = useQuery(
    api.googleFeed.variantsForProduct,
    props.expanded ? { productId: props.product.id } : "skip",
  );
  const product = props.product;
  return (
    <Card className="gap-0 overflow-hidden rounded-lg">
      <div className="flex items-start gap-3 p-4">
        <Checkbox
          checked={props.selected}
          aria-label={`Sélectionner ${product.title}`}
          onCheckedChange={(checked) => props.onSelect(checked === true)}
        />
        <div className="min-w-0 flex-1">
          <ProductIdentity product={product} />
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-expanded={props.expanded}
          aria-label="Afficher les variantes"
          onClick={props.onExpand}
        >
          {props.expanded ? <ChevronDown /> : <ChevronRight />}
        </Button>
      </div>
      <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
        <LabeledValue label="Catégorie Google">
          <GoogleCategoryCombobox
            value={product.categoryDraft?.proposedValue ?? product.category}
            disabled={!props.categoryEnabled}
            onChange={props.onCategory}
          />
        </LabeledValue>
        <LabeledValue label="Genre">
          <GoogleValueSelect
            value={product.gender}
            options={genderOptions}
            disabled={!props.genderEnabled}
            label={`Genre de ${product.title}`}
            onChange={props.onGender}
          />
        </LabeledValue>
        <LabeledValue label="Tranches d’âge">
          <AgeSummary product={product} />
        </LabeledValue>
        <LabeledValue label="État">
          <ProductState product={product} />
        </LabeledValue>
      </div>
      {props.expanded ? (
        <div className="divide-y border-t bg-muted/30">
          {variants === undefined ? (
            <p className="p-4 text-sm text-muted-foreground">
              Chargement des variantes…
            </p>
          ) : variants.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Aucune variante synchronisée.
            </p>
          ) : (
            variants.map((variant) => (
              <div key={variant.id} className="grid gap-3 p-4 sm:grid-cols-2">
                <div className="flex items-start gap-3 sm:col-span-2">
                  <Checkbox
                    checked={
                      props.selected || props.selectedVariants.has(variant.id)
                    }
                    disabled={props.selected}
                    aria-label={`Sélectionner ${variant.title}`}
                    onCheckedChange={(checked) =>
                      props.onSelectVariant(variant.id, checked === true)
                    }
                  />
                  <div>
                    <p className="font-medium">{variant.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {variant.sku || "Sans SKU"}
                    </p>
                  </div>
                </div>
                <LabeledValue label="Genre">
                  <span className="text-sm">
                    {variant.genderDraft?.proposedValue ??
                      variant.gender ??
                      "Non renseigné"}
                  </span>
                </LabeledValue>
                <LabeledValue label="Tranche d’âge">
                  <GoogleValueSelect
                    value={
                      variant.ageGroupDraft?.proposedValue ?? variant.ageGroup
                    }
                    options={ageGroupOptions}
                    disabled={!props.ageGroupEnabled}
                    label={`Tranche d’âge de ${variant.title}`}
                    onChange={(value) => props.onAgeGroup(variant.id, value)}
                  />
                </LabeledValue>
              </div>
            ))
          )}
        </div>
      ) : null}
    </Card>
  );
}

function ProductIdentity({ product }: { product: GoogleFeedCatalogProduct }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ProductThumbnail product={product} />
      <ProductDetails product={product} />
    </div>
  );
}

function ProductThumbnail({ product }: { product: GoogleFeedCatalogProduct }) {
  return (
    <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
      {product.featuredImageUrl ? (
        <img
          src={product.featuredImageUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <PackageOpen className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}

function ProductDetails({ product }: { product: GoogleFeedCatalogProduct }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{product.title}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {product.handle} · {product.variantCount} variante
        {product.variantCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function DraftCaption({
  current,
  draft,
}: {
  current: string | null;
  draft: DraftSummary | null;
}) {
  return (
    <p
      className={cn(
        "mt-1 text-xs",
        draft ? "text-primary" : "text-muted-foreground",
      )}
    >
      {draft
        ? `${draft.sourceLabel} · Shopify : ${current ?? "vide"}`
        : "Valeur Shopify actuelle"}
    </p>
  );
}

function AgeSummary({ product }: { product: GoogleFeedCatalogProduct }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {product.ageGroupSummary.map((item) => (
        <span
          key={item.value}
          className="rounded-md border bg-background px-2 py-1 text-xs"
        >
          {item.value} · {item.count}
        </span>
      ))}
      {product.missingAgeGroupCount ? (
        <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100">
          {product.missingAgeGroupCount} manquante
          {product.missingAgeGroupCount === 1 ? "" : "s"}
        </span>
      ) : null}
      {!product.ageGroupSummary.length && !product.missingAgeGroupCount ? (
        <span className="text-sm text-muted-foreground">Aucune variante</span>
      ) : null}
    </div>
  );
}

function ProductState({ product }: { product: GoogleFeedCatalogProduct }) {
  if (product.conflictCount)
    return (
      <StateBadge state="danger">
        {product.conflictCount} conflit{product.conflictCount === 1 ? "" : "s"}
      </StateBadge>
    );
  if (product.modifiedCount)
    return (
      <StateBadge state="warning">
        {product.modifiedCount} modification
        {product.modifiedCount === 1 ? "" : "s"}
      </StateBadge>
    );
  if (!product.category || !product.gender || product.missingAgeGroupCount)
    return <StateBadge>Incomplet</StateBadge>;
  return <StateBadge state="success">Complet</StateBadge>;
}

function LabeledValue({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
