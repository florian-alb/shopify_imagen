import { config } from "../config.js";
import type { ShopifyImage, ShopifyProduct, ShopifyProductVariant } from "../types.js";

interface GraphQlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface ProductsQueryResponse {
  products: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: Array<{
      id: string;
      title: string;
      handle: string;
      descriptionHtml?: string | null;
      productType?: string | null;
      vendor?: string | null;
      tags: string[];
      collections?: {
        nodes: Array<{
          id: string;
          title: string;
          handle: string;
        }>;
      } | null;
      featuredMedia?: {
        preview?: {
          image?: {
            url?: string | null;
            altText?: string | null;
          } | null;
        } | null;
      } | null;
      options?: Array<{
        name?: string | null;
        values?: string[] | null;
      }> | null;
      variants?: {
        nodes: Array<{
          id: string;
          title: string;
          selectedOptions?: Array<{ name?: string | null; value?: string | null }> | null;
        }>;
      } | null;
      media?: {
        nodes: Array<{
          id: string;
          alt?: string | null;
          mediaContentType: string;
          preview?: {
            image?: {
              url?: string | null;
              altText?: string | null;
            } | null;
          } | null;
          image?: {
            url?: string | null;
            altText?: string | null;
          } | null;
        }>;
      } | null;
    }>;
  };
}

interface StagedUploadsCreateResponse {
  stagedUploadsCreate: {
    stagedTargets: Array<{
      url: string;
      resourceUrl: string;
      parameters: Array<{ name: string; value: string }>;
    }>;
    userErrors: Array<{ field?: string[] | null; message: string }>;
  };
}

interface ProductUpdateMediaResponse {
  productUpdate: {
    product: {
      id: string;
      media: {
        nodes: Array<{
          id: string;
          alt?: string | null;
          mediaContentType: string;
          preview?: { status?: string | null } | null;
        }>;
      };
    } | null;
    userErrors: Array<{ field?: string[] | null; message: string }>;
  };
}

interface ProductDeleteMediaResponse {
  productDeleteMedia: {
    deletedMediaIds?: string[] | null;
    deletedProductImageIds?: string[] | null;
    mediaUserErrors: Array<{ field?: string[] | null; message: string }>;
  };
}

interface ShopifyTokenResponse {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

const PRODUCTS_QUERY = `#graphql
  query ProductsForImageExport($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        descriptionHtml
        productType
        vendor
        tags
        collections(first: 20) {
          nodes {
            id
            title
            handle
          }
        }
        featuredMedia {
          preview {
            image {
              url
              altText
            }
          }
        }
        options {
          name
          values
        }
        variants(first: 100) {
          nodes {
            id
            title
            selectedOptions {
              name
              value
            }
          }
        }
        media(first: 50) {
          nodes {
            id
            alt
            mediaContentType
            preview {
              image {
                url
                altText
              }
            }
            ... on MediaImage {
              image {
                url
                altText
              }
            }
          }
        }
      }
    }
  }
`;

const STAGED_UPLOADS_CREATE_MUTATION = `#graphql
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_UPDATE_MEDIA_MUTATION = `#graphql
  mutation ProductUpdateWithGeneratedMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
    productUpdate(product: $product, media: $media) {
      product {
        id
        media(first: 100) {
          nodes {
            id
            alt
            mediaContentType
            preview {
              status
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_DELETE_MEDIA_MUTATION = `#graphql
  mutation ProductDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      deletedProductImageIds
      mediaUserErrors {
        field
        message
      }
    }
  }
`;

function normalizeShopDomain(domain: string): string {
  const trimmed = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!trimmed) throw new Error("SHOPIFY_SHOP_DOMAIN is required.");
  return trimmed.includes(".") ? trimmed : `${trimmed}.myshopify.com`;
}

function shopifyEndpoint(): string {
  const domain = normalizeShopDomain(config.shopifyShopDomain);
  return `https://${domain}/admin/api/${config.shopifyApiVersion}/graphql.json`;
}

async function getShopifyAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  if (!config.shopifyClientId) {
    throw new Error("SHOPIFY_CLIENT_ID is required.");
  }
  if (!config.shopifyClientSecret) {
    throw new Error("SHOPIFY_CLIENT_SECRET is required.");
  }

  const domain = normalizeShopDomain(config.shopifyShopDomain);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.shopifyClientId,
    client_secret: config.shopifyClientSecret
  });

  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = (await response.json().catch(() => null)) as ShopifyTokenResponse | null;
  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description ?? payload?.error ?? `Shopify token request failed with ${response.status}.`;
    throw new Error(message);
  }

  cachedAccessToken = {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 86_399) * 1000
  };

  return cachedAccessToken.token;
}

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const endpoint = shopifyEndpoint();
  const token = await getShopifyAccessToken();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = (await response.json().catch(() => null)) as GraphQlResponse<T> | null;
  if (!response.ok) {
    throw new Error(`Shopify API request failed with ${response.status}.`);
  }
  if (payload?.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }
  if (!payload?.data) {
    throw new Error("Shopify API response did not include data.");
  }

  return payload.data;
}

function throwUserErrors(errors: Array<{ field?: string[] | null; message: string }>, label: string): void {
  if (!errors.length) return;
  throw new Error(`${label}: ${errors.map((error) => error.message).join("; ")}`);
}

function mapImages(product: ProductsQueryResponse["products"]["nodes"][number]): ShopifyImage[] {
  const images: ShopifyImage[] = (product.media?.nodes ?? [])
    .filter((media) => media.mediaContentType === "IMAGE")
    .map((media) => ({
      id: media.id,
      mediaId: media.id,
      url: media.image?.url ?? media.preview?.image?.url ?? null,
      altText: media.image?.altText ?? media.preview?.image?.altText ?? media.alt ?? null
    }))
    .filter((image) => image.url);

  const featuredUrl = product.featuredMedia?.preview?.image?.url;
  if (featuredUrl && !images.some((image) => image.url === featuredUrl)) {
    images.unshift({
      id: null,
      mediaId: null,
      url: featuredUrl,
      altText: product.featuredMedia?.preview?.image?.altText ?? null
    });
  }

  return images;
}

function mapVariants(product: ProductsQueryResponse["products"]["nodes"][number]): ShopifyProductVariant[] {
  return (product.variants?.nodes ?? []).map((variant) => ({
    id: variant.id,
    title: variant.title,
    selectedOptions: variant.selectedOptions ?? null
  }));
}

function mapProduct(product: ProductsQueryResponse["products"]["nodes"][number]): ShopifyProduct {
  const images = mapImages(product);

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    productType: product.productType ?? null,
    vendor: product.vendor ?? null,
    collections: product.collections?.nodes ?? null,
    descriptionHtml: product.descriptionHtml ?? null,
    tags: product.tags,
    options: product.options ?? null,
    variants: mapVariants(product),
    images,
    featuredImage: images[0] ?? null
  };
}

export async function listProducts(options: { limit: number; query?: string }): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let after: string | null = null;

  while (products.length < options.limit) {
    const first = Math.min(50, options.limit - products.length);
    const variables: Record<string, unknown> = {
      first,
      after,
      query: options.query ?? config.shopifyProductQuery
    };
    const data: ProductsQueryResponse = await shopifyGraphql<ProductsQueryResponse>(PRODUCTS_QUERY, variables);

    products.push(...data.products.nodes.map(mapProduct));
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }

  return products;
}

export function hasShopifyCredentials(): boolean {
  return Boolean(config.shopifyShopDomain && config.shopifyClientId && config.shopifyClientSecret);
}

function mimeTypeForPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function stagedUploadProductImage(filePath: string): Promise<string> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const filename = path.basename(filePath);
  const mimeType = mimeTypeForPath(filePath);

  const data = await shopifyGraphql<StagedUploadsCreateResponse>(STAGED_UPLOADS_CREATE_MUTATION, {
    input: [
      {
        filename,
        mimeType,
        httpMethod: "POST",
        resource: "PRODUCT_IMAGE"
      }
    ]
  });

  throwUserErrors(data.stagedUploadsCreate.userErrors, "Shopify staged upload creation failed");

  const target = data.stagedUploadsCreate.stagedTargets[0];
  if (!target) {
    throw new Error("Shopify staged upload creation returned no target.");
  }

  const form = new FormData();
  for (const parameter of target.parameters) {
    form.append(parameter.name, parameter.value);
  }

  const bytes = fs.readFileSync(filePath);
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: form
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text().catch(() => "");
    throw new Error(`Shopify staged upload failed with ${uploadResponse.status}. ${body}`.trim());
  }

  return target.resourceUrl;
}

export async function addGeneratedMediaToProduct(
  productId: string,
  media: Array<{ originalSource: string; alt: string }>
): Promise<Array<{ id: string; alt?: string | null; status?: string | null }>> {
  if (!media.length) return [];

  const data = await shopifyGraphql<ProductUpdateMediaResponse>(PRODUCT_UPDATE_MEDIA_MUTATION, {
    product: { id: productId },
    media: media.map((item) => ({
      originalSource: item.originalSource,
      alt: item.alt,
      mediaContentType: "IMAGE"
    }))
  });

  throwUserErrors(data.productUpdate.userErrors, "Shopify product media update failed");

  return (
    data.productUpdate.product?.media.nodes
      .filter((node) => node.mediaContentType === "IMAGE")
      .map((node) => ({ id: node.id, alt: node.alt, status: node.preview?.status })) ?? []
  );
}

export async function deleteProductMedia(productId: string, mediaIds: string[]): Promise<string[]> {
  const uniqueMediaIds = Array.from(new Set(mediaIds)).filter(Boolean);
  if (!uniqueMediaIds.length) return [];

  const data = await shopifyGraphql<ProductDeleteMediaResponse>(PRODUCT_DELETE_MEDIA_MUTATION, {
    productId,
    mediaIds: uniqueMediaIds
  });

  throwUserErrors(data.productDeleteMedia.mediaUserErrors, "Shopify product media deletion failed");
  return data.productDeleteMedia.deletedMediaIds ?? [];
}
