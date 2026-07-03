import {
  Check,
  GripVertical,
  Paintbrush,
  Trash2,
  X,
} from "lucide-react";

import { BusyIcon, StateBadge } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { GalleryProps, PendingGalleryItem } from "./types";

export function Gallery({
  title,
  description,
  items,
  pendingItems = [],
  emptyText,
  onZoom,
  reorder,
}: GalleryProps) {
  const itemCount = items.length + pendingItems.length;
  const lightboxImages = items.map((item) => ({
    url: item.url,
    label: item.label,
  }));

  return (
    <Card className="min-h-72 rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {reorder?.disabled ? <BusyIcon busy /> : null}
          <StateBadge>{itemCount}</StateBadge>
        </div>
      </CardHeader>
      <CardContent>
        {description ? (
          <p className="mb-3 text-xs text-muted-foreground">{description}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {itemCount ? (
            <>
              {items.map((item, index) => {
                const canDrag = Boolean(
                  reorder && item.id && !reorder.disabled,
                );
                return (
                  <figure
                    key={item.id ?? `${item.url}-${index}`}
                    draggable={canDrag}
                    onDragStart={(event) => {
                      if (!item.id || !reorder) return;
                      event.dataTransfer.effectAllowed = "move";
                      reorder.onDragStart(item.id);
                    }}
                    onDragOver={(event) => {
                      if (!canDrag || !item.id || !reorder) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      reorder.onDragOver(item.id);
                    }}
                    onDrop={(event) => {
                      if (!canDrag || !reorder) return;
                      event.preventDefault();
                      void reorder.onCommit();
                    }}
                    onDragEnd={() => reorder && void reorder.onCommit()}
                    data-dragging={
                      reorder?.dragId === item.id ? "" : undefined
                    }
                    data-testid={
                      reorder ? `shopify-image-${index + 1}` : undefined
                    }
                    className={`group relative overflow-hidden rounded-lg ring-1 ring-border transition data-dragging:opacity-50${
                      canDrag ? " cursor-grab active:cursor-grabbing" : ""
                    }${item.reviewStatus === "rejected" ? " bg-muted opacity-70 grayscale" : ""}${
                      item.reviewStatus === "approved" ? " ring-emerald-200" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onZoom(lightboxImages, index)}
                      className="image-tile w-full cursor-zoom-in rounded-none transition hover:opacity-90"
                    >
                      <img
                        src={item.url}
                        alt={item.label ?? title}
                        draggable={false}
                      />
                    </button>
                    {reorder && item.id ? (
                      <span className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm">
                        <GripVertical className="size-3.5" />
                        {index + 1}
                      </span>
                    ) : null}
                    {item.onDelete ? (
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        aria-label="Delete image"
                        onClick={item.onDelete}
                        className="absolute top-1.5 right-1.5 bg-background/80 opacity-0 backdrop-blur-sm transition group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                    {item.onRetouch ? (
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Retoucher ${
                          item.caption ?? item.label ?? "image"
                        }`}
                        title="Retoucher"
                        onClick={item.onRetouch}
                        className="absolute top-1.5 right-10 bg-background/80 opacity-0 backdrop-blur-sm transition group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Paintbrush />
                      </Button>
                    ) : null}
                    {item.caption || item.statusLabel || item.reviewable ? (
                      <figcaption className="grid gap-2 px-2 py-2">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {item.caption ? (
                              <span className="truncate text-xs font-medium">
                                {item.caption}
                              </span>
                            ) : null}
                            {item.retouched ? (
                              <Badge
                                variant="outline"
                                className="shrink-0 text-[0.65rem]"
                              >
                                Retouche
                              </Badge>
                            ) : null}
                          </span>
                          {item.statusLabel ? (
                            <StateBadge state={item.statusTone}>
                              {item.statusLabel}
                            </StateBadge>
                          ) : null}
                        </div>
                        {item.reviewable ? (
                          <div className="grid grid-cols-2 gap-1">
                            <Button
                              type="button"
                              aria-label={`Approve ${
                                item.caption ?? item.label ?? "image"
                              }`}
                              title="Approve"
                              variant={
                                item.reviewStatus === "approved"
                                  ? "default"
                                  : "outline"
                              }
                              size="icon-sm"
                              disabled={item.reviewing}
                              onClick={item.onApprove}
                            >
                              <Check />
                            </Button>
                            <Button
                              type="button"
                              aria-label={`Reject ${
                                item.caption ?? item.label ?? "image"
                              }`}
                              title="Reject"
                              variant={
                                item.reviewStatus === "rejected"
                                  ? "destructive"
                                  : "outline"
                              }
                              size="icon-sm"
                              disabled={item.reviewing}
                              onClick={item.onReject}
                            >
                              <X />
                            </Button>
                          </div>
                        ) : null}
                      </figcaption>
                    ) : null}
                  </figure>
                );
              })}
              {pendingItems.map((item) => (
                <GeneratingGalleryCard key={item.id} item={item} />
              ))}
            </>
          ) : (
            <p className="col-span-2 text-sm text-muted-foreground">
              {emptyText}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GeneratingGalleryCard({ item }: { item: PendingGalleryItem }) {
  return (
    <figure className="relative overflow-hidden rounded-lg bg-muted/30 ring-1 ring-border">
      <div className="image-tile generated-wave-tile w-full rounded-none">
        <div className="generated-wave generated-wave-a" />
        <div className="generated-wave generated-wave-b" />
        <div className="generated-wave generated-wave-c" />
      </div>
      <figcaption className="grid gap-1.5 px-2 py-2">
        {item.caption ? (
          <span className="truncate text-xs font-medium" title={item.caption}>
            {item.caption}
          </span>
        ) : null}
        <div className="min-w-0">
          <StateBadge state="warning">{item.statusLabel}</StateBadge>
        </div>
      </figcaption>
    </figure>
  );
}
