import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { api } from "@/lib/convex";
import { cn } from "@/lib/utils";

type BreadcrumbRoute =
  | "/products"
  | "/jobs"
  | "/bulk-operations"
  | "/settings"
  | "/settings/prompts";

type AppBreadcrumbItem = {
  label: string;
  to?: BreadcrumbRoute;
};

function normalizePathname(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function routeBreadcrumbs(pathname: string): AppBreadcrumbItem[] {
  const normalizedPathname = normalizePathname(pathname);

  if (normalizedPathname === "/products") {
    return [{ label: "Produits", to: "/products" }];
  }

  if (normalizedPathname.startsWith("/products/")) {
    return [
      { label: "Produits", to: "/products" },
      { label: "Produit" },
    ];
  }

  if (normalizedPathname === "/jobs") {
    return [{ label: "Generations", to: "/jobs" }];
  }

  if (normalizedPathname.startsWith("/jobs/")) {
    const jobId = normalizedPathname.split("/").filter(Boolean).at(-1);
    return [
      { label: "Generations", to: "/jobs" },
      { label: jobId ? `Job ${jobId.slice(-6)}` : "Job" },
    ];
  }

  if (normalizedPathname === "/bulk-operations") {
    return [{ label: "Bulk operations", to: "/bulk-operations" }];
  }

  if (normalizedPathname === "/settings") {
    return [{ label: "Parametres", to: "/settings" }];
  }

  if (normalizedPathname === "/settings/prompts") {
    return [
      { label: "Configuration", to: "/settings" },
      { label: "Prompts", to: "/settings/prompts" },
    ];
  }

  return [{ label: "Page" }];
}

export function AppBreadcrumbs({ className }: { className?: string }) {
  const location = useLocation();
  const shopInfo = useQuery(api.settings.shopInfo);
  const shopLabel = shopInfo?.storeHandle ?? shopInfo?.domain ?? "Boutique";
  const items = [
    { label: shopLabel, to: "/products" satisfies BreadcrumbRoute },
    ...routeBreadcrumbs(location.pathname),
  ];

  return (
    <Breadcrumb className={cn("min-w-0 overflow-hidden", className)}>
      <BreadcrumbList className="min-w-0 flex-nowrap gap-1.5 text-xs font-medium">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 ? (
                <BreadcrumbSeparator className="shrink-0 text-muted-foreground/60" />
              ) : null}
              <BreadcrumbItem className="min-w-0">
                {item.to ? (
                  <BreadcrumbLink
                    asChild
                    className={cn("block truncate", isCurrent && "text-foreground")}
                  >
                    <Link
                      to={item.to}
                      aria-current={isCurrent ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate font-medium">
                    {item.label}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
