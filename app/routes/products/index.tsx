import { Link, createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { CheckSquare, ImageIcon, RefreshCw, Search, Square, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, EmptyState, PageHeader } from "../../components/ui";
import { getBudgetImageTypes, getBulkAvailableImageTypes } from "../../lib/fixationDetector";
import { ALL_IMAGE_TYPES, IMAGE_TYPE_LABELS, type ImageType } from "../../lib/imageTypes";
import { generationStatusLabels, statusTone, type GenerationStatus } from "../../lib/status";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/products/")({
  component: ProductsPage
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

  const products = useQuery(api.products.list, {
    search,
    productType: productType || undefined,
    collection: collection || undefined,
    generationStatus: status || undefined
  }) as Product[] | undefined;
  const facets = useQuery(api.products.facets) as ProductFacets | undefined;
  const syncProducts = useAction(api.shopify.syncProducts);
  const createJob = useMutation(api.jobs.create);

  const selectedProducts = useMemo(() => {
    return (products ?? []).filter((product) => selected.has(product._id));
  }, [products, selected]);

  async function runSync() {
    setSyncing(true);
    setError(null);
    try {
      await syncProducts({ limit: 100 });
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
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
    const allSelected = visible.length > 0 && visible.every((product) => selected.has(product._id));
    setSelected((current) => {
      const next = new Set(current);
      visible.forEach((product) => {
        if (allSelected) next.delete(product._id);
        else next.add(product._id);
      });
      return next;
    });
  }

  async function generate(imageTypes: ImageType[], forceRegenerate: boolean) {
    setCreatingJob(true);
    setError(null);
    try {
      const jobId = await createJob({
        productIds: Array.from(selected),
        selectedImageTypes: imageTypes,
        forceRegenerate
      });
      setChooserOpen(false);
      setSelected(new Set());
      window.location.href = `/jobs/${jobId}`;
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : String(jobError));
    } finally {
      setCreatingJob(false);
    }
  }

  const loaded = products !== undefined && facets !== undefined;
  const allVisibleSelected = products?.length ? products.every((product) => selected.has(product._id)) : false;

  return (
    <main className="page">
      <PageHeader
        eyebrow="Products"
        title="Shopify image generation"
        action={
          <Button variant="secondary" onClick={() => void runSync()} loading={syncing}>
            <RefreshCw size={16} />
            Sync Shopify
          </Button>
        }
      />

      <section className="panel mb-4 grid gap-3 p-3 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
          <input
            className="input pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or handle"
          />
        </label>
        <select className="select" value={productType} onChange={(event) => setProductType(event.target.value)}>
          <option value="">All categories</option>
          {facets?.productTypes.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="select" value={collection} onChange={(event) => setCollection(event.target.value)}>
          <option value="">All collections</option>
          {facets?.collections.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All states</option>
          {Object.entries(generationStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </section>

      {error ? <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{error}</div> : null}

      <section className="mb-3 flex items-center justify-between gap-3">
        <button className="btn btn-secondary" onClick={toggleVisible} disabled={!products?.length}>
          {allVisibleSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          {selected.size} selected
        </button>
        <Button disabled={!selected.size} onClick={() => setChooserOpen(true)}>
          <WandSparkles size={16} />
          Generate
        </Button>
      </section>

      {!loaded ? (
        <EmptyState title="Loading products" body="Fetching synced Shopify catalog data from Convex." />
      ) : products.length === 0 ? (
        <EmptyState title="No products yet" body="Sync Shopify to import active products and detected fixation options." />
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
        <section className="sticky-actions flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{selected.size} product{selected.size === 1 ? "" : "s"} selected</div>
            <div className="text-xs text-[var(--muted)]">Choose image types before the job starts.</div>
          </div>
          <Button onClick={() => setChooserOpen(true)}>
            <ImageIcon size={16} />
            Types
          </Button>
        </section>
      ) : null}

      {chooserOpen ? (
        <ImageTypeChooser
          products={selectedProducts}
          submitting={creatingJob}
          onClose={() => setChooserOpen(false)}
          onGenerate={(types, force) => void generate(types, force)}
        />
      ) : null}
    </main>
  );
}

function ProductRow({
  product,
  selected,
  onToggle,
  onGenerateOne
}: {
  product: Product;
  selected: boolean;
  onToggle: () => void;
  onGenerateOne: () => void;
}) {
  const image = product.featuredImageUrl ?? product.currentShopifyImages[0]?.url;
  return (
    <article className="panel grid grid-cols-[auto_72px_1fr] gap-3 p-3 md:grid-cols-[auto_84px_1fr_auto] md:items-center">
      <input
        type="checkbox"
        className="mt-7 size-5 accent-[var(--ink)] md:mt-0"
        checked={selected}
        onChange={onToggle}
        aria-label={`Select ${product.title}`}
      />
      <Link to="/products/$productId" params={{ productId: product._id }} className="image-tile">
        {image ? <img src={image} alt={product.title} /> : <div className="grid size-full place-items-center text-[var(--muted)]">No image</div>}
      </Link>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/products/$productId" params={{ productId: product._id }} className="min-w-0">
            <h2 className="truncate text-base font-semibold">{product.title}</h2>
          </Link>
          <Badge tone={statusTone(product.generationStatus as GenerationStatus)}>
            {generationStatusLabels[product.generationStatus as GenerationStatus]}
          </Badge>
        </div>
        <p className="truncate text-sm text-[var(--muted)]">{product.handle}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>{product.productType || "No category"}</Badge>
          {product.detectedFixations.slice(0, 2).map((fixation) => (
            <Badge key={fixation}>{fixation}</Badge>
          ))}
          <Badge>{product.currentShopifyImages.length} Shopify</Badge>
        </div>
      </div>
      <Button className="col-span-3 md:col-span-1" variant="secondary" onClick={onGenerateOne}>
        <WandSparkles size={16} />
        Generate
      </Button>
    </article>
  );
}

function ImageTypeChooser({
  products,
  submitting,
  onClose,
  onGenerate
}: {
  products: Product[];
  submitting: boolean;
  onClose: () => void;
  onGenerate: (imageTypes: ImageType[], forceRegenerate: boolean) => void;
}) {
  const available = useMemo(() => getBulkAvailableImageTypes(products), [products]);
  const [selected, setSelected] = useState<Set<ImageType>>(() => new Set(getBudgetImageTypes(products.flatMap((product) => product.detectedFixations))));
  const [force, setForce] = useState(false);

  function toggle(type: ImageType) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function budgetPreset() {
    setSelected(new Set(getBudgetImageTypes(products.flatMap((product) => product.detectedFixations))));
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-black/30 p-0 md:place-items-center md:p-6">
      <section className="max-h-[92vh] w-full overflow-auto rounded-t-lg bg-white p-4 shadow-2xl md:max-w-xl md:rounded-lg">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Choose image types</h2>
            <p className="text-sm text-[var(--muted)]">
              {products.length} product{products.length === 1 ? "" : "s"} selected. Fixation types only run where detected.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button className="btn btn-secondary" onClick={budgetPreset}>
            Budget preset
          </button>
          <label className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm">
            <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
            Regenerate existing
          </label>
        </div>
        <div className="grid gap-2">
          {ALL_IMAGE_TYPES.filter((type) => available.includes(type)).map((type) => (
            <label key={type} className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3">
              <span className="text-sm font-medium">{IMAGE_TYPE_LABELS[type]}</span>
              <input
                className="size-5 accent-[var(--ink)]"
                type="checkbox"
                checked={selected.has(type)}
                onChange={() => toggle(type)}
              />
            </label>
          ))}
        </div>
        <Button className="mt-4 w-full" loading={submitting} disabled={!selected.size} onClick={() => onGenerate(Array.from(selected), force)}>
          <WandSparkles size={16} />
          Start background job
        </Button>
      </section>
    </div>
  );
}
