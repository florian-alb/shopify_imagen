import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ImageIcon, RefreshCw, Search, SlidersHorizontal, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BusyIcon,
  EmptyState,
  NumberedPaginator,
  PageHeader,
  StateBadge,
} from "@/components/page";
import { productFilterArgs, type ProductSearch, validateProductSearch } from "@/lib/productFilters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  generationStateTone,
  primaryActionTone,
  productGenerationStateLabels,
  productPrimaryActionLabels,
  productPublishStateLabels,
  productReviewStateLabels,
  publishStateTone,
  reviewStateTone,
  shopifyStatusLabel,
  type GenerationStatus,
  type ProductGenerationState,
  type ProductPrimaryAction,
  type ProductPublishState,
  type ProductReviewState,
} from "@/lib/status";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/products/")({
  validateSearch: validateProductSearch,
  component: ProductsPage,
});

type Product = {
  _id: Id<"products">;
  _creationTime: number;
  shopifyProductId: string;
  title: string;
  handle: string;
  vendor?: string | null;
  productType?: string | null;
  shopifyStatus?: string | null;
  featuredImageUrl?: string | null;
  shopifyImageCount: number;
  generationStatus: GenerationStatus;
  generationState: ProductGenerationState;
  reviewState: ProductReviewState;
  publishState: ProductPublishState;
  primaryAction: ProductPrimaryAction;
  generatedImageCount: number;
  failedImageCount: number;
  publishedImageCount: number;
  publishableImageCount: number;
  pendingReviewCount: number;
  approvedImageCount: number;
  rejectedImageCount: number;
  latestJobId?: Id<"generationJobs"> | null;
  createdAt: number;
  updatedAt: number;
};
type ProductFacets = {
  productTypes: string[];
  shopifyStatuses: string[];
  collections: Array<{ id: string; title: string; handle?: string }>;
};
type ProductPageResult = {
  page: Product[];
  offset: number;
  limit: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

function ProductsPage() {
  const search = Route.useSearch();
  const [selected, setSelected] = useState<Set<Id<"products">>>(new Set());
  const [chooserOpen, setChooserOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const navigate = useNavigate();

  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const productListArgs = useMemo(
    () => productFilterArgs(search),
    [search.action, search.collection, search.generation, search.publish, search.q, search.review, search.shopifyStatus, search.status, search.type],
  );
  const productPage = useQuery(
    api.products.list,
    {
      ...productListArgs,
      offset,
      limit: pageSize,
    },
  ) as ProductPageResult | undefined;
  const products = productPage?.page ?? [];
  const facets = useQuery(api.products.facets) as ProductFacets | undefined;
  const settings = useQuery(api.settings.list);
  const syncProducts = useAction(api.shopify.syncProducts);
  const createJob = useMutation(api.jobs.create);
  const vibeDefault = String(settings?.VIBE_ANALYSIS ?? "on") !== "off";

  function updateSearch(patch: Partial<ProductSearch>) {
    void navigate({ to: "/products", search: { ...search, ...patch }, replace: true });
  }

  function updateFilters(patch: Partial<ProductSearch>) {
    updateSearch({ ...patch, page: undefined });
    setSelected(new Set());
  }

  function updatePage(nextPage: number) {
    updateSearch({ page: nextPage > 1 ? nextPage : undefined });
  }

  function updatePageSize(nextPageSize: number) {
    updateSearch({
      page: undefined,
      pageSize: nextPageSize === 20 ? undefined : nextPageSize
    });
  }

  const selectedProducts = useMemo(
    () => (products ?? []).filter((product) => selected.has(product._id)),
    [products, selected],
  );

  async function runSync() {
    setSyncing(true);
    try {
      await syncProducts({ limit: 1000 });
      toast.success("Shopify catalog synced");
    } catch (syncError) {
      toast.error("Sync failed", {
        description: syncError instanceof Error ? syncError.message : String(syncError),
      });
    } finally {
      setSyncing(false);
    }
  }

  function toggleProduct(productId: Id<"products">) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleVisible() {
    const visible = products ?? [];
    const allSelected =
      visible.length > 0 &&
      visible.every((product) => selected.has(product._id));
    setSelected((current) => {
      const next = new Set(current);
      visible.forEach((product) => {
        if (allSelected) next.delete(product._id);
        else next.add(product._id);
      });
      return next;
    });
  }

  async function generate(imageTypes: string[], useVibeAnalysis: boolean) {
    setCreatingJob(true);
    try {
      const jobId = await createJob({
        productIds: Array.from(selected),
        selectedImageTypes: imageTypes,
        forceRegenerate: true,
        useVibeAnalysis,
      });
      setChooserOpen(false);
      setSelected(new Set());
      toast.success("Background generation started", {
        description: "Product states update here in real time.",
        action: { label: "View job", onClick: () => void navigate({ to: "/jobs/$jobId", params: { jobId } }) },
      });
    } catch (jobError) {
      toast.error("Failed to start generation", {
        description: jobError instanceof Error ? jobError.message : String(jobError),
      });
    } finally {
      setCreatingJob(false);
    }
  }

  const loaded = productPage !== undefined && facets !== undefined;
  const allVisibleSelected = products?.length
    ? products.every((product) => selected.has(product._id))
    : false;
  const actionTabs: Array<{ label: string; value?: ProductPrimaryAction }> = [
    { label: "Tous" },
    { label: "A traiter", value: "generate" },
    { label: "A verifier", value: "review" },
    { label: "Pret", value: "push" },
    { label: "Publie", value: "done" },
  ];

  return (
    <main className="page">
      <PageHeader
        eyebrow={`${productPage?.hasNext ? `${pageSize}+` : products.length} produits visibles`}
        title="Produits"
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => void runSync()} disabled={syncing}>
              <BusyIcon busy={syncing} />
              {!syncing ? <RefreshCw data-icon="inline-start" /> : null}
              Synchroniser
            </Button>
            <Button size="sm" disabled={!selected.size} onClick={() => setChooserOpen(true)}>
              <WandSparkles data-icon="inline-start" />
              Generer
            </Button>
          </>
        }
      >
        Catalogue Shopify, generations image et publication en une seule table.
      </PageHeader>

      <Card className="studio-card mb-4 rounded-lg">
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-1">
              {actionTabs.map((tab) => {
                const active = search.action === tab.value || (!search.action && !tab.value);
                return (
                  <Button
                    key={tab.label}
                    variant={active ? "default" : "ghost"}
                    size="sm"
                    className={active ? "" : "text-muted-foreground"}
                    onClick={() => updateFilters({ action: tab.value })}
                  >
                    {tab.label}
                  </Button>
                );
              })}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row xl:max-w-2xl">
              <Label className="relative block min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-9"
                  value={search.q ?? ""}
                  onChange={(event) => updateFilters({ q: event.target.value || undefined })}
                  placeholder="Rechercher un produit ou handle"
                />
              </Label>
              <Button variant="outline" size="sm" className="justify-start gap-2">
                <SlidersHorizontal className="size-4" />
                Filtres
              </Button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <FilterSelect
              value={search.type ?? ""}
              placeholder="Categorie"
              onChange={(type) => updateFilters({ type: type || undefined })}
            >
              {facets?.productTypes.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={search.collection ?? ""}
              placeholder="Collection"
              onChange={(collection) => updateFilters({ collection: collection || undefined })}
            >
              {facets?.collections.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={search.shopifyStatus ?? ""}
              placeholder="Shopify"
              onChange={(shopifyStatus) => updateFilters({ shopifyStatus: shopifyStatus || undefined })}
            >
              {facets?.shopifyStatuses.map((item) => (
                <SelectItem key={item} value={item}>
                  {shopifyStatusLabel(item)}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={search.generation ?? ""}
              placeholder="Generation"
              onChange={(generation) => updateFilters({ generation: (generation || undefined) as ProductSearch["generation"] })}
            >
              {Object.entries(productGenerationStateLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={search.review ?? ""}
              placeholder="Review"
              onChange={(review) => updateFilters({ review: (review || undefined) as ProductSearch["review"] })}
            >
              {Object.entries(productReviewStateLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={search.publish ?? ""}
              placeholder="Publication"
              onChange={(publish) => updateFilters({ publish: (publish || undefined) as ProductSearch["publish"] })}
            >
              {Object.entries(productPublishStateLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </FilterSelect>
          </div>
        </CardContent>
      </Card>

      {!loaded ? (
        <EmptyState
          loading
          title="Chargement des produits"
          body="Lecture du catalogue synchronise depuis Convex."
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="Aucun produit"
          body="Synchronisez Shopify pour importer les produits actifs."
        />
      ) : (
        <Card className="studio-card overflow-hidden rounded-lg">
          <Table className="table-studio min-w-[980px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleVisible}
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
                  onToggle={() => toggleProduct(product._id)}
                  onGenerateOne={() => {
                    setSelected(new Set([product._id]));
                    setChooserOpen(true);
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <NumberedPaginator
        page={page}
        pageSize={pageSize}
        hasPrevious={productPage?.hasPrevious ?? false}
        hasNext={productPage?.hasNext ?? false}
        loading={!loaded}
        onPageChange={updatePage}
        onPageSizeChange={updatePageSize}
      />

      {selected.size ? (
        <div className="sticky-actions">
          <Card
            size="sm"
            className="studio-card flex-row items-center justify-between gap-3 rounded-lg p-3 shadow-2xl"
          >
            <div>
              <p className="text-sm font-medium">
                {selected.size} produit{selected.size === 1 ? "" : "s"} selectionne{selected.size === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">
                Choisissez les formats avant de lancer le job.
              </p>
            </div>
            <Button size="sm" onClick={() => setChooserOpen(true)}>
              <ImageIcon data-icon="inline-start" />
              Types
            </Button>
          </Card>
        </div>
      ) : null}

      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        {chooserOpen ? (
          <ImageTypeChooser
            products={selectedProducts}
            submitting={creatingJob}
            defaultUseVibe={vibeDefault}
            onGenerate={(types, useVibe) => void generate(types, useVibe)}
          />
        ) : null}
      </Dialog>
    </main>
  );
}

function FilterSelect({
  value,
  placeholder,
  onChange,
  children,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Select
      value={value || "all"}
      onValueChange={(next) => onChange(next === "all" ? "" : next)}
    >
      <SelectTrigger className="h-9 w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}

function ProductTableRow({
  product,
  search,
  selected,
  onToggle,
  onGenerateOne,
}: {
  product: Product;
  search: ProductSearch;
  selected: boolean;
  onToggle: () => void;
  onGenerateOne: () => void;
}) {
  const image = product.featuredImageUrl;
  return (
    <TableRow data-state={selected ? "selected" : undefined} className="group">
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Selectionner ${product.title}`}
        />
      </TableCell>
      <TableCell className="min-w-[20rem]">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/products/$productId"
            params={{ productId: product._id }}
            search={search}
            className="image-tile size-12 shrink-0"
          >
            {image ? (
              <img src={image} alt={product.title} />
            ) : (
              <div className="grid size-full place-items-center text-[10px] text-muted-foreground">
                Sans image
              </div>
            )}
          </Link>
          <div className="min-w-0">
            <Link
              to="/products/$productId"
              params={{ productId: product._id }}
              search={search}
              className="block min-w-0 hover:text-primary"
            >
              <span className="block truncate font-medium">{product.title}</span>
            </Link>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate font-mono">{product.handle}</span>
              <span className="text-white/20">/</span>
              <span className="truncate">{product.productType || "Sans categorie"}</span>
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <StateBadge state={primaryActionTone(product.primaryAction)}>
          {productPrimaryActionLabels[product.primaryAction]}
        </StateBadge>
      </TableCell>
      <TableCell>
        <StateBadge state={generationStateTone(product.generationState)}>
          {productGenerationStateLabels[product.generationState]}
        </StateBadge>
      </TableCell>
      <TableCell>
        <StateBadge state={reviewStateTone(product.reviewState)}>
          {productReviewStateLabels[product.reviewState]}
        </StateBadge>
      </TableCell>
      <TableCell>
        <StateBadge state={publishStateTone(product.publishState)}>
          {productPublishStateLabels[product.publishState]}
        </StateBadge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="border-white/10 bg-white/[0.04]">
            {product.generatedImageCount ?? 0} gen.
          </Badge>
          {product.failedImageCount ? (
            <Badge variant="outline" className="border-red-400/25 bg-red-400/10 text-red-200">
              {product.failedImageCount} err.
            </Badge>
          ) : null}
          {product.pendingReviewCount ? (
            <Badge variant="outline" className="border-amber-400/25 bg-amber-400/10 text-amber-200">
              {product.pendingReviewCount} review
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          {product.shopifyStatus ? (
            <Badge variant="outline" className="border-white/10 bg-white/[0.04]">
              {shopifyStatusLabel(product.shopifyStatus)}
            </Badge>
          ) : null}
          <p className="text-xs text-muted-foreground">{product.shopifyImageCount} images</p>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" onClick={onGenerateOne}>
          <WandSparkles data-icon="inline-start" />
          Generer
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ImageTypeChooser({
  products,
  submitting,
  defaultUseVibe,
  onGenerate,
}: {
  products: Product[];
  submitting: boolean;
  defaultUseVibe: boolean;
  onGenerate: (imageTypes: string[], useVibeAnalysis: boolean) => void;
}) {
  const prompts = useQuery(api.prompts.list) as
    | Doc<"promptTemplates">[]
    | undefined;
  const types = useMemo(
    () => (prompts ?? []).filter((prompt) => prompt.isActive),
    [prompts],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);
  const [useVibe, setUseVibe] = useState(defaultUseVibe);

  // Default to the preset image types until the user changes the selection.
  // If no template is marked as preset, fall back to selecting all of them.
  useEffect(() => {
    if (touched) return;
    const presets = types.filter((type) => type.isPreset);
    const defaults = presets.length ? presets : types;
    setSelected(new Set(defaults.map((type) => type.imageType)));
  }, [types, touched]);

  function toggle(type: string) {
    setTouched(true);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <DialogContent className="border-white/10 bg-card sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Types d'images</DialogTitle>
        <DialogDescription>
          {products.length} produit{products.length === 1 ? "" : "s"} selectionne{products.length === 1 ? "" : "s"}.
          Chaque type utilise son prompt actif.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3">
          <Checkbox
            checked={useVibe}
            onCheckedChange={(checked) => setUseVibe(checked === true)}
          />
          Analyse visuelle
        </Label>
      </div>
      <div className="grid gap-2">
        {types.map((type) => (
          <Label
            key={type.imageType}
            className="flex min-h-11 justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3"
          >
            <span>{type.label}</span>
            <Checkbox
              checked={selected.has(type.imageType)}
              onCheckedChange={() => toggle(type.imageType)}
            />
          </Label>
        ))}
      </div>
      <DialogFooter>
        <Button
          disabled={!selected.size || submitting}
          onClick={() => onGenerate(Array.from(selected), useVibe)}
        >
          <BusyIcon busy={submitting} />
          {!submitting ? <WandSparkles data-icon="inline-start" /> : null}
          Lancer le job
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
