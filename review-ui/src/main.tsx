import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Image,
  Loader2,
  Play,
  RefreshCw,
  Search,
  UploadCloud
} from "lucide-react";
import "./styles.css";

type ReviewImage = { url: string; altText?: string | null; mediaId?: string | number | null };
type GeneratedImage = { imageType: string; label: string; url: string; localPath: string };
type Collection = { id: string; title: string; handle: string };

type ReviewProduct = {
  id: string;
  title: string;
  handle: string;
  productType: string | null;
  vendor: string | null;
  collections: Collection[];
  stateStatus: string | null;
  currentImages: ReviewImage[];
  generatedImages: GeneratedImage[];
  requestedImageTypes: string[];
  availableFixations: string[];
  error: string | null;
  updatedAt: string | null;
};

type ProductsPayload = {
  products: ReviewProduct[];
  filters: { categories: string[]; collections: Collection[] };
  totals: { products: number; currentImages: number; generatedImages: number };
};

type GenerationJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  productIds: string[];
  concurrency: number;
  budget: boolean;
  force: boolean;
  completed: number;
  total: number;
  currentProduct: string | null;
  messages: string[];
  error: string | null;
};

type ReplaceState = Record<string, { loading: boolean; message: string | null; error: string | null }>;
type GenerationFilter = "all" | "not-started" | "generating" | "ready" | "partial" | "pushed" | "failed";

const statusLabels: Record<string, string> = {
  pending: "Pending",
  generating: "Generating",
  generated: "Ready",
  attached: "Pushed",
  uploaded: "Uploaded",
  failed: "Failed",
  exported: "Exported"
};

const generationFilterLabels: Record<GenerationFilter, string> = {
  all: "All generation states",
  "not-started": "Not started",
  generating: "Generating",
  ready: "Ready",
  partial: "Partial",
  pushed: "Pushed",
  failed: "Failed"
};

function expectedImageCount(product: ReviewProduct): number {
  return product.requestedImageTypes.length || 4;
}

function generationState(product: ReviewProduct): Exclude<GenerationFilter, "all"> {
  if (product.stateStatus === "failed" || product.error) return "failed";
  if (product.stateStatus === "generating") return "generating";
  if (product.stateStatus === "attached" || product.stateStatus === "uploaded") return "pushed";
  if (!product.generatedImages.length) return "not-started";
  if (product.generatedImages.length < expectedImageCount(product)) return "partial";
  return "ready";
}

function generationStateLabel(product: ReviewProduct): string {
  return generationFilterLabels[generationState(product)];
}

function generationStateTone(product: ReviewProduct): "default" | "good" | "warn" | "bad" {
  const state = generationState(product);
  if (state === "failed") return "bad";
  if (state === "ready" || state === "pushed") return "good";
  if (state === "partial" || state === "generating") return "warn";
  return "default";
}

function productPath(productId: string): string {
  return `/products/${encodeURIComponent(productId)}`;
}

function productIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/products\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T | { error?: string };
  const errorMessage =
    typeof payload === "object" && payload && "error" in payload && payload.error ? payload.error : "Request failed";
  if (!response.ok) throw new Error(errorMessage);
  return payload as T;
}

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  return <span className={cn("badge", `badge-${tone}`)}>{children}</span>;
}

function ProductThumb({ product }: { product: ReviewProduct }) {
  const image = product.generatedImages[0]?.url ?? product.currentImages[0]?.url;
  if (!image) {
    return (
      <div className="thumb empty-thumb">
        <Image size={18} />
      </div>
    );
  }
  return <img className="thumb" src={image} alt={product.title} />;
}

function ProductGallery({ product }: { product: ReviewProduct }) {
  const images = product.generatedImages.length ? product.generatedImages : product.currentImages.slice(0, 4);
  return (
    <div className="mini-gallery">
      {images.slice(0, 4).map((image, index) => (
        <img key={`${image.url}-${index}`} src={image.url} alt={product.title} />
      ))}
    </div>
  );
}

function JobPanel({ job }: { job: GenerationJob | null }) {
  if (!job) return null;
  const pct = job.total ? Math.round((job.completed / job.total) * 100) : 0;
  const running = job.status === "queued" || job.status === "running";

  return (
    <section className="job-panel">
      <div className="job-header">
        <div>
          <h3>Generation job</h3>
          <p>{running ? job.currentProduct ?? "Preparing" : job.status}</p>
        </div>
        <Badge tone={job.status === "failed" ? "bad" : job.status === "completed" ? "good" : "warn"}>
          {job.completed}/{job.total}
        </Badge>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {job.error ? (
        <div className="notice notice-bad">
          <AlertCircle size={16} />
          <span>{job.error}</span>
        </div>
      ) : null}
      <div className="job-log">
        {job.messages.slice(-6).map((message, index) => (
          <p key={`${message}-${index}`}>{message}</p>
        ))}
      </div>
    </section>
  );
}

function DetailGallery({
  title,
  images,
  generated
}: {
  title: string;
  images: Array<ReviewImage | GeneratedImage>;
  generated?: boolean;
}) {
  return (
    <section className="detail-card">
      <div className="detail-card-header">
        <h3>{title}</h3>
        <Badge tone={images.length ? "default" : "warn"}>{images.length}</Badge>
      </div>
      {images.length ? (
        <div className="detail-gallery">
          {images.map((image, index) => {
            const label = generated && "label" in image ? image.label : `Shopify image ${index + 1}`;
            return (
              <figure className="detail-image" key={`${image.url}-${index}`}>
                <img src={image.url} alt={label} />
                <figcaption>
                  <strong>{label}</strong>
                  {"localPath" in image ? <span>{image.localPath}</span> : null}
                  {"mediaId" in image && image.mediaId ? <span>{String(image.mediaId)}</span> : null}
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : (
        <div className="detail-empty">
          <Image size={20} />
          <span>No images found</span>
        </div>
      )}
    </section>
  );
}

function ProductDetail({
  product,
  force,
  jobRunning,
  replaceState,
  onBack,
  onGenerate,
  onReplace
}: {
  product: ReviewProduct;
  force: boolean;
  jobRunning: boolean;
  replaceState?: ReplaceState[string];
  onBack: () => void;
  onGenerate: (productIds: string[]) => void;
  onReplace: (product: ReviewProduct) => void;
}) {
  const ready = product.generatedImages.length > 0;
  const replacing = Boolean(replaceState?.loading);
  const status = generationStateLabel(product);

  return (
    <main>
      <section className="detail-topbar">
        <button className="secondary-button" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <div className="detail-actions">
          <button className="secondary-button" disabled={jobRunning} onClick={() => onGenerate([product.id])}>
            {jobRunning ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            <span>{force ? "Regenerate" : "Generate"}</span>
          </button>
          <button className="replace-button" disabled={!ready || replacing} onClick={() => onReplace(product)}>
            {replacing ? <Loader2 className="spin" size={16} /> : <UploadCloud size={16} />}
            <span>Push images</span>
          </button>
        </div>
      </section>

      <section className="detail-hero">
        <ProductThumb product={product} />
        <div>
          <div className="row-title">
            <h1>{product.title}</h1>
            <Badge tone={generationStateTone(product)}>{status}</Badge>
          </div>
          <p>{product.handle}</p>
          <div className="product-meta">
            <Badge>{product.productType || "No category"}</Badge>
            {product.vendor ? <Badge>{product.vendor}</Badge> : null}
            {product.collections.map((item) => <Badge key={item.id}>{item.title}</Badge>)}
            <Badge>{product.generatedImages.length} generated</Badge>
            <Badge>{product.currentImages.length} before</Badge>
          </div>
        </div>
      </section>

      <section className="detail-grid">
        <section className="detail-card">
          <div className="detail-card-header">
            <h3>What was done</h3>
          </div>
          <dl className="detail-facts">
            <div><dt>Status</dt><dd>{status}</dd></div>
            <div><dt>Requested images</dt><dd>{product.requestedImageTypes.join(", ") || "None"}</dd></div>
            <div><dt>Detected fixations</dt><dd>{product.availableFixations.join(", ") || "None"}</dd></div>
            <div><dt>Updated</dt><dd>{product.updatedAt ? new Date(product.updatedAt).toLocaleString() : "Never"}</dd></div>
          </dl>
          {product.error ? <div className="notice notice-bad"><AlertCircle size={16} /><span>{product.error}</span></div> : null}
          {replaceState?.message ? <div className="inline-success"><Check size={14} />{replaceState.message}</div> : null}
          {replaceState?.error ? <div className="inline-error"><AlertCircle size={14} />{replaceState.error}</div> : null}
        </section>
        <DetailGallery title="Generated images" images={product.generatedImages} generated />
        <DetailGallery title="Before Shopify images" images={product.currentImages} />
      </section>
    </main>
  );
}

function App() {
  const [payload, setPayload] = useState<ProductsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [collection, setCollection] = useState("all");
  const [generationFilter, setGenerationFilter] = useState<GenerationFilter>("all");
  const [force, setForce] = useState(false);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [replaceState, setReplaceState] = useState<ReplaceState>({});
  const [activeProductId, setActiveProductId] = useState<string | null>(() => productIdFromPath(window.location.pathname));

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setPayload(await requestJson<ProductsPayload>("/api/products"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const onPopState = () => setActiveProductId(productIdFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    const timer = window.setInterval(async () => {
      try {
        const payload = await requestJson<{ job: GenerationJob }>(`/api/jobs/${encodeURIComponent(job.id)}`);
        setJob(payload.job);
        if (payload.job.status === "completed") await load();
      } catch (jobError) {
        setError(jobError instanceof Error ? jobError.message : String(jobError));
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job]);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (payload?.products ?? []).filter((product) => {
      const matchesQuery =
        !needle ||
        product.title.toLowerCase().includes(needle) ||
        product.handle.toLowerCase().includes(needle);
      const matchesCategory = category === "all" || product.productType === category;
      const matchesCollection = collection === "all" || product.collections.some((item) => item.id === collection);
      const matchesGeneration = generationFilter === "all" || generationState(product) === generationFilter;
      return matchesQuery && matchesCategory && matchesCollection && matchesGeneration;
    });
  }, [payload, query, category, collection, generationFilter]);

  const selectedVisibleCount = filteredProducts.filter((product) => selected.has(product.id)).length;
  const readyCount = payload?.products.filter((product) => product.generatedImages.length > 0).length ?? 0;
  const jobRunning = job?.status === "queued" || job?.status === "running";

  function toggleProduct(productId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((current) => {
      const next = new Set(current);
      const allVisibleSelected = filteredProducts.every((product) => next.has(product.id));
      filteredProducts.forEach((product) => {
        if (allVisibleSelected) next.delete(product.id);
        else next.add(product.id);
      });
      return next;
    });
  }

  async function generateProducts(productIds: string[]) {
    setError(null);
    if (!productIds.length) return;
    try {
      const result = await requestJson<{ job: GenerationJob }>("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds, budget: true, concurrency: 1, force })
      });
      setJob(result.job);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : String(generateError));
    }
  }

  async function generateSelected() {
    await generateProducts(Array.from(selected));
  }

  async function replaceImages(product: ReviewProduct) {
    setReplaceState((current) => ({ ...current, [product.id]: { loading: true, message: null, error: null } }));
    try {
      const result = await requestJson<{ message?: string }>(`/api/products/${encodeURIComponent(product.id)}/replace-images`, {
        method: "POST"
      });
      setReplaceState((current) => ({
        ...current,
        [product.id]: { loading: false, message: result.message ?? "Images replaced", error: null }
      }));
      await load();
    } catch (replaceError) {
      setReplaceState((current) => ({
        ...current,
        [product.id]: {
          loading: false,
          message: null,
          error: replaceError instanceof Error ? replaceError.message : String(replaceError)
        }
      }));
    }
  }

  function navigateToList() {
    window.history.pushState(null, "", "/");
    setActiveProductId(null);
  }

  function navigateToProduct(productId: string) {
    window.history.pushState(null, "", productPath(productId));
    setActiveProductId(productId);
  }

  const activeProduct = payload?.products.find((product) => product.id === activeProductId) ?? null;

  if (activeProductId && !activeProduct && !loading) {
    return (
      <main>
        <section className="detail-topbar">
          <button className="secondary-button" onClick={navigateToList}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        </section>
        <div className="notice notice-bad page-notice">
          <AlertCircle size={16} />
          <span>Product not found in the current review list. Increase the review limit or clear the route.</span>
        </div>
      </main>
    );
  }

  if (activeProduct) {
    return (
      <>
        <ProductDetail
          product={activeProduct}
          force={force}
          jobRunning={jobRunning}
          replaceState={replaceState[activeProduct.id]}
          onBack={navigateToList}
          onGenerate={(productIds) => void generateProducts(productIds)}
          onReplace={(product) => void replaceImages(product)}
        />
        <section className="detail-job-wrap">
          <JobPanel job={job} />
        </section>
      </>
    );
  }

  return (
    <main>
      <section className="topbar">
        <div>
          <div className="eyebrow">Shopify Image Studio</div>
          <h1>Generate and publish curtain product images</h1>
        </div>
        <button className="secondary-button" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          <span>Refresh</span>
        </button>
      </section>

      <section className="stats-row">
        <div className="stat-card"><span>Products</span><strong>{payload?.totals.products ?? 0}</strong></div>
        <div className="stat-card"><span>Ready to push</span><strong>{readyCount}</strong></div>
        <div className="stat-card"><span>Selected</span><strong>{selected.size}</strong></div>
        <div className="stat-card"><span>Generated images</span><strong>{payload?.totals.generatedImages ?? 0}</strong></div>
      </section>

      <section className="filters-bar">
        <label className="search-field">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" />
        </label>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">All categories</option>
          {payload?.filters.categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={collection} onChange={(event) => setCollection(event.target.value)}>
          <option value="all">All collections</option>
          {payload?.filters.collections.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <select value={generationFilter} onChange={(event) => setGenerationFilter(event.target.value as GenerationFilter)}>
          {(Object.keys(generationFilterLabels) as GenerationFilter[]).map((item) => (
            <option key={item} value={item}>{generationFilterLabels[item]}</option>
          ))}
        </select>
        <label className="toggle-row">
          <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
          <span>Regenerate existing</span>
        </label>
      </section>

      {error ? <div className="notice notice-bad page-notice"><AlertCircle size={16} /><span>{error}</span></div> : null}
      <JobPanel job={job} />

      <section className="bulk-bar">
        <label className="select-all">
          <input
            type="checkbox"
            checked={filteredProducts.length > 0 && selectedVisibleCount === filteredProducts.length}
            onChange={toggleVisible}
          />
          <span>{selectedVisibleCount}/{filteredProducts.length} visible selected</span>
        </label>
        <button className="replace-button" disabled={!selected.size || jobRunning} onClick={() => void generateSelected()}>
          {jobRunning ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
          <span>{jobRunning ? "Generating" : "Generate selected"}</span>
        </button>
      </section>

      {loading && !payload ? (
        <div className="loading-card"><Loader2 className="spin" size={24} /><span>Loading products</span></div>
      ) : null}

      <section className="product-table">
        {filteredProducts.map((product) => {
          const status = generationStateLabel(product);
          const ready = product.generatedImages.length > 0;
          const replacing = Boolean(replaceState[product.id]?.loading);
          return (
            <article className="product-row" key={product.id}>
              <input
                className="row-check"
                type="checkbox"
                checked={selected.has(product.id)}
                onChange={() => toggleProduct(product.id)}
                aria-label={`Select ${product.title}`}
              />
              <ProductThumb product={product} />
              <div className="row-main">
                <div className="row-title">
                  <button className="link-button" onClick={() => navigateToProduct(product.id)}>
                    <h2>{product.title}</h2>
                  </button>
                  <Badge tone={generationStateTone(product)}>{status}</Badge>
                </div>
                <p>{product.handle}</p>
                <div className="product-meta">
                  <Badge>{product.productType || "No category"}</Badge>
                  {product.collections.slice(0, 2).map((item) => <Badge key={item.id}>{item.title}</Badge>)}
                  <Badge>{product.generatedImages.length} generated</Badge>
                  <Badge>{product.currentImages.length} current</Badge>
                </div>
                {replaceState[product.id]?.message ? (
                  <div className="inline-success"><Check size={14} />{replaceState[product.id]?.message}</div>
                ) : null}
                {replaceState[product.id]?.error ? (
                  <div className="inline-error"><AlertCircle size={14} />{replaceState[product.id]?.error}</div>
                ) : null}
              </div>
              <ProductGallery product={product} />
              <button className="secondary-button push-button" disabled={!ready || replacing} onClick={() => void replaceImages(product)}>
                {replacing ? <Loader2 className="spin" size={16} /> : <UploadCloud size={16} />}
                <span>Push</span>
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
