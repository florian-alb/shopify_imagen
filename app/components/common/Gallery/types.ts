import type { GeneratedImageStateTone } from "@/features/images/lib/state";
import type { ReviewStatus } from "@/features/images/lib/review";

import type { LightboxImage } from "../Lightbox";

export type GalleryItem = {
  id?: string;
  url: string;
  label?: string;
  caption?: string;
  retouched?: boolean;
  reviewStatus?: ReviewStatus;
  statusLabel?: string;
  statusTone?: GeneratedImageStateTone;
  reviewable?: boolean;
  reviewing?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onRetouch?: () => void;
  onDelete?: () => void;
};

export type PendingGalleryItem = {
  id: string;
  caption?: string;
  statusLabel: string;
};

export type GalleryReorder = {
  dragId: string | null;
  disabled: boolean;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onCommit: () => void;
};

export type GalleryProps = {
  title: string;
  description?: string;
  items: GalleryItem[];
  pendingItems?: PendingGalleryItem[];
  emptyText: string;
  onZoom: (images: LightboxImage[], index: number) => void;
  reorder?: GalleryReorder;
};
