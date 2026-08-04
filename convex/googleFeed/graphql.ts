export const GOOGLE_FEED_DEFINITIONS_QUERY = `#graphql
  query GoogleFeedMetafieldDefinitions {
    currentAppInstallation {
      app { id title }
    }
    category: metafieldDefinitions(
      first: 50
      ownerType: PRODUCT
      key: "google_product_category"
    ) {
      nodes {
        id
        namespace
        key
        name
        ownerType
        type { name }
        access { admin }
      }
    }
    gender: metafieldDefinitions(
      first: 50
      ownerType: PRODUCTVARIANT
      key: "gender"
    ) {
      nodes {
        id
        namespace
        key
        name
        ownerType
        type { name }
        access { admin }
      }
    }
    ageGroup: metafieldDefinitions(
      first: 50
      ownerType: PRODUCTVARIANT
      key: "age_group"
    ) {
      nodes {
        id
        namespace
        key
        name
        ownerType
        type { name }
        access { admin }
      }
    }
  }
`

export const GOOGLE_FEED_METAFIELDS_SET_MUTATION = `#graphql
  mutation SetGoogleFeedMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
        compareDigest
      }
      userErrors {
        field
        message
        code
        elementIndex
      }
    }
  }
`

export const GOOGLE_FEED_VERIFY_METAFIELDS_QUERY = `#graphql
  query VerifyGoogleFeedMetafields(
    $ownerIds: [ID!]!
    $namespace: String
    $key: String!
  ) {
    nodes(ids: $ownerIds) {
      __typename
      ... on Product {
        id
        googleFeedValue: metafield(namespace: $namespace, key: $key) {
          value
          compareDigest
        }
      }
      ... on ProductVariant {
        id
        googleFeedValue: metafield(namespace: $namespace, key: $key) {
          value
          compareDigest
        }
      }
    }
  }
`

export const GOOGLE_PRODUCT_TAXONOMY_SOURCE =
  "https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt"
