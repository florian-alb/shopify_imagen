import { Link, createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { ImageIcon, RefreshCw, Search, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BusyIcon,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  getBudgetImageTypes,
  getBulkAvailableImageTypes,
} from "@/lib/fixationDetector";
import {
  ALL_IMAGE_TYPES,
  IMAGE_TYPE_LABELS,
  type ImageType,
} from "@/lib/imageTypes";
import { generationStatusLabels, type GenerationStatus } from "@/lib/status";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/products/")({
  component: ProductsPage,
});

type Product = Doc<"products">;
type ProductFacets = {
  productTypes: string[];
  collections: Array<{ id: string; title: string; handle?: string }>;
};

function ProductsPage() {
  const [search, setSearch] = useState("");
  const [productType, setProductType] = useState("");
  const [collection, setCollection] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Set<Id<"products">>>(new Set());
  const [chooserOpen, setChooserOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdJobId, setCreatedJobId] = useState<Id<"generationJobs"> | null>(null);

  const products = useQuery(api.products.list, {
    search,
    productType: productType || undefined,
    collection: collection || undefined,
    generationStatus: status || undefined,
  }) as Product[] | undefined;
  const facets = useQuery(api.products.facets) as ProductFacets | undefined;
  const settings = useQuery(api.settings.list);
  const syncProducts = useAction(api.shopify.syncProducts);
  const createJob = useMutation(api.jobs.create);
  const vibeDefault = String(settings?.VIBE_ANALYSIS ?? "on") !== "off";

  const selectedProducts = useMemo(
    () => (products ?? []).filter((product) => selected.has(product._id)),
    [products, selected],
  );

  async function runSync() {
    setSyncing(true);
    setError(null);
    try {
      await syncProducts({ limit: 1000 });
    } catch (syncError) {
      setError(
        syncError instanceof Error ? syncError.message : String(syncError),
      );
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

  async function generate(imageTypes: ImageType[], forceRegenerate: boolean, useVibeAnalysis: boolean) {
    setCreatingJob(true);
    setError(null);
    setCreatedJobId(null);
    try {
      const jobId = await createJob({
        productIds: Array.from(selected),
        selectedImageTypes: imageTypes,
        forceRegenerate,
        useVibeAnalysis,
      });
      setChooserOpen(false);
      setSelected(new Set());
      setCreatedJobId(jobId);
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : String(jobError));
    } finally {
      setCreatingJob(false);
    }
  }

  const loaded = products !== undefined && facets !== undefined;
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
        <CardContent className="grid gap-3 px-3 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <Label className="relative block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or handle"
            />
          </Label>
          <FilterSelect
            value={productType}
            placeholder="All categories"
            onChange={setProductType}
          >
            {facets?.productTypes.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={collection}
            placeholder="All collections"
            onChange={setCollection}
          >
            {facets?.collections.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={status}
            placeholder="All states"
            onChange={setStatus}
          >
            {Object.entries(generationStatusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </FilterSelect>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {createdJobId ? (
        <Alert className="mb-4">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Background generation started. Product states update here in real time.</span>
            <Button variant="outline" size="sm" asChild>
              <Link to="/jobs/$jobId" params={{ jobId: createdJobId }}>View job</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="mb-3 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={toggleVisible}
          disabled={!products?.length}
        >
          <Checkbox checked={allVisibleSelected} aria-hidden tabIndex={-1} />
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
          body="Sync Shopify to import active products and detected fixation options."
        />
      ) : (
        <section className="grid gap-3">
          {products.map((product) => (
            <ProductRow
              key={product._id}
              product={product}
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
            onGenerate={(types, force, useVibe) => void generate(types, force, useVibe)}
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
  selected,
  onToggle,
  onGenerateOne,
}: {
  product: Product;
  selected: boolean;
  onToggle: () => void;
  onGenerateOne: () => void;
}) {
  const image =
    product.featuredImageUrl ?? product.currentShopifyImages[0]?.url;
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
          {product.detectedFixations.slice(0, 2).map((fixation) => (
            <Badge key={fixation} variant="outline">
              {fixation}
            </Badge>
          ))}
          <Badge variant="outline">
            {product.currentShopifyImages.length} Shopify
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
  onGenerate: (imageTypes: ImageType[], forceRegenerate: boolean, useVibeAnalysis: boolean) => void;
}) {
  const available = useMemo(
    () => getBulkAvailableImageTypes(products),
    [products],
  );
  const [selected, setSelected] = useState<Set<ImageType>>(
    () =>
      new Set(
        getBudgetImageTypes(
          products.flatMap((product) => product.detectedFixations),
        ),
      ),
  );
  const [force, setForce] = useState(false);
  const [useVibe, setUseVibe] = useState(defaultUseVibe);

  function toggle(type: ImageType) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function budgetPreset() {
    setSelected(
      new Set(
        getBudgetImageTypes(
          products.flatMap((product) => product.detectedFixations),
        ),
      ),
    );
  }

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Choose image types</DialogTitle>
        <DialogDescription>
          {products.length} product{products.length === 1 ? "" : "s"} selected.
          Fixation types only run where detected.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={budgetPreset}>
          Budget preset
        </Button>
        <Label className="flex h-8 items-center gap-2 rounded-lg border px-3">
          <Checkbox
            checked={force}
            onCheckedChange={(checked) => setForce(checked === true)}
          />
          Regenerate existing
        </Label>
        <Label className="flex h-8 items-center gap-2 rounded-lg border px-3">
          <Checkbox
            checked={useVibe}
            onCheckedChange={(checked) => setUseVibe(checked === true)}
          />
          Scene vibe analysis
        </Label>
      </div>
      <div className="grid gap-2">
        {ALL_IMAGE_TYPES.filter((type) => available.includes(type)).map(
          (type) => (
            <Label
              key={type}
              className="flex min-h-11 justify-between rounded-lg border px-3"
            >
              <span>{IMAGE_TYPE_LABELS[type]}</span>
              <Checkbox
                checked={selected.has(type)}
                onCheckedChange={() => toggle(type)}
              />
            </Label>
          ),
        )}
      </div>
      <DialogFooter>
        <Button
          disabled={!selected.size || submitting}
          onClick={() => onGenerate(Array.from(selected), force, useVibe)}
        >
          <BusyIcon busy={submitting} />
          {!submitting ? <WandSparkles data-icon="inline-start" /> : null}
          Start background job
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
