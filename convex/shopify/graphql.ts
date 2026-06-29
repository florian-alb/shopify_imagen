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
        variants(first: 100) { nodes { id title selectedOptions { name value } } }
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
      variants(first: 100) { nodes { id title selectedOptions { name value } } }
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
