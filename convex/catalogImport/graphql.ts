export const DIAGNOSTIC = `query CatalogImportDiagnostic {
  currentAppInstallation { accessScopes { handle } }
  shop { currencyCode primaryDomain { url } }
}`
export const DEFINITION = `mutation CatalogImportDefinition($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) { createdDefinition { id } userErrors { field message code } }
}`
export const DEFINITIONS = `query CatalogImportDefinitions($ownerType: MetafieldOwnerType!) {
  metafieldDefinitions(first: 10, ownerType: $ownerType, namespace: "imagen_catalog", key: "source_id") {
    nodes { id type { name } capabilities { uniqueValues { enabled } } }
  }
}`
export const FIND_PRODUCT = `query CatalogImportFindProduct($identifier: ProductIdentifierInput!) {
  productByIdentifier(identifier: $identifier) { id handle tags }
}`
export const PRODUCT_SET = `mutation CatalogImportProduct($input: ProductSetInput!, $identifier: ProductSetIdentifiers!) {
  productSet(input: $input, identifier: $identifier) { product { id handle tags } userErrors { field message code } }
}`
export const TAGS_ADD = `mutation CatalogImportTags($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { node { id } userErrors { message } }
}`
export const COLLECTION_CREATE = `mutation CatalogImportCollection($input: CollectionInput!) {
  collectionCreate(input: $input) { collection { id handle } userErrors { field message } }
}`
export const COLLECTIONS = `query CatalogImportCollections($query: String!) {
  collections(first: 5, query: $query) { nodes { id handle title metafield(namespace: "imagen_catalog", key: "source_id") { value } ruleSet { appliedDisjunctively rules { column relation condition } } } }
}`
export const MENU_CREATE = `mutation CatalogImportMenu($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
  menuCreate(title: $title, handle: $handle, items: $items) { menu { id handle } userErrors { field message } }
}`
export const MENUS = `query CatalogImportMenus($query: String!) { menus(first: 5, query: $query) { nodes { id handle } } }`
export const STAGED_UPLOAD = `mutation CatalogImportUpload($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) { stagedTargets { url parameters { name value } } userErrors { field message } }
}`
export const BULK_RUN = `mutation CatalogImportBulk($mutation: String!, $path: String!, $identifier: String!) {
  bulkOperationRunMutation(mutation: $mutation, stagedUploadPath: $path, clientIdentifier: $identifier) {
    bulkOperation { id status } userErrors { field message }
  }
}`
export const BULK_STATUS = `query CatalogImportBulkStatus($id: ID!) {
  node(id: $id) { ... on BulkOperation { id status url partialDataUrl errorCode } }
}`
export const BULK_RECENT = `query CatalogImportBulkRecent { bulkOperations(first: 50) { nodes { id status query } } }`
export const VERIFY_PRODUCT = `query CatalogImportVerify($id: ID!) {
  product(id: $id) { id handle tags status variantsCount { count } metafield(namespace: "imagen_catalog", key: "source_id") { value } media(first: 250) { nodes { id status ... on MediaImage { originalSource { url } } } pageInfo { hasNextPage } } collections(first: 250) { nodes { id } pageInfo { hasNextPage } } }
}`

export const DESCRIPTION_UPDATE = `mutation CatalogImportDescription($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id } userErrors { field message } }
}`
export const MEDIA_RETRY = `mutation CatalogImportMediaRetry($files: [FileUpdateInput!]!) {
  fileUpdate(files: $files) { files { id fileStatus } userErrors { field message } }
}`
