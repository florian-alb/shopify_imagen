import { Fragment, type MouseEvent, type ReactNode } from "react";
import { LoaderCircle, PackageOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

const readableBadgeBase = "h-6 border px-2.5 text-xs font-medium";

export const pageContentClass = "w-full px-4 py-4 md:px-5";

const statusClasses: Record<GenerationStatus, string> = {
  not_started:
    "border-stone-300 bg-stone-100 text-stone-800 dark:border-stone-600/60 dark:bg-stone-800 dark:text-stone-200",
  generating:
    "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200",
  partial:
    "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200",
  ready:
    "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200",
  pushed:
    "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200",
  canceled:
    "border-red-300 bg-red-100 text-red-950 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-200",
  failed:
    "border-red-300 bg-red-100 text-red-950 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-200",
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
    <header className="mb-4 flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-sm text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="truncate text-2xl font-semibold leading-tight sm:text-3xl">
          {title}
        </h1>
        {children ? (
          <div className="mt-2 text-sm text-muted-foreground">{children}</div>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {action}
        </div>
      ) : null}
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
    <Badge
      variant="outline"
      className={`${readableBadgeBase} ${statusClasses[status]}`}
    >
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
      ? "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200"
      : state === "warning"
        ? "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
        : state === "danger"
          ? "border-red-300 bg-red-100 text-red-950 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-200"
          : "border-stone-300 bg-stone-100 text-stone-800 dark:border-stone-600/60 dark:bg-stone-800 dark:text-stone-200";
  return (
    <Badge variant="outline" className={`${readableBadgeBase} ${className}`}>
      {children}
    </Badge>
  );
}

export function EmptyState({
  title,
  body,
  children,
  loading = false,
}: {
  title: string;
  body: string;
  children?: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="min-h-56 justify-center rounded-lg">
      <CardContent className="mx-auto max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-lg border border-border bg-muted text-primary">
          {loading ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <PackageOpen className="size-5" />
          )}
        </div>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="mx-auto h-5 w-40" />
            <Skeleton className="mx-auto h-4 w-64 max-w-full" />
          </div>
        ) : (
          <>
            <h2 className="text-base font-medium">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {body}
            </p>
            {children ? (
              <div className="mt-4 flex justify-center">{children}</div>
            ) : null}
          </>
        )}
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
  page,
  pageSize,
  hasPrevious,
  hasNext,
  loading = false,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  hasPrevious: boolean;
  hasNext: boolean;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const currentPage = Math.max(1, page);
  const pages = Array.from(
    new Set([
      1,
      Math.max(1, currentPage - 2),
      Math.max(1, currentPage - 1),
      currentPage,
      ...(hasNext ? [currentPage + 1] : []),
    ]),
  ).sort((a, b) => a - b);

  const goToPage = (nextPage: number) => onPageChange(Math.max(1, nextPage));
  const pageClick =
    (nextPage: number) => (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (!loading) goToPage(nextPage);
    };
  const navClick =
    (nextPage: number) => (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (!loading) goToPage(nextPage);
    };
  const changePageSize = (value: string) => {
    const size = Number.parseInt(value, 10);
    if (Number.isFinite(size)) {
      onPageSizeChange?.(size);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
      {onPageSizeChange ? (
        <Field orientation="horizontal" className="w-fit">
          <FieldLabel
            htmlFor="select-rows-per-page"
            className="text-xs text-muted-foreground"
          >
            Lignes
          </FieldLabel>
          <Select value={String(pageSize)} onValueChange={changePageSize}>
            <SelectTrigger className="h-8 w-20" id="select-rows-per-page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <span className="text-xs text-muted-foreground">
          Page {currentPage}
        </span>
      )}
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
              onClick={navClick(currentPage - 1)}
            />
          </PaginationItem>
          {pages.map((pageNumber, i) => (
            <Fragment key={pageNumber}>
              {i > 0 && pageNumber > pages[i - 1] + 1 ? (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : null}
              <PaginationItem>
                <PaginationLink
                  href="#"
                  isActive={pageNumber === currentPage}
                  aria-disabled={loading}
                  className={
                    loading ? "pointer-events-none opacity-50" : undefined
                  }
                  onClick={pageClick(pageNumber)}
                >
                  {pageNumber}
                </PaginationLink>
              </PaginationItem>
            </Fragment>
          ))}
          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={loading || !hasNext}
              className={
                !hasNext || loading
                  ? "pointer-events-none opacity-50"
                  : undefined
              }
              onClick={navClick(currentPage + 1)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
