export const PRODUCTS_QUERY = `#graphql
  query ProductsForImageStudio($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        productType
        vendor
        tags
        collections(first: 50) { nodes { id title handle } }
        featuredMedia { preview { image { url altText } } }
        options { name values }
        variants(first: 100) {
          nodes {
            id
            title
            selectedOptions { name value }
            media(first: 20) { nodes { id } }
          }
        }
        metafields(first: 50) { nodes { id namespace key type value } }
        media(first: 100) {
          nodes {
            id
            alt
            mediaContentType
            preview { image { url altText } }
            ... on MediaImage { image { url altText } }
          }
        }
      }
    }
  }
`;

export const PRODUCT_QUERY = `#graphql
  query ProductForImageStudio($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      productType
      vendor
      tags
      collections(first: 50) { nodes { id title handle } }
      featuredMedia { preview { image { url altText } } }
      options { name values }
      variants(first: 100) {
        nodes {
          id
          title
          selectedOptions { name value }
          media(first: 20) { nodes { id } }
        }
      }
      metafields(first: 50) { nodes { id namespace key type value } }
      media(first: 100) {
        nodes {
          id
          alt
          mediaContentType
          preview { image { url altText } }
          ... on MediaImage { image { url altText } }
        }
      }
    }
  }
`;

export const PRODUCT_UPDATE_MEDIA_MUTATION = `#graphql
  mutation ProductUpdateWithGeneratedMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
    productUpdate(product: $product, media: $media) {
      product { id media(first: 100) { nodes { id alt mediaContentType preview { status } } } }
      userErrors { field message }
    }
  }
`;

export const PRODUCT_VARIANT_APPEND_MEDIA_MUTATION = `#graphql
  mutation ProductVariantAppendGeneratedMedia(
    $productId: ID!
    $variantMedia: [ProductVariantAppendMediaInput!]!
  ) {
    productVariantAppendMedia(
      productId: $productId
      variantMedia: $variantMedia
    ) {
      productVariants {
        id
        media(first: 20) { nodes { id } }
      }
      userErrors { field message }
    }
  }
`;

export const PRODUCT_VARIANT_DETACH_MEDIA_MUTATION = `#graphql
  mutation ProductVariantDetachGeneratedMedia(
    $productId: ID!
    $variantMedia: [ProductVariantDetachMediaInput!]!
  ) {
    productVariantDetachMedia(
      productId: $productId
      variantMedia: $variantMedia
    ) {
      productVariants {
        id
        media(first: 20) {
          nodes {
            id
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

export const SHOPIFY_AUTHORIZATION_STATUS_QUERY = `#graphql
  query ShopifyAuthorizationStatus {
    currentAppInstallation {
      app {
        requestedAccessScopes { handle }
      }
      accessScopes { handle }
    }
  }
`;

export const PRODUCT_DUPLICATE_MUTATION = `#graphql
  mutation DuplicateProductForVisualGroup(
    $productId: ID!
    $newTitle: String!
    $newStatus: ProductStatus
    $includeImages: Boolean
    $synchronous: Boolean
  ) {
    productDuplicate(
      productId: $productId
      newTitle: $newTitle
      newStatus: $newStatus
      includeImages: $includeImages
      synchronous: $synchronous
    ) {
      newProduct {
        id
        title
        handle
      variants(first: 250) {
        nodes {
          id
          title
          selectedOptions { name value }
          media(first: 20) { nodes { id } }
        }
      }
      }
      userErrors { field message }
    }
  }
`;

export const PRODUCT_MEDIA_FILE_STATUS_QUERY = `#graphql
  query ProductMediaFileStatus($id: ID!) {
    product(id: $id) {
      id
      media(first: 250) {
        nodes {
          id
          alt
          mediaContentType
          status
          ... on MediaImage {
            fileStatus
            image { url altText }
            originalSource { url fileSize }
          }
        }
      }
    }
  }
`;

export const PRODUCT_VARIANTS_BULK_DELETE_MUTATION = `#graphql
  mutation DeleteUnmatchedVisualVariants(
    $productId: ID!
    $variantsIds: [ID!]!
  ) {
    productVariantsBulkDelete(
      productId: $productId
      variantsIds: $variantsIds
    ) {
      product { id }
      userErrors { field message }
    }
  }
`;

export const MEDIA_IMAGE_FILE_STATUS_QUERY = `#graphql
  query MediaImageFileStatus($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        id
        alt
        mediaContentType
        status
        fileStatus
        image { url altText }
        originalSource { url fileSize }
      }
    }
  }
`;

export const FILE_UPDATE_MUTATION = `#graphql
  mutation BulkFileUpdate($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files { id fileStatus }
      userErrors { field message code }
    }
  }
`;

export const FILE_ACKNOWLEDGE_UPDATE_FAILED_MUTATION = `#graphql
  mutation BulkFileAcknowledgeUpdateFailed($fileIds: [ID!]!) {
    fileAcknowledgeUpdateFailed(fileIds: $fileIds) {
      files { id fileStatus }
      userErrors { field message code }
    }
  }
`;

export const PRODUCT_DELETE_MEDIA_MUTATION = `#graphql
  mutation ProductDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      deletedProductImageIds
      mediaUserErrors { field message }
    }
  }
`;

export const PRODUCT_REORDER_MEDIA_MUTATION = `#graphql
  mutation ProductReorderMedia($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      job { id }
      mediaUserErrors { field message }
    }
  }
`;

export const SHOPIFY_JOB_QUERY = `#graphql
  query ShopifyJob($id: ID!) {
    job(id: $id) { id done }
  }
`;
