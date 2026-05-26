import { Link, createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Send, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, EmptyState, PageHeader } from "../../components/ui";
import { getAvailableImageTypes, getBudgetImageTypes } from "../../lib/fixationDetector";
import { IMAGE_TYPE_LABELS, type ImageType } from "../../lib/imageTypes";
import { generationStatusLabels, statusTone, type GenerationStatus } from "../../lib/status";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/products/$productId")({
  component: ProductDetailPage
});

type ProductDetail = {
  product: Doc<"products">;
  images: Doc<"generatedImages">[];
} | null;

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const data = useQuery(api.products.getWithImages, { productId: productId as Id<"products"> }) as ProductDetail | undefined;
  const createJob = useMutation(api.jobs.create);
  const pushImages = useAction(api.shopify.pushProductImages);
  const [selectedTypes, setSelectedTypes] = useState<Set<ImageType>>(new Set());
  const [force, setForce] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const product = data?.product;
  const images = data?.images ?? [];
  const availableTypes = useMemo(() => getAvailableImageTypes(product?.detectedFixations ?? []), [product?.detectedFixations]);
  const readyImages = images.filter((image) => image.status === "generated" && image.storageUrl);

  function applyBudget() {
    setSelectedTypes(new Set(getBudgetImageTypes(product?.detectedFixations ?? [])));
  }

  async function generate() {
    if (!product) return;
    setBusy("generate");
    setError(null);
    try {
      const imageTypes = selectedTypes.size ? Array.from(selectedTypes) : getBudgetImageTypes(product.detectedFixations);
      const jobId = await createJob({
        productIds: [product._id],
        selectedImageTypes: imageTypes,
        forceRegenerate: force
      });
      window.location.href = `/jobs/${jobId}`;
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : String(jobError));
    } finally {
      setBusy(null);
    }
  }

  async function push() {
    if (!product) return;
    setBusy("push");
    setError(null);
    try {
      await pushImages({
        productId: product._id,
        imageIds: readyImages.map((image) => image._id),
        replaceExisting
      });
      setPushOpen(false);
    } catch (pushError) {
      setError(pushError instanceof Error ? pushError.message : String(pushError));
    } finally {
      setBusy(null);
    }
  }

  if (data === undefined) {
    return (
      <main className="page">
        <EmptyState title="Loading product" body="Fetching product details, Shopify images, and generated image history." />
      </main>
    );
  }

  if (!product) {
    return (
      <main className="page">
        <EmptyState title="Product not found" body="The product may not be synced into Convex yet." />
      </main>
    );
  }

  return (
    <main className="page">
      <Link to="/products" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
        <ArrowLeft size={16} />
        Products
      </Link>
      <PageHeader
        eyebrow={product.handle}
        title={product.title}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={applyBudget}>
              Budget
            </Button>
            <Button onClick={() => void generate()} loading={busy === "generate"}>
              <WandSparkles size={16} />
              Generate
            </Button>
          </div>
        }
      />

      {error ? <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{error}</div> : null}

      <section className="mb-4 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
        <div className="panel p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(product.generationStatus as GenerationStatus)}>
              {generationStatusLabels[product.generationStatus as GenerationStatus]}
            </Badge>
            <Badge>{product.productType || "No category"}</Badge>
            {product.vendor ? <Badge>{product.vendor}</Badge> : null}
          </div>
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <Fact label="Detected fixations" value={product.detectedFixations.join(", ") || "None"} />
            <Fact label="Collections" value={product.collections.map((collection: any) => collection.title).join(", ") || "None"} />
            <Fact label="Last synced" value={product.lastSyncedAt ? new Date(product.lastSyncedAt).toLocaleString() : "Never"} />
            <Fact label="Generated history" value={`${images.length} image records`} />
          </dl>
        </div>

        <div className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Image types</h2>
          <div className="grid gap-2">
            {availableTypes.map((type) => (
              <label key={type} className="flex min-h-10 items-center justify-between rounded-md border border-[var(--border)] px-3 text-sm">
                <span>{IMAGE_TYPE_LABELS[type]}</span>
                <input
                  className="size-5 accent-[var(--ink)]"
                  type="checkbox"
                  checked={selectedTypes.has(type)}
                  onChange={() =>
                    setSelectedTypes((current) => {
                      const next = new Set(current);
                      if (next.has(type)) next.delete(type);
                      else next.add(type);
                      return next;
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label className="mt-3 flex min-h-10 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm">
            <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
            Regenerate existing
          </label>
        </div>
      </section>

      <section className="mb-4 grid gap-4 md:grid-cols-2">
        <Gallery title="Current Shopify images" images={product.currentShopifyImages} />
        <GeneratedGallery images={images} />
      </section>

      <section className="panel mb-4 p-4">
        <h2 className="mb-3 text-lg font-semibold">Prompt and image history</h2>
        <div className="grid gap-3">
          {images.length ? (
            images.map((image) => <HistoryItem key={image._id} image={image} />)
          ) : (
            <p className="text-sm text-[var(--muted)]">No generated image records yet.</p>
          )}
        </div>
      </section>

      <section className="sticky-actions flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{readyImages.length} generated image{readyImages.length === 1 ? "" : "s"} ready</div>
          <div className="text-xs text-[var(--muted)]">Push is manual and requires confirmation.</div>
        </div>
        <Button disabled={!readyImages.length} onClick={() => setPushOpen(true)}>
          <Send size={16} />
          Push
        </Button>
      </section>

      {pushOpen ? (
        <div className="fixed inset-0 z-30 grid place-items-end bg-black/30 md:place-items-center">
          <section className="w-full rounded-t-lg bg-white p-4 shadow-2xl md:max-w-lg md:rounded-lg">
            <h2 className="text-lg font-semibold">Push generated images to Shopify?</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This uploads the approved generated images. Existing Shopify media is kept unless you explicitly choose replacement.
            </p>
            <label className="mt-4 flex items-start gap-3 rounded-md border border-[var(--border)] p-3 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={replaceExisting}
                onChange={(event) => setReplaceExisting(event.target.checked)}
              />
              <span>Replace current Shopify gallery after upload</span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPushOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void push()} loading={busy === "push"}>
                Confirm push
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function Gallery({ title, images }: { title: string; images: any[] }) {
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge>{images.length}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.length ? (
          images.map((image, index) => (
            <figure key={`${image.url}-${index}`} className="image-tile">
              <img src={image.url} alt={image.altText ?? title} />
            </figure>
          ))
        ) : (
          <p className="col-span-2 text-sm text-[var(--muted)]">No images found.</p>
        )}
      </div>
    </section>
  );
}

function GeneratedGallery({ images }: { images: Doc<"generatedImages">[] }) {
  const generated = images.filter((image) => image.storageUrl);
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Generated images</h2>
        <Badge>{generated.length}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {generated.length ? (
          generated.map((image) => (
            <figure key={image._id} className="overflow-hidden rounded-lg border border-[var(--border)]">
              <div className="image-tile border-0">
                <img src={image.storageUrl!} alt={image.imageType} />
              </div>
              <figcaption className="p-2 text-xs font-medium">{image.imageType}</figcaption>
            </figure>
          ))
        ) : (
          <p className="col-span-2 text-sm text-[var(--muted)]">No generated images yet.</p>
        )}
      </div>
    </section>
  );
}

function HistoryItem({ image }: { image: Doc<"generatedImages"> }) {
  return (
    <details className="rounded-md border border-[var(--border)] bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {image.imageType} · {image.status}
      </summary>
      <div className="mt-3 grid gap-2 text-sm">
        {image.error ? <div className="text-[var(--danger)]">{image.error}</div> : null}
        {image.storageUrl ? (
          <a className="break-all text-[var(--accent)]" href={image.storageUrl} target="_blank" rel="noreferrer">
            {image.storageUrl}
          </a>
        ) : null}
        <pre className="max-h-64 overflow-auto rounded-md bg-[var(--surface)] p-3 text-xs whitespace-pre-wrap">{image.promptUsed}</pre>
      </div>
    </details>
  );
}
