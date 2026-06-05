import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GenerationStatus } from "@/lib/status";

const statusClasses: Record<GenerationStatus, string> = {
  not_started: "border-border bg-muted text-muted-foreground",
  generating: "border-amber-200 bg-amber-50 text-amber-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pushed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  canceled: "border-red-200 bg-red-50 text-red-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

export function PageHeader({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="truncate text-2xl font-semibold sm:text-3xl">{title}</h1>
        {children}
      </div>
      {action}
    </header>
  );
}

export function StatusBadge({
  status,
  label,
}: {
  status: GenerationStatus;
  label: string;
}) {
  return (
    <Badge variant="outline" className={statusClasses[status]}>
      {label}
    </Badge>
  );
}

export function StateBadge({
  children,
  state = "neutral",
}: {
  children: ReactNode;
  state?: "neutral" | "success" | "warning" | "danger";
}) {
  const className =
    state === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : state === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : state === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-border bg-muted/60 text-muted-foreground";
  return (
    <Badge variant="outline" className={className}>
      {children}
    </Badge>
  );
}

export function EmptyState({
  title,
  body,
  loading = false,
}: {
  title: string;
  body: string;
  loading?: boolean;
}) {
  return (
    <Card className="min-h-48 justify-center rounded-lg">
      <CardContent className="mx-auto max-w-md text-center">
        {loading ? <Skeleton className="mx-auto mb-4 h-5 w-32" /> : null}
        <h2 className="text-base font-medium">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

export function BusyIcon({ busy }: { busy: boolean }) {
  return busy ? (
    <LoaderCircle data-icon="inline-start" className="animate-spin" />
  ) : null;
}

export function NumberedPaginator({
  offset,
  pageSize,
  hasPrevious,
  hasNext,
  loading = false,
  onOffsetChange,
}: {
  offset: number;
  pageSize: number;
  hasPrevious: boolean;
  hasNext: boolean;
  loading?: boolean;
  onOffsetChange: (offset: number) => void;
}) {
  const currentPage = Math.floor(offset / pageSize) + 1;
  const pages = Array.from(
    new Set([
      1,
      Math.max(1, currentPage - 2),
      Math.max(1, currentPage - 1),
      currentPage,
      ...(hasNext ? [currentPage + 1] : []),
    ]),
  ).sort((a, b) => a - b);
  const goToPage = (page: number) =>
    onOffsetChange(Math.max(0, (page - 1) * pageSize));
  const pageClick =
    (page: number) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (!loading) goToPage(page);
    };
  const offsetClick =
    (nextOffset: number) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (!loading) onOffsetChange(Math.max(0, nextOffset));
    };
  const setOffset = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) onOffsetChange(Math.max(0, parsed));
  };

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
      <Field orientation="horizontal" className="w-fit">
        <FieldLabel htmlFor="select-rows-per-page">Rows per page</FieldLabel>
        <Select defaultValue="20" onValueChange={(value) => setOffset(value)}>
          <SelectTrigger className="w-20" id="select-rows-per-page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={loading || !hasPrevious}
              className={
                !hasPrevious || loading
                  ? "pointer-events-none opacity-50"
                  : undefined
              }
              onClick={offsetClick(offset - pageSize)}
            />
          </PaginationItem>
          {pages.length > 2 && currentPage > 3 ? (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          ) : null}
          {pages.map((page) => (
            <PaginationItem key={page}>
              <PaginationLink
                href="#"
                isActive={page === currentPage}
                aria-disabled={loading}
                className={
                  loading ? "pointer-events-none opacity-50" : undefined
                }
                onClick={pageClick(page)}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ))}
          {hasNext && pages[pages.length - 1] > currentPage + 1 ? (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          ) : null}
          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={loading || !hasNext}
              className={
                !hasNext || loading
                  ? "pointer-events-none opacity-50"
                  : undefined
              }
              onClick={offsetClick(offset + pageSize)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
