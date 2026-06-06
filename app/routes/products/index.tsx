import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Check, ImageIcon, RefreshCw, Search, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BusyIcon,
  EmptyState,
  NumberedPaginator,
  PageHeader,
  StatusBadge,
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
import { generationStatusLabels, shopifyStatusLabel, type GenerationStatus } from "@/lib/status";
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
  generatedImageCount: number;
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
  const [pageSize, setPageSize] = useState(20);
  const navigate = useNavigate();

  const offset = search.offset ?? 0;
  const productListArgs = useMemo(() => productFilterArgs(search), [search.collection, search.q, search.shopifyStatus, search.status, search.type]);
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
    updateSearch({ ...patch, offset: undefined });
    setSelected(new Set());
  }

  function updateOffset(nextOffset: number) {
    updateSearch({ offset: nextOffset > 0 ? nextOffset : undefined });
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
        forceRegenerate: false,
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

  return (
    <main className="page">
      <PageHeader
        eyebrow="Products"
        title="Shopify image generation"
        action={
          <Button
            variant="outline"
            size="lg"
            onClick={() => void runSync()}
            disabled={syncing}
          >
            <BusyIcon busy={syncing} />
            {!syncing ? <RefreshCw data-icon="inline-start" /> : null}
            Sync Shopify
          </Button>
        }
      />

      <Card className="mb-4 rounded-lg py-3">
        <CardContent className="grid gap-3 px-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <Label className="relative block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              value={search.q ?? ""}
              onChange={(event) => updateFilters({ q: event.target.value || undefined })}
              placeholder="Search name or handle"
            />
          </Label>
          <FilterSelect
            value={search.type ?? ""}
            placeholder="All categories"
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
            placeholder="All collections"
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
            placeholder="All Shopify states"
            onChange={(shopifyStatus) => updateFilters({ shopifyStatus: shopifyStatus || undefined })}
          >
            {facets?.shopifyStatuses.map((item) => (
              <SelectItem key={item} value={item}>
                {shopifyStatusLabel(item)}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={search.status ?? ""}
            placeholder="All generation states"
            onChange={(status) => updateFilters({ status: (status || undefined) as ProductSearch["status"] })}
          >
            {Object.entries(generationStatusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </FilterSelect>
        </CardContent>
      </Card>

      <section className="mb-3 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={toggleVisible}
          disabled={!products?.length}
        >
          <span className="grid size-4 place-items-center rounded border border-input bg-background" aria-hidden>
            {allVisibleSelected ? <Check className="size-3" /> : null}
          </span>
          {selected.size} selected
        </Button>
        <Button
          size="lg"
          disabled={!selected.size}
          onClick={() => setChooserOpen(true)}
        >
          <WandSparkles data-icon="inline-start" />
          Generate
        </Button>
      </section>

      {!loaded ? (
        <EmptyState
          loading
          title="Loading products"
          body="Fetching synced Shopify catalog data from Convex."
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products yet"
          body="Sync Shopify to import active products."
        />
      ) : (
        <section className="grid gap-3">
          {products.map((product) => (
            <ProductRow
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
        </section>
      )}

      <NumberedPaginator
        offset={offset}
        pageSize={pageSize}
        hasPrevious={productPage?.hasPrevious ?? false}
        hasNext={productPage?.hasNext ?? false}
        loading={!loaded}
        onOffsetChange={updateOffset}
        onPageSizeChange={setPageSize}
      />

      {selected.size ? (
        <div className="sticky-actions">
          <Card
            size="sm"
            className="flex-row items-center justify-between gap-3 rounded-lg p-3 shadow-md"
          >
            <div>
              <p className="text-sm font-medium">
                {selected.size} product{selected.size === 1 ? "" : "s"} selected
              </p>
              <p className="text-xs text-muted-foreground">
                Choose image types before the job starts.
              </p>
            </div>
            <Button onClick={() => setChooserOpen(true)}>
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
      <SelectTrigger className="h-10 w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}

function ProductRow({
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
    <Card
      size="sm"
      className="grid grid-cols-[auto_72px_1fr] gap-3 rounded-lg p-3 md:grid-cols-[auto_84px_1fr_auto] md:items-center"
    >
      <Checkbox
        className="mt-7 md:mt-0"
        checked={selected}
        onCheckedChange={onToggle}
        aria-label={`Select ${product.title}`}
      />
      <Link
        to="/products/$productId"
        params={{ productId: product._id }}
        search={search}
        className="image-tile"
      >
        {image ? (
          <img src={image} alt={product.title} />
        ) : (
          <div className="grid size-full place-items-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </Link>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/products/$productId"
            params={{ productId: product._id }}
            search={search}
            className="min-w-0"
          >
            <h2 className="truncate text-base font-medium">{product.title}</h2>
          </Link>
          <StatusBadge
            status={product.generationStatus as GenerationStatus}
            label={
              generationStatusLabels[
                product.generationStatus as GenerationStatus
              ]
            }
          />
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {product.handle}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline">
            {product.productType || "No category"}
          </Badge>
          {product.shopifyStatus ? <Badge variant="outline">{shopifyStatusLabel(product.shopifyStatus)}</Badge> : null}
          <Badge variant="outline">
            {product.shopifyImageCount} Shopify
          </Badge>
          <Badge variant="outline">
            {product.generatedImageCount ?? 0} Generated
          </Badge>
        </div>
      </div>
      <Button
        className="col-span-3 md:col-span-1"
        variant="outline"
        onClick={onGenerateOne}
      >
        <WandSparkles data-icon="inline-start" />
        Generate
      </Button>
    </Card>
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
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Choose image types</DialogTitle>
        <DialogDescription>
          {products.length} product{products.length === 1 ? "" : "s"} selected.
          Each image type maps to a prompt template.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="flex h-8 items-center gap-2 rounded-lg border px-3">
          <Checkbox
            checked={useVibe}
            onCheckedChange={(checked) => setUseVibe(checked === true)}
          />
          Scene vibe analysis
        </Label>
      </div>
      <div className="grid gap-2">
        {types.map((type) => (
          <Label
            key={type.imageType}
            className="flex min-h-11 justify-between rounded-lg border px-3"
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
          Start background job
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
