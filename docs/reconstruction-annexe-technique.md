# Annexe technique — inventaire de reconstruction

Établi le 9 octobre 2026 à partir du code local. Cet inventaire complète [la spécification fonctionnelle](specification-reconstruction.md). Il décrit des contrats présents dans le dépôt, sans confirmer leur état sur un déploiement.

Le fichier [JSON associé](reconstruction-inventaire.json) contient le texte des validateurs des arguments, les champs développés des objets partagés, les retours explicitement validés, les index et les références frontend. Les types `v.*` sont ceux du schéma actuel ; ils peuvent être traduits en schéma SQL, Pydantic ou validation Node. `v.optional` signifie facultatif ; `v.null` autorise null ; `v.id` exprime une relation. Les champs `_id` et `_creationTime` sont ajoutés par Convex. Les `v.any()` signalent une forme non définie par ce seul schéma. Les validateurs nommés renvoient à leurs définitions ou sources ; resolvedValidator développe les alias directs, sans évaluer tout le code TypeScript.

Inventaire : **39 tables métier et 651 champs**, **121 fonctions directement enregistrées publiques**, **201 fonctions directement enregistrées internes**. Six tables Auth injectées dans le schéma principal et deux workflows enregistrés via `workflow.define` s'ajoutent ; ils sont identifiés ci-dessous et dans le JSON. Ces nombres excluent les helpers ordinaires, tests et code généré.

Les [schémas UML par fonctionnalité](reconstruction-uml.md) complètent cet inventaire par les parcours, états et relations ; ils se trouvent également auprès de leur description dans la spécification.

## 1. Tables et champs

### users

Source : [convex/schema.ts:250](../convex/schema.ts#L250).

| Champ | Validation actuelle |
| --- | --- |
| `name` | `v.optional(v.string())` |
| `image` | `v.optional(v.string())` |
| `email` | `v.optional(v.string())` |
| `emailVerificationTime` | `v.optional(v.number())` |
| `phone` | `v.optional(v.string())` |
| `phoneVerificationTime` | `v.optional(v.number())` |
| `isAnonymous` | `v.optional(v.boolean())` |
| `role` | `v.optional(v.string())` |
| `approvalStatus` | `v.optional( v.union( v.literal("pending"), v.literal("approved"), v.literal("rejected"), ), )` |
| `approvalUpdatedAt` | `v.optional(v.number())` |
| `activeShopId` | `v.optional(v.union(v.id("shops"), v.null()))` |
| `createdAt` | `v.optional(v.number())` |
| `updatedAt` | `v.optional(v.number())` |

Index :

- `index("email", ["email"])`
- `index("phone", ["phone"])`
- `index("by_approval_status", ["approvalStatus"])`

### shops

Source : [convex/schema.ts:274](../convex/schema.ts#L274).

| Champ | Validation actuelle |
| --- | --- |
| `domain` | `v.string()` |
| `name` | `v.optional(v.union(v.string(), v.null()))` |
| `clientId` | `v.optional(v.union(v.string(), v.null()))` |
| `clientSecret` | `v.optional(v.union(v.string(), v.null()))` |
| `accessToken` | `v.optional(v.union(v.string(), v.null()))` |
| `accessTokenScopes` | `v.optional(v.array(v.string()))` |
| `accessTokenUpdatedAt` | `v.optional(v.number())` |
| `productQuery` | `v.optional(v.union(v.string(), v.null()))` |
| `createdByUserId` | `v.id("users")` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_domain", ["domain"])`
- `index("by_created_by_user", ["createdByUserId"])`
- `index("by_created_by_user_and_domain", ["createdByUserId", "domain"])`

### shopifyOauthAttempts

Source : [convex/schema.ts:290](../convex/schema.ts#L290).

| Champ | Validation actuelle |
| --- | --- |
| `stateHash` | `v.string()` |
| `shopId` | `v.id("shops")` |
| `userId` | `v.id("users")` |
| `shopDomain` | `v.string()` |
| `createdAt` | `v.number()` |
| `expiresAt` | `v.number()` |

Index :

- `index("by_state_hash", ["stateHash"])`
- `index("by_expires_at", ["expiresAt"])`

### products

Source : [convex/schema.ts:300](../convex/schema.ts#L300).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `shopifyProductId` | `v.string()` |
| `title` | `v.string()` |
| `handle` | `v.string()` |
| `vendor` | `v.optional(v.union(v.string(), v.null()))` |
| `productType` | `v.optional(v.union(v.string(), v.null()))` |
| `shopifyStatus` | `v.optional(v.union(v.string(), v.null()))` |
| `tags` | `v.array(v.string())` |
| `collections` | `v.array(v.any())` |
| `options` | `v.array(v.any())` |
| `variants` | `v.array(v.any())` |
| `metafields` | `v.array(v.any())` |
| `googleProductCategory` | `v.optional(v.union(v.string(), v.null()))` |
| `googleProductCategoryDigest` | `v.optional(v.union(v.string(), v.null()))` |
| `featuredImageUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `currentShopifyImages` | `v.array(v.any())` |
| `shopifyImageCount` | `v.optional(v.number())` |
| `generationStatus` | `generationStatus` |
| `generationState` | `v.optional(productGenerationState)` |
| `reviewState` | `v.optional(productReviewState)` |
| `publishState` | `v.optional(productPublishState)` |
| `primaryAction` | `v.optional(productPrimaryAction)` |
| `generatedImageCount` | `v.optional(v.number())` |
| `failedImageCount` | `v.optional(v.number())` |
| `publishedImageCount` | `v.optional(v.number())` |
| `publishableImageCount` | `v.optional(v.number())` |
| `pendingReviewCount` | `v.optional(v.number())` |
| `approvedImageCount` | `v.optional(v.number())` |
| `rejectedImageCount` | `v.optional(v.number())` |
| `latestJobId` | `v.optional(v.union(v.id("generationJobs"), v.null()))` |
| `vibe` | `v.optional(v.union(v.string(), v.null()))` |
| `vibeCostUsd` | `v.optional(v.number())` |
| `vibeAnalyzedAt` | `v.optional(v.number())` |
| `lastSyncedAt` | `v.optional(v.number())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_shop", ["shopId"])`
- `index("by_shop_and_shopify_product_id", ["shopId", "shopifyProductId"])`
- `index("by_shop_and_handle", ["shopId", "handle"])`
- `index("by_shop_and_created", ["shopId", "createdAt"])`
- `index("by_shop_and_generation_status", ["shopId", "generationStatus"])`
- `index("by_shop_and_generation_state", ["shopId", "generationState"])`
- `index("by_shop_and_review_state", ["shopId", "reviewState"])`
- `index("by_shop_and_publish_state", ["shopId", "publishState"])`
- `index("by_shop_and_primary_action", ["shopId", "primaryAction"])`
- `index("by_shop_and_product_type", ["shopId", "productType"])`
- `index("by_shop_and_vibe_cost_usd", ["shopId", "vibeCostUsd"])`
- `index("by_shop_and_shopify_status", ["shopId", "shopifyStatus"])`
- `index("by_shop_and_generation_status_and_product_type", [ "shopId", "generationStatus", "productType", ])`
- `index("by_shop_and_primary_action_and_product_type", [ "shopId", "primaryAction", "productType", ])`
- `index("by_shopify_product_id", ["shopifyProductId"])`
- `index("by_handle", ["handle"])`
- `index("by_created", ["createdAt"])`
- `index("by_generation_status", ["generationStatus"])`
- `index("by_generation_state", ["generationState"])`
- `index("by_review_state", ["reviewState"])`
- `index("by_publish_state", ["publishState"])`
- `index("by_primary_action", ["primaryAction"])`
- `index("by_product_type", ["productType"])`
- `index("by_shopify_status", ["shopifyStatus"])`
- `index("by_generation_status_and_product_type", [ "generationStatus", "productType", ])`
- `index("by_primary_action_and_product_type", [ "primaryAction", "productType", ])`
- `searchIndex("search_products", { searchField: "title", filterFields: ["shopId", "generationStatus"], })`

### productVariants

Source : [convex/schema.ts:382](../convex/schema.ts#L382).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `productId` | `v.id("products")` |
| `shopifyVariantId` | `v.string()` |
| `title` | `v.string()` |
| `sku` | `v.string()` |
| `selectedOptions` | `v.array(v.object({ name: v.string(), value: v.string() }))` |
| `gender` | `v.optional(v.union(v.string(), v.null()))` |
| `genderDigest` | `v.optional(v.union(v.string(), v.null()))` |
| `ageGroup` | `v.optional(v.union(v.string(), v.null()))` |
| `ageGroupDigest` | `v.optional(v.union(v.string(), v.null()))` |
| `lastSyncedAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_shop_and_shopify_variant_id", ["shopId", "shopifyVariantId"])`
- `index("by_shop_and_product_id", ["shopId", "productId"])`
- `index("by_product_id", ["productId"])`

### googleFeedConfigs

Source : [convex/schema.ts:399](../convex/schema.ts#L399).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `status` | `v.union( v.literal("ready"), v.literal("partial"), v.literal("blocked"), )` |
| `googleAppStatus` | `v.literal("unverified")` |
| `attributes` | `v.array( v.object({ attribute: googleFeedAttribute, status: v.union( v.literal("ready"), v.literal("missing"), v.literal("ambiguous"), v.literal("incompatible"), ), coordinate: v.union(googleFeedCoordinate, v.null()), message: v.string(), }), )` |
| `checkedAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_shop_id", ["shopId"])`

### googleFeedRules

Source : [convex/schema.ts:423](../convex/schema.ts#L423).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `createdByUserId` | `v.id("users")` |
| `name` | `v.string()` |
| `active` | `v.boolean()` |
| `priority` | `v.number()` |
| `target` | `v.union(v.literal("product"), v.literal("variant"))` |
| `attribute` | `googleFeedAttribute` |
| `conditionMode` | `v.union(v.literal("and"), v.literal("or"))` |
| `conditions` | `v.array(googleFeedCondition)` |
| `value` | `v.string()` |
| `overwritePolicy` | `v.union( v.literal("only_if_empty"), v.literal("replace_existing"), )` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_shop_id_and_priority", ["shopId", "priority"])`
- `index("by_shop_id_and_updated_at", ["shopId", "updatedAt"])`

### googleFeedDrafts

Source : [convex/schema.ts:443](../convex/schema.ts#L443).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `createdByUserId` | `v.id("users")` |
| `productId` | `v.id("products")` |
| `variantId` | `v.optional(v.union(v.id("productVariants"), v.null()))` |
| `ownerId` | `v.string()` |
| `ownerType` | `googleFeedOwnerType` |
| `attribute` | `googleFeedAttribute` |
| `currentValue` | `v.union(v.string(), v.null())` |
| `currentDigest` | `v.optional(v.union(v.string(), v.null()))` |
| `proposedValue` | `v.string()` |
| `sourceKind` | `v.union(v.literal("manual"), v.literal("rule"))` |
| `sourceRuleId` | `v.optional(v.union(v.id("googleFeedRules"), v.null()))` |
| `sourceLabel` | `v.string()` |
| `matchingRuleIds` | `v.optional(v.array(v.id("googleFeedRules")))` |
| `status` | `v.union( v.literal("draft"), v.literal("conflict"), v.literal("invalid"), v.literal("publishing"), v.literal("confirmed"), v.literal("failed"), )` |
| `included` | `v.boolean()` |
| `error` | `v.optional(v.union(v.string(), v.null()))` |
| `lastRunId` | `v.optional(v.union(v.id("googleFeedRuns"), v.null()))` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_shop_id_and_owner_id_and_attribute", [ "shopId", "ownerId", "attribute", ])`
- `index("by_shop_id_and_updated_at", ["shopId", "updatedAt"])`
- `index("by_shop_id_and_status", ["shopId", "status"])`
- `index("by_product_id", ["productId"])`
- `index("by_variant_id", ["variantId"])`

### googleFeedRuns

Source : [convex/schema.ts:481](../convex/schema.ts#L481).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `createdByUserId` | `v.id("users")` |
| `kind` | `v.union(v.literal("evaluation"), v.literal("publication"))` |
| `status` | `v.union( v.literal("running"), v.literal("completed"), v.literal("partial"), v.literal("failed"), )` |
| `source` | `v.union(v.literal("manual"), v.literal("rules"), v.literal("retry"))` |
| `totalItems` | `v.number()` |
| `succeededItems` | `v.number()` |
| `skippedItems` | `v.number()` |
| `failedItems` | `v.number()` |
| `conflictItems` | `v.number()` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |
| `completedAt` | `v.optional(v.number())` |

Index :

- `index("by_shop_id_and_created_at", ["shopId", "createdAt"])`

### googleFeedRunItems

Source : [convex/schema.ts:501](../convex/schema.ts#L501).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `runId` | `v.id("googleFeedRuns")` |
| `draftId` | `v.optional(v.union(v.id("googleFeedDrafts"), v.null()))` |
| `productId` | `v.id("products")` |
| `variantId` | `v.optional(v.union(v.id("productVariants"), v.null()))` |
| `ownerId` | `v.string()` |
| `ownerType` | `googleFeedOwnerType` |
| `attribute` | `googleFeedAttribute` |
| `oldValue` | `v.union(v.string(), v.null())` |
| `newValue` | `v.string()` |
| `sourceLabel` | `v.string()` |
| `status` | `v.union( v.literal("ready"), v.literal("confirmed"), v.literal("skipped"), v.literal("conflict"), v.literal("failed"), )` |
| `error` | `v.optional(v.union(v.string(), v.null()))` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_run_id", ["runId"])`
- `index("by_shop_id_and_run_id", ["shopId", "runId"])`

### visualGroupConfigs

Source : [convex/schema.ts:526](../convex/schema.ts#L526).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `productId` | `v.id("products")` |
| `optionNames` | `v.array(v.string())` |
| `publishMode` | `visualPublishMode` |
| `analysisStatus` | `visualAnalysisStatus` |
| `analysisModel` | `v.optional(v.union(v.string(), v.null()))` |
| `analysisCostUsd` | `v.optional(v.number())` |
| `analysisError` | `v.optional(v.union(v.string(), v.null()))` |
| `lastAnalyzedAt` | `v.optional(v.union(v.number(), v.null()))` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_product", ["productId"])`
- `index("by_shop_and_product", ["shopId", "productId"])`

### visualGroups

Source : [convex/schema.ts:541](../convex/schema.ts#L541).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `configId` | `v.id("visualGroupConfigs")` |
| `productId` | `v.id("products")` |
| `key` | `v.string()` |
| `label` | `v.string()` |
| `optionValues` | `v.array( v.object({ name: v.string(), value: v.string(), }), )` |
| `swatchCss` | `v.optional(v.union(v.string(), v.null()))` |
| `position` | `v.number()` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_config", ["configId"])`
- `index("by_config_and_position", ["configId", "position"])`
- `index("by_product", ["productId"])`
- `index("by_shop_and_product", ["shopId", "productId"])`

### visualGroupVariants

Source : [convex/schema.ts:562](../convex/schema.ts#L562).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `configId` | `v.id("visualGroupConfigs")` |
| `groupId` | `v.id("visualGroups")` |
| `productId` | `v.id("products")` |
| `shopifyVariantId` | `v.string()` |
| `title` | `v.string()` |
| `selectedOptions` | `v.array( v.object({ name: v.string(), value: v.string(), }), )` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_config", ["configId"])`
- `index("by_group", ["groupId"])`
- `index("by_product", ["productId"])`
- `index("by_shop_and_shopify_variant_id", [ "shopId", "shopifyVariantId", ])`

### visualGroupReferences

Source : [convex/schema.ts:585](../convex/schema.ts#L585).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `configId` | `v.id("visualGroupConfigs")` |
| `productId` | `v.id("products")` |
| `groupId` | `v.optional(v.union(v.id("visualGroups"), v.null()))` |
| `mediaId` | `v.optional(v.union(v.string(), v.null()))` |
| `sourceUrl` | `v.string()` |
| `referenceUrl` | `v.string()` |
| `altText` | `v.optional(v.union(v.string(), v.null()))` |
| `assignmentSource` | `visualReferenceSource` |
| `confidence` | `v.number()` |
| `confirmed` | `v.boolean()` |
| `crop` | `v.optional( v.object({ x: v.number(), y: v.number(), width: v.number(), height: v.number(), }), )` |
| `sourceReferenceId` | `v.optional(v.id("visualGroupReferences"))` |
| `position` | `v.number()` |
| `groupPosition` | `v.optional(v.number())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_config", ["configId"])`
- `index("by_group", ["groupId"])`
- `index("by_product", ["productId"])`
- `index("by_product_and_media_id", ["productId", "mediaId"])`

### visualProductFamilies

Source : [convex/schema.ts:615](../convex/schema.ts#L615).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `sourceProductId` | `v.id("products")` |
| `sourceShopifyProductId` | `v.string()` |
| `configId` | `v.id("visualGroupConfigs")` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_source_product", ["sourceProductId"])`
- `index("by_shop_and_source_product", ["shopId", "sourceProductId"])`

### visualProductFamilyMembers

Source : [convex/schema.ts:625](../convex/schema.ts#L625).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.id("shops")` |
| `familyId` | `v.id("visualProductFamilies")` |
| `groupId` | `v.id("visualGroups")` |
| `shopifyProductId` | `v.string()` |
| `title` | `v.string()` |
| `handle` | `v.optional(v.union(v.string(), v.null()))` |
| `swatchCss` | `v.optional(v.union(v.string(), v.null()))` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_family", ["familyId"])`
- `index("by_group", ["groupId"])`
- `index("by_shop_and_shopify_product_id", [ "shopId", "shopifyProductId", ])`

### promptTemplates

Source : [convex/schema.ts:642](../convex/schema.ts#L642).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `imageType` | `v.string()` |
| `label` | `v.string()` |
| `content` | `v.string()` |
| `condition` | `v.optional(promptConditionValidator)` |
| `alternativeContent` | `v.optional(v.string())` |
| `defaultContent` | `v.string()` |
| `isActive` | `v.boolean()` |
| `isPreset` | `v.optional(v.boolean())` |
| `position` | `v.optional(v.number())` |
| `useVibeAnalysis` | `v.optional(v.boolean())` |
| `referenceImageCount` | `v.optional(v.number())` |
| `promptKind` | `v.optional(promptKind)` |
| `removeBackground` | `v.optional(v.boolean())` |
| `backgroundRemovalProvider` | `v.optional(backgroundRemovalProvider)` |
| `backgroundMode` | `v.optional(backgroundMode)` |
| `backgroundColor` | `v.optional(v.string())` |
| `backgroundShadow` | `v.optional(v.boolean())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_image_type", ["imageType"])`
- `index("by_shop_and_image_type", ["shopId", "imageType"])`
- `index("by_shop_and_position", ["shopId", "position"])`

### promptSettings

Source : [convex/schema.ts:671](../convex/schema.ts#L671).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `masterPrompt` | `v.string()` |
| `defaultMasterPrompt` | `v.optional(v.string())` |
| `modelReferences` | `v.optional(v.record(v.string(), modelReference))` |
| `modelReferenceUrls` | `v.optional(v.record(v.string(), v.string()))` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_shop", ["shopId"])`

### generationJobs

Source : [convex/schema.ts:681](../convex/schema.ts#L681).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `status` | `jobStatus` |
| `mode` | `v.union(v.literal("single"), v.literal("bulk"))` |
| `executionMode` | `v.optional( v.union(v.literal("realtime"), v.literal("batch")), )` |
| `batchId` | `v.optional(v.union(v.string(), v.null()))` |
| `previousBatchIds` | `v.optional(v.array(v.string()))` |
| `batchStatus` | `v.optional(v.union(v.string(), v.null()))` |
| `batchInputFileName` | `v.optional(v.union(v.string(), v.null()))` |
| `batchIngestionStartedAt` | `v.optional(v.union(v.number(), v.null()))` |
| `batchResultOffset` | `v.optional(v.number())` |
| `batchResultFileIndex` | `v.optional(v.number())` |
| `openAiDurable` | `v.optional(v.boolean())` |
| `openAiBatchSize` | `v.optional(v.number())` |
| `openAiBatchConcurrency` | `v.optional(v.number())` |
| `batchSubmitStartedAt` | `v.optional(v.number())` |
| `allBatchesSubmittedAt` | `v.optional(v.number())` |
| `firstResultReadyAt` | `v.optional(v.number())` |
| `firstImageStoredAt` | `v.optional(v.number())` |
| `vibeAnalysis` | `v.optional(v.boolean())` |
| `imageProvider` | `v.optional( v.union(v.literal("openai"), v.literal("gemini")), )` |
| `imageModel` | `v.optional(v.string())` |
| `productIds` | `v.array(v.id("products"))` |
| `selectedImageTypes` | `v.array(v.string())` |
| `variantSelection` | `v.optional(variantSelectionValidator)` |
| `forceRegenerate` | `v.boolean()` |
| `totalTasks` | `v.number()` |
| `completedTasks` | `v.number()` |
| `failedTasks` | `v.number()` |
| `generationCost` | `v.optional(v.number())` |
| `inputTokens` | `v.optional(v.number())` |
| `outputTokens` | `v.optional(v.number())` |
| `pricedImageCount` | `v.optional(v.number())` |
| `reviewTotal` | `v.optional(v.number())` |
| `reviewPending` | `v.optional(v.number())` |
| `reviewApproved` | `v.optional(v.number())` |
| `reviewRejected` | `v.optional(v.number())` |
| `error` | `v.optional(v.union(v.string(), v.null()))` |
| `isHidden` | `v.optional(v.boolean())` |
| `archivedAt` | `v.optional(v.number())` |
| `archivedByUserId` | `v.optional(v.id("users"))` |
| `deletedAt` | `v.optional(v.number())` |
| `deletedByUserId` | `v.optional(v.id("users"))` |
| `createdByUserId` | `v.optional(v.id("users"))` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |
| `startedAt` | `v.optional(v.number())` |
| `completedAt` | `v.optional(v.number())` |

Index :

- `index("by_status", ["status"])`
- `index("by_provider_and_execution_and_status", ["imageProvider", "executionMode", "status"])`
- `index("by_open_ai_durable_and_status", ["openAiDurable", "status"])`
- `index("by_created", ["createdAt"])`
- `index("by_shop_and_status", ["shopId", "status"])`
- `index("by_shop_and_created", ["shopId", "createdAt"])`

### generationBatchSegments

Source : [convex/schema.ts:743](../convex/schema.ts#L743).

| Champ | Validation actuelle |
| --- | --- |
| `jobId` | `v.id("generationJobs")` |
| `provider` | `v.union(v.literal("openai"), v.literal("gemini"))` |
| `batchId` | `v.optional(v.union(v.string(), v.null()))` |
| `inputFileName` | `v.optional(v.union(v.string(), v.null()))` |
| `batchStatus` | `v.optional(v.union(v.string(), v.null()))` |
| `status` | `batchSegmentStatus` |
| `phase` | `v.optional(v.union( v.literal("preparing"), v.literal("uploading"), v.literal("submitting"), v.literal("uncertain"), v.literal("waiting"), v.literal("recovering"), v.literal("completed"), v.literal("failed"), ))` |
| `workflowId` | `v.optional(v.string())` |
| `submissionKey` | `v.optional(v.string())` |
| `submissionAttemptedAt` | `v.optional(v.number())` |
| `submissionRejected` | `v.optional(v.boolean())` |
| `submissionRecovery` | `v.optional(v.object({ checkedAt: v.number(), replacementSegmentId: v.id("generationBatchSegments"), }))` |
| `cancellationReconciled` | `v.optional(v.boolean())` |
| `cancellationPending` | `v.optional(v.boolean())` |
| `reconcileCursor` | `v.optional(v.union(v.string(), v.null()))` |
| `reconcileMatches` | `v.optional(v.array(v.string()))` |
| `preparedTasks` | `v.optional(v.number())` |
| `leaseToken` | `v.optional(v.string())` |
| `leaseUntil` | `v.optional(v.number())` |
| `outputFileId` | `v.optional(v.union(v.string(), v.null()))` |
| `errorFileId` | `v.optional(v.union(v.string(), v.null()))` |
| `resultFileIndex` | `v.optional(v.number())` |
| `stepFailures` | `v.optional(v.number())` |
| `imageCount` | `v.number()` |
| `ingestedCount` | `v.optional(v.number())` |
| `failedCount` | `v.optional(v.number())` |
| `resultOffset` | `v.optional(v.number())` |
| `ingestionStartedAt` | `v.optional(v.union(v.number(), v.null()))` |
| `submittedAt` | `v.optional(v.number())` |
| `providerDoneAt` | `v.optional(v.number())` |
| `ingestionCompletedAt` | `v.optional(v.number())` |
| `error` | `v.optional(v.union(v.string(), v.null()))` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_job", ["jobId"])`
- `index("by_status", ["status"])`
- `index("by_job_and_status", ["jobId", "status"])`
- `index("by_batch_id", ["batchId"])`
- `index("by_provider_and_status", ["provider", "status"])`
- `index("by_cancellation_pending", ["cancellationPending"])`

### openAiBatchReferences

Source : [convex/schema.ts:794](../convex/schema.ts#L794).

| Champ | Validation actuelle |
| --- | --- |
| `jobId` | `v.id("generationJobs")` |
| `productId` | `v.id("products")` |
| `sourceUrl` | `v.string()` |
| `url` | `v.optional(v.string())` |
| `leaseToken` | `v.optional(v.string())` |
| `leaseUntil` | `v.optional(v.number())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_job_and_product_and_source", ["jobId", "productId", "sourceUrl"])`
- `index("by_job", ["jobId"])`

### generatedImages

Source : [convex/schema.ts:806](../convex/schema.ts#L806).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `productId` | `v.id("products")` |
| `jobId` | `v.id("generationJobs")` |
| `visualGroupId` | `v.optional(v.union(v.id("visualGroups"), v.null()))` |
| `visualGroupKey` | `v.optional(v.union(v.string(), v.null()))` |
| `visualGroupLabel` | `v.optional(v.union(v.string(), v.null()))` |
| `imageType` | `v.string()` |
| `generationTarget` | `v.optional(generationTargetValidator)` |
| `promptBranch` | `v.optional(promptBranchValidator)` |
| `imageProvider` | `v.optional( v.union(v.literal("openai"), v.literal("gemini")), )` |
| `imageModel` | `v.optional(v.string())` |
| `promptUsed` | `v.string()` |
| `finalPromptUsed` | `v.optional(v.string())` |
| `openAiPrepared` | `v.optional(v.boolean())` |
| `batchRecoveryPending` | `v.optional(v.boolean())` |
| `stagedReferenceUrls` | `v.optional(v.array(v.string()))` |
| `promptKind` | `v.optional(promptKind)` |
| `useVibeAnalysis` | `v.optional(v.boolean())` |
| `vibeUsed` | `v.optional(v.union(v.string(), v.null()))` |
| `referenceImageCount` | `v.optional(v.number())` |
| `sourceImageUrls` | `v.optional(v.array(v.string()))` |
| `sourceImageUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `sourceImageUrl2` | `v.optional(v.union(v.string(), v.null()))` |
| `modelReferenceKey` | `v.optional(v.union(v.string(), v.null()))` |
| `modelReferenceStorageId` | `v.optional(v.union(v.id("_storage"), v.null()))` |
| `modelReferenceUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `generatedImageUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `storageUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `retrySourceImageId` | `v.optional(v.union(v.id("generatedImages"), v.null()))` |
| `activeRetryImageId` | `v.optional(v.union(v.id("generatedImages"), v.null()))` |
| `retryError` | `v.optional(v.union(v.string(), v.null()))` |
| `retouchSourceImageId` | `v.optional( v.union(v.id("generatedImages"), v.null()), )` |
| `retouchTool` | `v.optional(v.union(v.literal("manual_brush"), v.null()))` |
| `retouchedAt` | `v.optional(v.number())` |
| `retouchedByUserId` | `v.optional(v.id("users"))` |
| `backgroundRemovalInputUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `backgroundRemovalInputContentType` | `v.optional( v.union(v.string(), v.null()), )` |
| `backgroundRemovalInputExtension` | `v.optional(v.union(v.string(), v.null()))` |
| `postProcessingInputUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `postProcessingInputContentType` | `v.optional( v.union(v.string(), v.null()), )` |
| `postProcessingInputExtension` | `v.optional(v.union(v.string(), v.null()))` |
| `postProcessingStartedAt` | `v.optional(v.union(v.number(), v.null()))` |
| `transparentCutoutUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `batchSegmentId` | `v.optional( v.union(v.id("generationBatchSegments"), v.string(), v.null()), )` |
| `providerBatchId` | `v.optional(v.union(v.string(), v.null()))` |
| `providerRequestId` | `v.optional(v.union(v.string(), v.null()))` |
| `providerResponseId` | `v.optional(v.union(v.string(), v.null()))` |
| `removeBackground` | `v.optional(v.boolean())` |
| `backgroundRemovalProvider` | `v.optional(backgroundRemovalProvider)` |
| `backgroundMode` | `v.optional(backgroundMode)` |
| `backgroundColor` | `v.optional(v.string())` |
| `backgroundShadow` | `v.optional(v.boolean())` |
| `backgroundRemovalCostUsd` | `v.optional(v.number())` |
| `backgroundRemovalRequestId` | `v.optional(v.union(v.string(), v.null()))` |
| `status` | `imageStatus` |
| `reviewStatus` | `v.optional(reviewStatus)` |
| `reviewedAt` | `v.optional(v.number())` |
| `reviewedByUserId` | `v.optional(v.id("users"))` |
| `shopifyMediaId` | `v.optional(v.union(v.string(), v.null()))` |
| `pushRunId` | `v.optional(v.id("imagePublishRuns"))` |
| `pushError` | `v.optional(v.string())` |
| `publishedShopifyProductId` | `v.optional(v.union(v.string(), v.null()))` |
| `error` | `v.optional(v.union(v.string(), v.null()))` |
| `inputTokens` | `v.optional(v.number())` |
| `outputTokens` | `v.optional(v.number())` |
| `costUsd` | `v.optional(v.number())` |
| `costRateMultiplier` | `v.optional(v.number())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_product", ["productId"])`
- `index("by_job", ["jobId"])`
- `index("by_status", ["status"])`
- `index("by_job_and_status", ["jobId", "status"])`
- `index("by_job_and_status_and_segment", ["jobId", "status", "batchSegmentId"])`
- `index("by_retry_source", ["retrySourceImageId"])`
- `index("by_provider_batch_id", ["providerBatchId"])`
- `index("by_batch_segment", ["batchSegmentId"])`
- `index("by_review_status_and_reviewed_at", ["reviewStatus", "reviewedAt"])`
- `index("by_shop_and_product", ["shopId", "productId"])`
- `index("by_shop_and_job", ["shopId", "jobId"])`
- `index("by_shop_and_status", ["shopId", "status"])`

### bulkTransformJobs

Source : [convex/schema.ts:901](../convex/schema.ts#L901).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `createdByUserId` | `v.id("users")` |
| `operation` | `bulkTransformOperation` |
| `status` | `bulkTransformJobStatus` |
| `productIds` | `v.array(v.id("products"))` |
| `selectedImagePositions` | `v.optional(v.array(v.number()))` |
| `selectionProductHashes` | `v.optional(v.array(v.string()))` |
| `productLocksInitializedAt` | `v.optional(v.number())` |
| `seededProductCount` | `v.number()` |
| `seedAttempts` | `v.number()` |
| `seedFailedProducts` | `v.number()` |
| `seededItems` | `v.number()` |
| `totalItems` | `v.number()` |
| `transformedItems` | `v.number()` |
| `transformFailedItems` | `v.number()` |
| `publishedItems` | `v.number()` |
| `publishFailedItems` | `v.number()` |
| `conflictItems` | `v.number()` |
| `skippedItems` | `v.number()` |
| `unsupportedItems` | `v.number()` |
| `retryPhase` | `v.optional(bulkTransformRetryPhase)` |
| `error` | `v.optional(v.union(v.string(), v.null()))` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |
| `startedAt` | `v.optional(v.number())` |
| `readyAt` | `v.optional(v.number())` |
| `publishStartedAt` | `v.optional(v.number())` |
| `completedAt` | `v.optional(v.number())` |
| `dismissedAt` | `v.optional(v.number())` |
| `assetsCleanupStartedAt` | `v.optional(v.number())` |
| `assetsCleanedAt` | `v.optional(v.number())` |
| `rollbackStatus` | `v.optional(bulkTransformRollbackStatus)` |
| `rollbackTotalItems` | `v.optional(v.number())` |
| `rolledBackItems` | `v.optional(v.number())` |
| `rollbackFailedItems` | `v.optional(v.number())` |
| `rollbackConflictItems` | `v.optional(v.number())` |
| `rollbackRunNumber` | `v.optional(v.number())` |
| `rollbackStartedAt` | `v.optional(v.number())` |
| `rollbackCompletedAt` | `v.optional(v.number())` |

Index :

- `index("by_shop_and_status", ["shopId", "status"])`
- `index("by_shop_and_status_and_product_locks_initialized_at", [ "shopId", "status", "productLocksInitializedAt", ])`
- `index("by_shop_and_created_at", ["shopId", "createdAt"])`
- `index("by_status_and_updated_at", ["status", "updatedAt"])`
- `index("by_rollback_status_and_updated_at", ["rollbackStatus", "updatedAt"])`
- `index("by_status_and_assets_cleaned_at_and_completed_at", [ "status", "assetsCleanedAt", "completedAt", ])`
- `index("by_assets_cleaned_at_and_dismissed_at", [ "assetsCleanedAt", "dismissedAt", ])`
- `index("by_shop_and_dismissed_at", ["shopId", "dismissedAt"])`
- `index("by_created_by_user_and_dismissed_at", [ "createdByUserId", "dismissedAt", ])`

### bulkTransformProductLocks

Source : [convex/schema.ts:965](../convex/schema.ts#L965).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `productId` | `v.id("products")` |
| `jobId` | `v.id("bulkTransformJobs")` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_product", ["productId"])`
- `index("by_job", ["jobId"])`

### bulkTransformMediaLeases

Source : [convex/schema.ts:974](../convex/schema.ts#L974).

| Champ | Validation actuelle |
| --- | --- |
| `shopDomain` | `v.string()` |
| `sourceMediaId` | `v.string()` |
| `jobId` | `v.id("bulkTransformJobs")` |
| `itemId` | `v.id("bulkTransformItems")` |
| `leaseToken` | `v.string()` |
| `expiresAt` | `v.number()` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_shop_domain_and_source_media_id", [ "shopDomain", "sourceMediaId", ])`
- `index("by_job", ["jobId"])`
- `index("by_item", ["itemId"])`

### bulkTransformMediaPublicationHeads

Source : [convex/schema.ts:990](../convex/schema.ts#L990).

| Champ | Validation actuelle |
| --- | --- |
| `shopDomain` | `v.string()` |
| `sourceMediaId` | `v.string()` |
| `jobId` | `v.id("bulkTransformJobs")` |
| `itemId` | `v.id("bulkTransformItems")` |
| `publishedAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_shop_domain_and_source_media_id", [ "shopDomain", "sourceMediaId", ])`
- `index("by_item", ["itemId"])`

### bulkTransformMediaProductReferences

Source : [convex/schema.ts:1003](../convex/schema.ts#L1003).

| Champ | Validation actuelle |
| --- | --- |
| `shopDomain` | `v.string()` |
| `sourceMediaId` | `v.string()` |
| `productId` | `v.id("products")` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_shop_domain_and_source_media_id", [ "shopDomain", "sourceMediaId", ])`
- `index("by_shop_domain_and_source_media_id_and_product_id", [ "shopDomain", "sourceMediaId", "productId", ])`
- `index("by_product", ["productId"])`

### bulkTransformItems

Source : [convex/schema.ts:1020](../convex/schema.ts#L1020).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `jobId` | `v.id("bulkTransformJobs")` |
| `productId` | `v.id("products")` |
| `referencedProductIds` | `v.array(v.id("products"))` |
| `operation` | `bulkTransformOperation` |
| `sourceMediaId` | `v.string()` |
| `sourceUrl` | `v.string()` |
| `sourceAlt` | `v.optional(v.union(v.string(), v.null()))` |
| `sourcePosition` | `v.number()` |
| `sourceSha256` | `v.optional(v.union(v.string(), v.null()))` |
| `transformedSha256` | `v.optional(v.union(v.string(), v.null()))` |
| `sourceBackupUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `outputUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `publishedUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `status` | `bulkTransformItemStatus` |
| `error` | `v.optional(v.union(v.string(), v.null()))` |
| `attempts` | `v.number()` |
| `publishAttempts` | `v.number()` |
| `publishLeaseToken` | `v.optional(v.string())` |
| `publishRecoveryPending` | `v.optional(v.boolean())` |
| `publishAmbiguousSince` | `v.optional(v.number())` |
| `fileUpdateAcceptedAt` | `v.optional(v.number())` |
| `rollbackStatus` | `v.optional(bulkTransformItemRollbackStatus)` |
| `rollbackAttempts` | `v.optional(v.number())` |
| `rollbackAttemptCycle` | `v.optional(v.number())` |
| `rollbackLeaseToken` | `v.optional(v.string())` |
| `rollbackRecoveryPending` | `v.optional(v.boolean())` |
| `rollbackAmbiguousSince` | `v.optional(v.number())` |
| `rollbackFileUpdateAcceptedAt` | `v.optional(v.number())` |
| `rollbackError` | `v.optional(v.union(v.string(), v.null()))` |
| `rollbackStartedAt` | `v.optional(v.number())` |
| `rolledBackAt` | `v.optional(v.number())` |
| `rollbackResolvedUrl` | `v.optional(v.union(v.string(), v.null()))` |
| `rollbackResolvedSha256` | `v.optional(v.union(v.string(), v.null()))` |
| `processingStartedAt` | `v.optional(v.number())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_job", ["jobId"])`
- `index("by_job_and_status", ["jobId", "status"])`
- `index("by_job_and_rollback_status", ["jobId", "rollbackStatus"])`
- `index("by_job_status_and_rollback_status", [ "jobId", "status", "rollbackStatus", ])`
- `index("by_job_rollback_status_and_attempt_cycle", [ "jobId", "rollbackStatus", "rollbackAttemptCycle", ])`
- `index("by_job_rollback_recovery_and_ambiguous_since", [ "jobId", "rollbackStatus", "rollbackRecoveryPending", "rollbackAmbiguousSince", ])`
- `index("by_job_status_recovery_pending_ambiguous_since", [ "jobId", "status", "publishRecoveryPending", "publishAmbiguousSince", ])`
- `index("by_job_and_source_media_id", ["jobId", "sourceMediaId"])`
- `index("by_product_and_source_media_id", ["productId", "sourceMediaId"])`
- `index("by_status_and_updated_at", ["status", "updatedAt"])`
- `index("by_rollback_status_and_updated_at", [ "rollbackStatus", "updatedAt", ])`

### bulkTransformSeedFailures

Source : [convex/schema.ts:1091](../convex/schema.ts#L1091).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `jobId` | `v.id("bulkTransformJobs")` |
| `productId` | `v.id("products")` |
| `error` | `v.string()` |
| `attempts` | `v.number()` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_job", ["jobId"])`
- `index("by_job_and_product", ["jobId", "productId"])`

### bulkReorderJobs

Source : [convex/schema.ts:1102](../convex/schema.ts#L1102).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `createdByUserId` | `v.id("users")` |
| `status` | `bulkReorderJobStatus` |
| `firstPosition` | `v.number()` |
| `secondPosition` | `v.number()` |
| `productCount` | `v.number()` |
| `totalItems` | `v.number()` |
| `processedItems` | `v.number()` |
| `completedItems` | `v.number()` |
| `skippedItems` | `v.number()` |
| `failedItems` | `v.number()` |
| `conflictItems` | `v.number()` |
| `lockedItems` | `v.number()` |
| `unavailableItems` | `v.number()` |
| `error` | `v.optional(v.union(v.string(), v.null()))` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |
| `startedAt` | `v.optional(v.number())` |
| `completedAt` | `v.optional(v.number())` |
| `dismissedAt` | `v.optional(v.number())` |
| `restoreStatus` | `v.optional(bulkReorderRestoreStatus)` |
| `restoreTotalItems` | `v.optional(v.number())` |
| `restoredItems` | `v.optional(v.number())` |
| `restoreFailedItems` | `v.optional(v.number())` |
| `restoreConflictItems` | `v.optional(v.number())` |
| `restoreStartedAt` | `v.optional(v.number())` |
| `restoreCompletedAt` | `v.optional(v.number())` |

Index :

- `index("by_shop_and_status", ["shopId", "status"])`
- `index("by_shop_and_created_at", ["shopId", "createdAt"])`
- `index("by_shop_and_dismissed_at", ["shopId", "dismissedAt"])`
- `index("by_status_and_updated_at", ["status", "updatedAt"])`
- `index("by_restore_status_and_updated_at", ["restoreStatus", "updatedAt"])`

### bulkReorderItems

Source : [convex/schema.ts:1136](../convex/schema.ts#L1136).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `jobId` | `v.id("bulkReorderJobs")` |
| `productId` | `v.id("products")` |
| `productTitle` | `v.string()` |
| `shopifyProductId` | `v.string()` |
| `status` | `bulkReorderItemStatus` |
| `sourceImageIds` | `v.optional(v.array(v.string()))` |
| `targetImageIds` | `v.optional(v.array(v.string()))` |
| `shopifyJobId` | `v.optional(v.string())` |
| `attempts` | `v.number()` |
| `availableAt` | `v.number()` |
| `error` | `v.optional(v.union(v.string(), v.null()))` |
| `processingStartedAt` | `v.optional(v.number())` |
| `completedAt` | `v.optional(v.number())` |
| `restoreStatus` | `v.optional(bulkReorderItemRestoreStatus)` |
| `restoreShopifyJobId` | `v.optional(v.string())` |
| `restoreAttempts` | `v.optional(v.number())` |
| `restoreAvailableAt` | `v.optional(v.number())` |
| `restoreError` | `v.optional(v.union(v.string(), v.null()))` |
| `restoreProcessingStartedAt` | `v.optional(v.number())` |
| `restoredAt` | `v.optional(v.number())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_job", ["jobId"])`
- `index("by_job_and_status", ["jobId", "status"])`
- `index("by_job_and_status_and_available_at", [ "jobId", "status", "availableAt", ])`
- `index("by_job_and_restore_status", ["jobId", "restoreStatus"])`
- `index("by_job_and_restore_status_and_restore_available_at", [ "jobId", "restoreStatus", "restoreAvailableAt", ])`
- `index("by_status_and_updated_at", ["status", "updatedAt"])`
- `index("by_restore_status_and_updated_at", ["restoreStatus", "updatedAt"])`

### bulkReorderProductLocks

Source : [convex/schema.ts:1176](../convex/schema.ts#L1176).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `productId` | `v.id("products")` |
| `jobId` | `v.id("bulkReorderJobs")` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_product", ["productId"])`
- `index("by_job", ["jobId"])`

### appSettings

Source : [convex/schema.ts:1185](../convex/schema.ts#L1185).

| Champ | Validation actuelle |
| --- | --- |
| `shopId` | `v.optional(v.id("shops"))` |
| `key` | `v.string()` |
| `value` | `v.any()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_key", ["key"])`
- `index("by_shop_and_key", ["shopId", "key"])`

### catalogues

Source : [convex/catalogue/schema.ts:4](../convex/catalogue/schema.ts#L4).

| Champ | Validation actuelle |
| --- | --- |
| `ownerId` | `v.id("users")` |
| `origin` | `v.string()` |
| `mode` | `v.union(v.literal("ALL"), v.literal("TOP_N"))` |
| `topN` | `v.optional(v.number())` |
| `status` | `v.union( v.literal("working"), v.literal("tags"), v.literal("ready"), v.literal("partial"), v.literal("blocked"), )` |
| `phase` | `v.string()` |
| `structure` | `v.string()` |
| `work` | `v.optional(v.string())` |
| `generation` | `v.number()` |
| `version` | `v.number()` |
| `lease` | `v.optional(v.string())` |
| `leaseUntil` | `v.optional(v.number())` |
| `error` | `v.optional(v.string())` |
| `resumeWork` | `v.optional(v.string())` |
| `total` | `v.number()` |
| `complete` | `v.number()` |
| `failed` | `v.number()` |
| `sourceCount` | `v.number()` |
| `initialCount` | `v.number()` |
| `exportVersion` | `v.optional(v.number())` |
| `exportKey` | `v.optional(v.string())` |
| `lastImport` | `v.optional(v.string())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |
| `rankedAt` | `v.optional(v.number())` |

Index :

- `index("by_owner", ["ownerId"])`
- `index("by_status", ["status"])`
- `index("by_origin_status", ["origin", "status"])`

### produits

Source : [convex/catalogue/schema.ts:40](../convex/catalogue/schema.ts#L40).

| Champ | Validation actuelle |
| --- | --- |
| `catalogueId` | `v.id("catalogues")` |
| `identity` | `v.string()` |
| `handle` | `v.string()` |
| `url` | `v.string()` |
| `selected` | `v.boolean()` |
| `collections` | `v.array(v.string())` |
| `group` | `v.string()` |
| `rank` | `v.optional(v.number())` |
| `title` | `v.string()` |
| `titleLower` | `v.string()` |
| `state` | `v.union( v.literal("pending"), v.literal("complete"), v.literal("failed"), )` |
| `attempts` | `v.number()` |
| `jsonSource` | `v.optional(v.string())` |
| `data` | `v.optional(v.string())` |
| `override` | `v.optional(v.string())` |
| `error` | `v.optional(v.string())` |
| `remote` | `v.optional(v.string())` |
| `inSitemap` | `v.boolean()` |
| `aliasOf` | `v.optional(v.id("produits"))` |

Index :

- `index("by_catalogue_handle", ["catalogueId", "handle"])`
- `index("by_catalogue_identity", ["catalogueId", "identity"])`
- `index("by_catalogue_rank", ["catalogueId", "selected", "rank"])`
- `index("by_catalogue_title", ["catalogueId", "selected", "titleLower"])`
- `index("by_catalogue_state", ["catalogueId", "selected", "state"])`
- `index("by_catalogue_group", [ "catalogueId", "selected", "group", "handle", ])`

### imagePublishRuns

Source : [convex/shopify/publicationSchema.ts:43](../convex/shopify/publicationSchema.ts#L43).

| Champ | Validation actuelle |
| --- | --- |
| `jobId` | `v.id("generationJobs")` |
| `shopId` | `v.optional(v.id("shops"))` |
| `shopDomain` | `v.string()` |
| `includeLegacy` | `v.boolean()` |
| `createdByUserId` | `v.id("users")` |
| `status` | `imagePublishRunStatus` |
| `replaceExisting` | `v.boolean()` |
| `totalProducts` | `v.number()` |
| `processedProducts` | `v.number()` |
| `failedProducts` | `v.number()` |
| `totalImages` | `v.number()` |
| `pushedImages` | `v.number()` |
| `workflowId` | `v.optional(v.string())` |
| `tracksImageFeedback` | `v.optional(v.boolean())` |
| `error` | `v.optional(v.string())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |
| `completedAt` | `v.optional(v.number())` |

Index :

- `index("by_jobId", ["jobId"])`
- `index("by_jobId_and_status", ["jobId", "status"])`

### imagePublishProducts

Source : [convex/shopify/publicationSchema.ts:65](../convex/shopify/publicationSchema.ts#L65).

| Champ | Validation actuelle |
| --- | --- |
| `runId` | `v.id("imagePublishRuns")` |
| `productId` | `v.id("products")` |
| `productTitle` | `v.string()` |
| `images` | `v.array( v.object({ imageId: v.id("generatedImages"), storageUrl: v.string() }), )` |
| `position` | `v.number()` |
| `status` | `v.union( v.literal("queued"), v.literal("completed"), v.literal("failed"), )` |
| `pushedImages` | `v.number()` |
| `error` | `v.optional(v.string())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_runId_and_position", ["runId", "position"])`
- `index("by_runId_and_status", ["runId", "status"])`

### productPublicationAttempts

Source : [convex/shopify/publicationSchema.ts:87](../convex/shopify/publicationSchema.ts#L87).

| Champ | Validation actuelle |
| --- | --- |
| `productId` | `v.id("products")` |
| `fingerprint` | `v.string()` |
| `state` | `v.union( v.literal("running"), v.literal("uncertain"), v.literal("completed"), )` |
| `leaseToken` | `v.string()` |
| `leaseExpiresAt` | `v.number()` |
| `siblingGroupId` | `v.optional(v.id("visualGroups"))` |
| `siblingProductId` | `v.optional(v.string())` |
| `result` | `v.optional(publicationResultValidator)` |
| `error` | `v.optional(v.string())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_productId", ["productId"])`

### generatedMediaPublications

Source : [convex/shopify/publicationSchema.ts:104](../convex/shopify/publicationSchema.ts#L104).

| Champ | Validation actuelle |
| --- | --- |
| `productId` | `v.id("products")` |
| `imageId` | `v.id("generatedImages")` |
| `storageUrl` | `v.string()` |
| `targetProductId` | `v.string()` |
| `expectedAlt` | `v.string()` |
| `baselineMediaIds` | `v.array(v.string())` |
| `state` | `v.union(v.literal("submitting"), v.literal("completed"))` |
| `shopifyMediaId` | `v.optional(v.string())` |
| `createdAt` | `v.number()` |
| `updatedAt` | `v.number()` |

Index :

- `index("by_imageId_and_storageUrl_and_targetProductId", [ "imageId", "storageUrl", "targetProductId", ])`

## 2. États et validateurs composés

### generationStatus

Source : [convex/schema.ts:9](../convex/schema.ts#L9).

```ts
v.union( v.literal("not_started"), v.literal("generating"), v.literal("partial"), v.literal("ready"), v.literal("pushed"), v.literal("canceled"), v.literal("failed"), )
```

### productGenerationState

Source : [convex/schema.ts:19](../convex/schema.ts#L19).

```ts
v.union( v.literal("not_started"), v.literal("generating"), v.literal("complete"), v.literal("incomplete"), v.literal("failed"), v.literal("canceled"), )
```

### productReviewState

Source : [convex/schema.ts:28](../convex/schema.ts#L28).

```ts
v.union( v.literal("none"), v.literal("needs_review"), v.literal("partially_approved"), v.literal("approved"), v.literal("rejected"), )
```

### productPublishState

Source : [convex/schema.ts:36](../convex/schema.ts#L36).

```ts
v.union( v.literal("not_ready"), v.literal("ready_to_push"), v.literal("partially_pushed"), v.literal("pushed"), )
```

### productPrimaryAction

Source : [convex/schema.ts:43](../convex/schema.ts#L43).

```ts
v.union( v.literal("generate"), v.literal("wait"), v.literal("review"), v.literal("push"), v.literal("fix_errors"), v.literal("done"), )
```

### jobStatus

Source : [convex/schema.ts:52](../convex/schema.ts#L52).

```ts
v.union( v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("failed"), v.literal("cancelled"), )
```

### imageStatus

Source : [convex/schema.ts:60](../convex/schema.ts#L60).

```ts
v.union( v.literal("queued"), v.literal("generating"), v.literal("postprocessing"), v.literal("generated"), v.literal("uploaded"), v.literal("canceled"), v.literal("failed"), )
```

### batchSegmentStatus

Source : [convex/schema.ts:70](../convex/schema.ts#L70).

```ts
v.union( v.literal("submitting"), v.literal("running"), v.literal("completed"), v.literal("failed"), v.literal("cancelled"), )
```

### reviewStatus

Source : [convex/schema.ts:78](../convex/schema.ts#L78).

```ts
v.union( v.literal("pending"), v.literal("approved"), v.literal("rejected"), )
```

### bulkTransformOperation

Source : [convex/schema.ts:83](../convex/schema.ts#L83).

```ts
v.literal("flip_horizontal")
```

### bulkTransformRetryPhase

Source : [convex/schema.ts:84](../convex/schema.ts#L84).

```ts
v.union( v.literal("transform"), v.literal("publish"), v.literal("conflict"), )
```

### bulkTransformJobStatus

Source : [convex/schema.ts:89](../convex/schema.ts#L89).

```ts
v.union( v.literal("queued"), v.literal("transforming"), v.literal("ready"), v.literal("publishing"), v.literal("completed"), v.literal("partial"), v.literal("failed"), v.literal("cancelled"), )
```

### bulkTransformItemStatus

Source : [convex/schema.ts:99](../convex/schema.ts#L99).

```ts
v.union( v.literal("queued"), v.literal("transforming"), v.literal("ready"), v.literal("publishing"), v.literal("published"), v.literal("skipped"), v.literal("transform_failed"), v.literal("publish_failed"), v.literal("conflict"), )
```

### bulkTransformRollbackStatus

Source : [convex/schema.ts:110](../convex/schema.ts#L110).

```ts
v.union( v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("partial"), )
```

### bulkTransformItemRollbackStatus

Source : [convex/schema.ts:116](../convex/schema.ts#L116).

```ts
v.union( v.literal("queued"), v.literal("restoring"), v.literal("restored"), v.literal("failed"), v.literal("conflict"), )
```

### bulkReorderJobStatus

Source : [convex/schema.ts:123](../convex/schema.ts#L123).

```ts
v.union( v.literal("queued"), v.literal("running"), v.literal("cancelling"), v.literal("completed"), v.literal("partial"), v.literal("failed"), v.literal("cancelled"), )
```

### bulkReorderItemStatus

Source : [convex/schema.ts:132](../convex/schema.ts#L132).

```ts
v.union( v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("skipped"), v.literal("failed"), v.literal("conflict"), v.literal("cancelled"), )
```

### bulkReorderRestoreStatus

Source : [convex/schema.ts:141](../convex/schema.ts#L141).

```ts
v.union( v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("partial"), )
```

### bulkReorderItemRestoreStatus

Source : [convex/schema.ts:147](../convex/schema.ts#L147).

```ts
v.union( v.literal("queued"), v.literal("running"), v.literal("restored"), v.literal("failed"), v.literal("conflict"), )
```

### backgroundMode

Source : [convex/schema.ts:154](../convex/schema.ts#L154).

```ts
v.union(v.literal("solid"), v.literal("transparent"))
```

### backgroundRemovalProvider

Source : [convex/schema.ts:155](../convex/schema.ts#L155).

```ts
v.union(v.literal("fal_ideogram"), v.null())
```

### promptKind

Source : [convex/schema.ts:156](../convex/schema.ts#L156).

```ts
v.union( v.literal("product_only"), v.literal("product_detail"), v.literal("product_scene"), v.literal("human_model"), v.literal("studio_product"), v.literal("detail_product"), v.literal("worn_model"), v.literal("lifestyle_model"), )
```

### visualPublishMode

Source : [convex/schema.ts:167](../convex/schema.ts#L167).

```ts
v.union( v.literal("variant_media"), v.literal("separate_products"), )
```

### visualAnalysisStatus

Source : [convex/schema.ts:172](../convex/schema.ts#L172).

```ts
v.union( v.literal("not_started"), v.literal("running"), v.literal("ready"), v.literal("needs_review"), v.literal("failed"), )
```

### visualReferenceSource

Source : [convex/schema.ts:180](../convex/schema.ts#L180).

```ts
v.union( v.literal("shopify"), v.literal("rule"), v.literal("ai"), v.literal("ai_crop"), v.literal("manual"), )
```

### modelReference

Source : [convex/schema.ts:188](../convex/schema.ts#L188).

```ts
v.object({ storageId: v.id("_storage"), fileName: v.optional(v.string()), contentType: v.optional(v.string()), size: v.optional(v.number()), updatedAt: v.number(), })
```

### googleFeedAttribute

Source : [convex/schema.ts:196](../convex/schema.ts#L196).

```ts
v.union( v.literal("google_product_category"), v.literal("gender"), v.literal("age_group"), )
```

### googleFeedOwnerType

Source : [convex/schema.ts:202](../convex/schema.ts#L202).

```ts
v.union( v.literal("PRODUCT"), v.literal("PRODUCTVARIANT"), )
```

### googleFeedCoordinate

Source : [convex/schema.ts:207](../convex/schema.ts#L207).

```ts
v.object({ definitionId: v.string(), namespace: v.string(), key: v.string(), type: v.string(), ownerType: googleFeedOwnerType, })
```

### googleFeedCondition

Source : [convex/schema.ts:215](../convex/schema.ts#L215).

```ts
v.object({ field: v.union( v.literal("product_title"), v.literal("product_type"), v.literal("vendor"), v.literal("tags"), v.literal("collections"), v.literal("variant_title"), v.literal("option_name"), v.literal("option_value"), v.literal("sku"), v.literal("current_attribute"), ), operator: v.union( v.literal("equals"), v.literal("not_equals"), v.literal("contains"), v.literal("not_contains"), v.literal("starts_with"), v.literal("ends_with"), v.literal("in"), v.literal("empty"), v.literal("not_empty"), v.literal("between"), ), value: v.optional(v.string()), values: v.optional(v.array(v.string())), min: v.optional(v.number()), max: v.optional(v.number()), })
```

### publicationResultValidator

Source : [convex/shopify/publicationSchema.ts:4](../convex/shopify/publicationSchema.ts#L4).

```ts
v.object({ pushed: v.number(), replaced: v.boolean(), publishMode: v.union( v.literal("separate_products"), v.literal("variant_media"), ), createdProducts: v.array( v.object({ groupId: v.id("visualGroups"), shopifyProductId: v.string(), title: v.string(), handle: v.union(v.string(), v.null()), }), ), })
```

### imagePublishRunStatus

Source : [convex/shopify/publicationSchema.ts:23](../convex/shopify/publicationSchema.ts#L23).

```ts
v.union( v.literal("running"), v.literal("completed"), v.literal("completed_with_errors"), v.literal("failed"), )
```

### imagePublishSummaryValidator

Source : [convex/shopify/publicationSchema.ts:30](../convex/shopify/publicationSchema.ts#L30).

```ts
v.object({ _id: v.id("imagePublishRuns"), status: imagePublishRunStatus, totalProducts: v.number(), processedProducts: v.number(), failedProducts: v.number(), totalImages: v.number(), pushedImages: v.number(), replaceExisting: v.boolean(), errors: v.array(v.object({ productTitle: v.string(), error: v.string() })), })
```

### promptConditionValidator

Source : [convex/promptConditions.ts:3](../convex/promptConditions.ts#L3).

```ts
v.object({ field: v.union( v.literal("product_title"), v.literal("variant_title"), v.literal("option_value"), ), operator: v.union( v.literal("present"), v.literal("contains"), v.literal("equals"), ), optionName: v.optional(v.string()), value: v.optional(v.string()), })
```

### variantSelectionValidator

Source : [convex/generationTargets.ts:3](../convex/generationTargets.ts#L3).

```ts
v.union( v.literal("first"), v.literal("all"), )
```

### generationTargetValidator

Source : [convex/generationTargets.ts:8](../convex/generationTargets.ts#L8).

```ts
v.object({ key: v.string(), kind: v.union(v.literal("product"), v.literal("group"), v.literal("variant")), shopifyVariantId: v.union(v.string(), v.null()), variantTitle: v.string(), selectedOptions: v.array(v.object({ name: v.string(), value: v.string() })), productTitle: v.string(), assignAllVariants: v.optional(v.boolean()), })
```

### promptBranchValidator

Source : [convex/generationTargets.ts:18](../convex/generationTargets.ts#L18).

```ts
v.union( v.literal("main"), v.literal("if_true"), v.literal("otherwise"), )
```

### googleFeedAttributeValidator

Source : [convex/googleFeed/validators.ts:3](../convex/googleFeed/validators.ts#L3).

```ts
v.union( v.literal("google_product_category"), v.literal("gender"), v.literal("age_group"), )
```

### googleFeedOwnerTypeValidator

Source : [convex/googleFeed/validators.ts:9](../convex/googleFeed/validators.ts#L9).

```ts
v.union( v.literal("PRODUCT"), v.literal("PRODUCTVARIANT"), )
```

### googleFeedCoordinateValidator

Source : [convex/googleFeed/validators.ts:14](../convex/googleFeed/validators.ts#L14).

```ts
v.object({ definitionId: v.string(), namespace: v.string(), key: v.string(), type: v.string(), ownerType: googleFeedOwnerTypeValidator, })
```

### googleFeedDiagnosticAttributeValidator

Source : [convex/googleFeed/validators.ts:22](../convex/googleFeed/validators.ts#L22).

```ts
v.object({ attribute: googleFeedAttributeValidator, status: v.union( v.literal("ready"), v.literal("missing"), v.literal("ambiguous"), v.literal("incompatible"), ), coordinate: v.union(googleFeedCoordinateValidator, v.null()), message: v.string(), })
```

### googleFeedConditionValidator

Source : [convex/googleFeed/validators.ts:34](../convex/googleFeed/validators.ts#L34).

```ts
v.object({ field: v.union( v.literal("product_title"), v.literal("product_type"), v.literal("vendor"), v.literal("tags"), v.literal("collections"), v.literal("variant_title"), v.literal("option_name"), v.literal("option_value"), v.literal("sku"), v.literal("current_attribute"), ), operator: v.union( v.literal("equals"), v.literal("not_equals"), v.literal("contains"), v.literal("not_contains"), v.literal("starts_with"), v.literal("ends_with"), v.literal("in"), v.literal("empty"), v.literal("not_empty"), v.literal("between"), ), value: v.optional(v.string()), values: v.optional(v.array(v.string())), min: v.optional(v.number()), max: v.optional(v.number()), })
```

### googleFeedRuleInputValidator

Source : [convex/googleFeed/validators.ts:65](../convex/googleFeed/validators.ts#L65).

```ts
v.object({ name: v.string(), active: v.boolean(), priority: v.number(), target: v.union(v.literal("product"), v.literal("variant")), attribute: googleFeedAttributeValidator, conditionMode: v.union(v.literal("and"), v.literal("or")), conditions: v.array(googleFeedConditionValidator), value: v.string(), overwritePolicy: v.union( v.literal("only_if_empty"), v.literal("replace_existing"), ), })
```

### googleFeedDraftStatusValidator

Source : [convex/googleFeed/validators.ts:80](../convex/googleFeed/validators.ts#L80).

```ts
v.union( v.literal("draft"), v.literal("conflict"), v.literal("invalid"), v.literal("publishing"), v.literal("confirmed"), v.literal("failed"), )
```

### googleFeedRunStatusValidator

Source : [convex/googleFeed/validators.ts:89](../convex/googleFeed/validators.ts#L89).

```ts
v.union( v.literal("running"), v.literal("completed"), v.literal("partial"), v.literal("failed"), )
```

## 3. Surface publique actuelle

Une fonction publique est atteignable par le client ; « publique » ne signifie pas « anonyme ». La plupart exigent un utilisateur approuvé et appliquent ensuite leurs règles de boutique/propriétaire. Cet inventaire énumère les entrées du code, pas une validation exhaustive de leurs autorisations. Les champs complets des arguments sont dans le JSON.

### bulkOperations

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `list` | `query` | cursor, limit, operation | [convex/bulkOperations.ts:138](../convex/bulkOperations.ts#L138) |
| `hasUndismissed` | `query` | aucun | [convex/bulkOperations.ts:242](../convex/bulkOperations.ts#L242) |

### bulkReorders

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `start` | `action` | productIds, operation, firstPosition, secondPosition | [convex/bulkReorders.ts:271](../convex/bulkReorders.ts#L271) |
| `restore` | `action` | jobId | [convex/bulkReorders.ts:294](../convex/bulkReorders.ts#L294) |
| `retry` | `action` | jobId | [convex/bulkReorders.ts:316](../convex/bulkReorders.ts#L316) |
| `latestUndismissed` | `query` | aucun | [convex/bulkReorders.ts:338](../convex/bulkReorders.ts#L338) |
| `get` | `query` | jobId | [convex/bulkReorders.ts:379](../convex/bulkReorders.ts#L379) |
| `dismiss` | `mutation` | jobId | [convex/bulkReorders.ts:403](../convex/bulkReorders.ts#L403) |
| `cancel` | `mutation` | jobId | [convex/bulkReorders.ts:421](../convex/bulkReorders.ts#L421) |

### bulkTransforms

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `start` | `action` | productIds, operation, imagePositions, selectionSnapshotToken | [convex/bulkTransforms.ts:543](../convex/bulkTransforms.ts#L543) |
| `publish` | `action` | jobId | [convex/bulkTransforms.ts:562](../convex/bulkTransforms.ts#L562) |
| `rollback` | `action` | jobId | [convex/bulkTransforms.ts:587](../convex/bulkTransforms.ts#L587) |
| `latestUndismissed` | `query` | aucun | [convex/bulkTransforms.ts:609](../convex/bulkTransforms.ts#L609) |
| `productLocks` | `query` | productIds | [convex/bulkTransforms.ts:647](../convex/bulkTransforms.ts#L647) |
| `selectionOptions` | `query` | productIds | [convex/bulkTransforms.ts:666](../convex/bulkTransforms.ts#L666) |
| `list` | `query` | cursor, limit | [convex/bulkTransforms.ts:757](../convex/bulkTransforms.ts#L757) |
| `get` | `query` | jobId | [convex/bulkTransforms.ts:875](../convex/bulkTransforms.ts#L875) |
| `retryFailures` | `action` | jobId | [convex/bulkTransforms.ts:976](../convex/bulkTransforms.ts#L976) |
| `dismiss` | `mutation` | jobId | [convex/bulkTransforms.ts:1070](../convex/bulkTransforms.ts#L1070) |
| `cancel` | `mutation` | jobId | [convex/bulkTransforms.ts:1104](../convex/bulkTransforms.ts#L1104) |

### catalogueActions

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `download` | `action` | id | [convex/catalogueActions.ts:54](../convex/catalogueActions.ts#L54) |
| `suggestTags` | `action` | id | [convex/catalogueActions.ts:66](../convex/catalogueActions.ts#L66) |

### catalogues

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `create` | `mutation` | url, mode, topN | [convex/catalogues.ts:80](../convex/catalogues.ts#L80) |
| `list` | `query` | aucun | [convex/catalogues.ts:122](../convex/catalogues.ts#L122) |
| `get` | `query` | id | [convex/catalogues.ts:146](../convex/catalogues.ts#L146) |
| `products` | `query` | id, paginationOpts, search, collection, state, sort | [convex/catalogues.ts:159](../convex/catalogues.ts#L159) |
| `product` | `query` | id, productId | [convex/catalogues.ts:226](../convex/catalogues.ts#L226) |
| `saveProduct` | `mutation` | id, productId, version, override | [convex/catalogues.ts:257](../convex/catalogues.ts#L257) |
| `saveTags` | `mutation` | id, version, values, validate, collect | [convex/catalogues.ts:309](../convex/catalogues.ts#L309) |
| `retry` | `mutation` | id | [convex/catalogues.ts:355](../convex/catalogues.ts#L355) |
| `addCollection` | `mutation` | id, key | [convex/catalogues.ts:373](../convex/catalogues.ts#L373) |
| `exportJson` | `mutation` | id, allowPartial | [convex/catalogues.ts:393](../convex/catalogues.ts#L393) |
| `destinationShops` | `query` | aucun | [convex/catalogues.ts:408](../convex/catalogues.ts#L408) |
| `startImport` | `mutation` | id, shopId, allowPartial, version | [convex/catalogues.ts:422](../convex/catalogues.ts#L422) |

### generation

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `pollJob` | `action` | jobId | [convex/generation.ts:939](../convex/generation.ts#L939) |
| `cancelJob` | `action` | jobId | [convex/generation.ts:997](../convex/generation.ts#L997) |

### googleFeed

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `overview` | `query` | aucun | [convex/googleFeed.ts:149](../convex/googleFeed.ts#L149) |
| `catalog` | `query` | offset, limit, search, productType, collection, shopifyStatus, gender, ageGroup, filter | [convex/googleFeed.ts:254](../convex/googleFeed.ts#L254) |
| `variantsForProduct` | `query` | productId | [convex/googleFeed.ts:428](../convex/googleFeed.ts#L428) |
| `listRules` | `query` | aucun | [convex/googleFeed.ts:499](../convex/googleFeed.ts#L499) |
| `saveRule` | `mutation` | ruleId, rule | [convex/googleFeed.ts:524](../convex/googleFeed.ts#L524) |
| `duplicateRule` | `mutation` | ruleId | [convex/googleFeed.ts:569](../convex/googleFeed.ts#L569) |
| `deleteRule` | `mutation` | ruleId | [convex/googleFeed.ts:597](../convex/googleFeed.ts#L597) |
| `setProductDraft` | `mutation` | productId, attribute, value | [convex/googleFeed.ts:671](../convex/googleFeed.ts#L671) |
| `setVariantDraft` | `mutation` | variantId, value | [convex/googleFeed.ts:739](../convex/googleFeed.ts#L739) |
| `setDraftInclusion` | `mutation` | draftId, included | [convex/googleFeed.ts:775](../convex/googleFeed.ts#L775) |
| `updateDraftValue` | `mutation` | draftId, value | [convex/googleFeed.ts:789](../convex/googleFeed.ts#L789) |
| `discardDraft` | `mutation` | draftId | [convex/googleFeed.ts:817](../convex/googleFeed.ts#L817) |
| `preview` | `query` | offset, limit, status | [convex/googleFeed.ts:848](../convex/googleFeed.ts#L848) |
| `history` | `query` | paginationOpts | [convex/googleFeed.ts:959](../convex/googleFeed.ts#L959) |
| `runDetails` | `query` | runId, limit | [convex/googleFeed.ts:1005](../convex/googleFeed.ts#L1005) |

### googleFeedActions

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `runDiagnostic` | `action` | aucun | [convex/googleFeedActions.ts:67](../convex/googleFeedActions.ts#L67) |
| `evaluateRules` | `action` | productIds, variantIds | [convex/googleFeedActions.ts:132](../convex/googleFeedActions.ts#L132) |
| `publish` | `action` | retryRunId | [convex/googleFeedActions.ts:263](../convex/googleFeedActions.ts#L263) |
| `searchTaxonomy` | `action` | query, limit | [convex/googleFeedActions.ts:323](../convex/googleFeedActions.ts#L323) |

### jobImagePublishing

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `start` | `mutation` | jobId, imageIds, replaceExisting | [convex/jobImagePublishing.ts:38](../convex/jobImagePublishing.ts#L38) |
| `latest` | `query` | jobId | [convex/jobImagePublishing.ts:175](../convex/jobImagePublishing.ts#L175) |

### jobs

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `list` | `query` | productId, status, executionMode, provider, review, archived, offset, limit | [convex/jobs.ts:140](../convex/jobs.ts#L140) |
| `costSummary` | `query` | aucun | [convex/jobs.ts:204](../convex/jobs.ts#L204) |
| `get` | `query` | jobId | [convex/jobs.ts:298](../convex/jobs.ts#L298) |
| `preview` | `query` | productIds, visualGroupIds, selectedImageTypes, variantSelection | [convex/jobs.ts:319](../convex/jobs.ts#L319) |
| `create` | `mutation` | productIds, visualGroupIds, variantSelection, selectedImageTypes, forceRegenerate, useVibeAnalysis, regenerationInstructions | [convex/jobs.ts:367](../convex/jobs.ts#L367) |
| `cancel` | `mutation` | jobId | [convex/jobs.ts:529](../convex/jobs.ts#L529) |
| `setArchived` | `mutation` | jobId, archived | [convex/jobs.ts:540](../convex/jobs.ts#L540) |
| `remove` | `mutation` | jobId | [convex/jobs.ts:560](../convex/jobs.ts#L560) |
| `generateRetouchUploadUrl` | `mutation` | aucun | [convex/jobs.ts:1558](../convex/jobs.ts#L1558) |
| `reviewImages` | `mutation` | imageIds, reviewStatus | [convex/jobs.ts:1724](../convex/jobs.ts#L1724) |
| `regenerateImage` | `mutation` | imageId, regenerationInstructions | [convex/jobs.ts:1765](../convex/jobs.ts#L1765) |
| `retry` | `mutation` | jobId | [convex/jobs.ts:1977](../convex/jobs.ts#L1977) |
| `backfillJobSummaries` | `mutation` | aucun | [convex/jobs.ts:2237](../convex/jobs.ts#L2237) |

### products

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `list` | `query` | search, productType, collection, shopifyStatus, primaryAction, generationState, reviewState, publishState, generationStatus, offset, limit | [convex/products.ts:206](../convex/products.ts#L206) |
| `navigation` | `query` | productId, search, productType, collection, shopifyStatus, primaryAction, generationState, reviewState, publishState, generationStatus | [convex/products.ts:231](../convex/products.ts#L231) |
| `facets` | `query` | aucun | [convex/products.ts:256](../convex/products.ts#L256) |
| `get` | `query` | productId | [convex/products.ts:282](../convex/products.ts#L282) |
| `getWithImages` | `query` | productId | [convex/products.ts:300](../convex/products.ts#L300) |
| `byIds` | `query` | productIds | [convex/products.ts:320](../convex/products.ts#L320) |
| `backfillProductSummaries` | `mutation` | aucun | [convex/products.ts:492](../convex/products.ts#L492) |

### prompts

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `list` | `query` | aucun | [convex/prompts.ts:32](../convex/prompts.ts#L32) |
| `master` | `query` | aucun | [convex/prompts.ts:41](../convex/prompts.ts#L41) |
| `updateMaster` | `mutation` | masterPrompt | [convex/prompts.ts:51](../convex/prompts.ts#L51) |
| `generateModelReferenceUploadUrl` | `mutation` | aucun | [convex/prompts.ts:81](../convex/prompts.ts#L81) |
| `saveModelReference` | `mutation` | key, storageId, fileName, contentType, size | [convex/prompts.ts:90](../convex/prompts.ts#L90) |
| `removeModelReference` | `mutation` | key | [convex/prompts.ts:145](../convex/prompts.ts#L145) |
| `create` | `mutation` | imageType, label, content, condition, alternativeContent, isPreset, promptKind, useVibeAnalysis, referenceImageCount, removeBackground, backgroundMode, backgroundColor, backgroundShadow | [convex/prompts.ts:170](../convex/prompts.ts#L170) |
| `setActive` | `mutation` | promptId, isActive | [convex/prompts.ts:231](../convex/prompts.ts#L231) |
| `setPreset` | `mutation` | promptId, isPreset | [convex/prompts.ts:245](../convex/prompts.ts#L245) |
| `update` | `mutation` | promptId, imageType, content, condition, alternativeContent, promptKind, useVibeAnalysis, referenceImageCount, removeBackground, backgroundMode, backgroundColor, backgroundShadow | [convex/prompts.ts:259](../convex/prompts.ts#L259) |
| `remove` | `mutation` | promptId | [convex/prompts.ts:336](../convex/prompts.ts#L336) |
| `reorder` | `mutation` | orderedIds | [convex/prompts.ts:357](../convex/prompts.ts#L357) |

### retouch

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `prepareRetouchSource` | `action` | sourceImageId | [convex/retouch.ts:88](../convex/retouch.ts#L88) |
| `saveRetouchedImage` | `action` | sourceImageId, storageId, contentType, saveMode | [convex/retouch.ts:131](../convex/retouch.ts#L131) |

### settings

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `list` | `query` | aucun | [convex/settings.ts:32](../convex/settings.ts#L32) |
| `shopInfo` | `query` | aucun | [convex/settings.ts:42](../convex/settings.ts#L42) |
| `set` | `mutation` | key, value | [convex/settings.ts:59](../convex/settings.ts#L59) |
| `shopifyOnboarding` | `query` | aucun | [convex/settings.ts:90](../convex/settings.ts#L90) |

### shopify

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `authorizationStatus` | `action` | shopId | [convex/shopify.ts:140](../convex/shopify.ts#L140) |
| `beginAuthorization` | `action` | shopId, catalog | [convex/shopify.ts:249](../convex/shopify.ts#L249) |
| `syncProducts` | `action` | limit | [convex/shopify.ts:341](../convex/shopify.ts#L341) |
| `syncProduct` | `action` | productId | [convex/shopify.ts:422](../convex/shopify.ts#L422) |
| `reorderProductImages` | `action` | productId, orderedMediaIds | [convex/shopify.ts:483](../convex/shopify.ts#L483) |
| `pushProductImages` | `action` | productId, imageIds, replaceExisting, replaceVariantMedia | [convex/shopify.ts:1133](../convex/shopify.ts#L1133) |
| `deleteImage` | `action` | imageId | [convex/shopify.ts:1782](../convex/shopify.ts#L1782) |

### shops

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `list` | `query` | aucun | [convex/shops.ts:15](../convex/shops.ts#L15) |
| `current` | `query` | aucun | [convex/shops.ts:34](../convex/shops.ts#L34) |
| `connect` | `mutation` | domain, name, clientId, clientSecret, productQuery | [convex/shops.ts:45](../convex/shops.ts#L45) |
| `ensureDefault` | `mutation` | aucun | [convex/shops.ts:102](../convex/shops.ts#L102) |
| `setActive` | `mutation` | shopId | [convex/shops.ts:111](../convex/shops.ts#L111) |
| `envConfigured` | `query` | aucun | [convex/shops.ts:149](../convex/shops.ts#L149) |

### users

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `hasUsers` | `query` | aucun | [convex/users.ts:8](../convex/users.ts#L8) |
| `current` | `query` | aucun | [convex/users.ts:16](../convex/users.ts#L16) |
| `currentAccess` | `query` | aucun | [convex/users.ts:24](../convex/users.ts#L24) |

### visualGroupAnalysis

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `analyze` | `action` | productId | [convex/visualGroupAnalysis.ts:341](../convex/visualGroupAnalysis.ts#L341) |

### visualGroups

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `getForProduct` | `query` | productId | [convex/visualGroups.ts:118](../convex/visualGroups.ts#L118) |
| `configure` | `mutation` | productId, optionNames | [convex/visualGroups.ts:187](../convex/visualGroups.ts#L187) |
| `setGroupSwatch` | `mutation` | groupId, swatchCss | [convex/visualGroups.ts:342](../convex/visualGroups.ts#L342) |
| `assignReference` | `mutation` | groupId, mediaId | [convex/visualGroups.ts:446](../convex/visualGroups.ts#L446) |
| `setPrimaryReference` | `mutation` | groupId, mediaId | [convex/visualGroups.ts:455](../convex/visualGroups.ts#L455) |
| `reorderReferences` | `mutation` | groupId, referenceIds | [convex/visualGroups.ts:463](../convex/visualGroups.ts#L463) |
| `confirmReference` | `mutation` | referenceId | [convex/visualGroups.ts:509](../convex/visualGroups.ts#L509) |
| `confirmGroupReferences` | `mutation` | groupId | [convex/visualGroups.ts:526](../convex/visualGroups.ts#L526) |
| `removeReference` | `mutation` | referenceId | [convex/visualGroups.ts:571](../convex/visualGroups.ts#L571) |

## 4. Fonctions internes et commandes de workers

Ces fonctions servent les workers, workflows, journaux, reprise, nettoyage et maintenance. Elles ne doivent pas toutes devenir des routes HTTP accessibles au navigateur dans la refonte.

### bulkReorders

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `getJobForUser` | `internalQuery` | jobId, userId | [convex/bulkReorders.ts:462](../convex/bulkReorders.ts#L462) |
| `createJob` | `internalMutation` | userId, productIds, firstPosition, secondPosition | [convex/bulkReorders.ts:470](../convex/bulkReorders.ts#L470) |
| `claimNext` | `internalMutation` | jobId | [convex/bulkReorders.ts:560](../convex/bulkReorders.ts#L560) |
| `saveSnapshot` | `internalMutation` | itemId, sourceImageIds, targetImageIds | [convex/bulkReorders.ts:645](../convex/bulkReorders.ts#L645) |
| `saveShopifyJob` | `internalMutation` | itemId, shopifyJobId | [convex/bulkReorders.ts:664](../convex/bulkReorders.ts#L664) |
| `deferItem` | `internalMutation` | itemId, delayMs, error | [convex/bulkReorders.ts:680](../convex/bulkReorders.ts#L680) |
| `recordOutcome` | `internalMutation` | itemId, outcome, error | [convex/bulkReorders.ts:741](../convex/bulkReorders.ts#L741) |
| `processNext` | `internalAction` | jobId | [convex/bulkReorders.ts:794](../convex/bulkReorders.ts#L794) |
| `prepareRestore` | `internalMutation` | jobId, userId | [convex/bulkReorders.ts:1045](../convex/bulkReorders.ts#L1045) |
| `claimNextRestore` | `internalMutation` | jobId | [convex/bulkReorders.ts:1120](../convex/bulkReorders.ts#L1120) |
| `saveRestoreShopifyJob` | `internalMutation` | itemId, shopifyJobId | [convex/bulkReorders.ts:1167](../convex/bulkReorders.ts#L1167) |
| `deferRestoreItem` | `internalMutation` | itemId, delayMs, error | [convex/bulkReorders.ts:1183](../convex/bulkReorders.ts#L1183) |
| `recordRestoreOutcome` | `internalMutation` | itemId, outcome, error | [convex/bulkReorders.ts:1211](../convex/bulkReorders.ts#L1211) |
| `processNextRestore` | `internalAction` | jobId | [convex/bulkReorders.ts:1264](../convex/bulkReorders.ts#L1264) |
| `prepareRetry` | `internalMutation` | jobId, userId | [convex/bulkReorders.ts:1494](../convex/bulkReorders.ts#L1494) |
| `resumeStaleJobs` | `internalMutation` | aucun | [convex/bulkReorders.ts:1593](../convex/bulkReorders.ts#L1593) |

### bulkTransforms

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `prepareRetry` | `internalMutation` | jobId, userId, expectedPhase | [convex/bulkTransforms.ts:1019](../convex/bulkTransforms.ts#L1019) |
| `cancelActivePublishing` | `internalMutation` | jobId | [convex/bulkTransforms.ts:1124](../convex/bulkTransforms.ts#L1124) |
| `getJobForUser` | `internalQuery` | jobId, userId | [convex/bulkTransforms.ts:1135](../convex/bulkTransforms.ts#L1135) |
| `createJob` | `internalMutation` | userId, productIds, operation, imagePositions, selectionSnapshotToken | [convex/bulkTransforms.ts:1145](../convex/bulkTransforms.ts#L1145) |
| `getSeedContext` | `internalQuery` | jobId | [convex/bulkTransforms.ts:1257](../convex/bulkTransforms.ts#L1257) |
| `storeSeededProduct` | `internalMutation` | jobId, productIndex, skippedItems, images | [convex/bulkTransforms.ts:1327](../convex/bulkTransforms.ts#L1327) |
| `recordSeedFailure` | `internalMutation` | jobId, productIndex, error, retryable | [convex/bulkTransforms.ts:1414](../convex/bulkTransforms.ts#L1414) |
| `claimNextTransform` | `internalMutation` | jobId | [convex/bulkTransforms.ts:1480](../convex/bulkTransforms.ts#L1480) |
| `markTransformReady` | `internalMutation` | itemId, sourceUrl, sourceSha256, transformedSha256, sourceBackupUrl, outputUrl | [convex/bulkTransforms.ts:1581](../convex/bulkTransforms.ts#L1581) |
| `markTransformFailed` | `internalMutation` | itemId, error | [convex/bulkTransforms.ts:1593](../convex/bulkTransforms.ts#L1593) |
| `markTransformSkipped` | `internalMutation` | itemId, error | [convex/bulkTransforms.ts:1598](../convex/bulkTransforms.ts#L1598) |
| `startPublishing` | `internalMutation` | jobId, userId | [convex/bulkTransforms.ts:1604](../convex/bulkTransforms.ts#L1604) |
| `startRollback` | `internalMutation` | jobId, userId | [convex/bulkTransforms.ts:1638](../convex/bulkTransforms.ts#L1638) |
| `claimNextRollback` | `internalMutation` | jobId | [convex/bulkTransforms.ts:1697](../convex/bulkTransforms.ts#L1697) |
| `renewRollbackMediaLease` | `internalMutation` | itemId, leaseToken | [convex/bulkTransforms.ts:1802](../convex/bulkTransforms.ts#L1802) |
| `markRollbackFileUpdateAccepted` | `internalMutation` | itemId, leaseToken | [convex/bulkTransforms.ts:1828](../convex/bulkTransforms.ts#L1828) |
| `claimNextPublish` | `internalMutation` | jobId | [convex/bulkTransforms.ts:1858](../convex/bulkTransforms.ts#L1858) |
| `getProcessingContext` | `internalQuery` | itemId | [convex/bulkTransforms.ts:1945](../convex/bulkTransforms.ts#L1945) |
| `markFileUpdateAccepted` | `internalMutation` | itemId, leaseToken | [convex/bulkTransforms.ts:1956](../convex/bulkTransforms.ts#L1956) |
| `clearFileUpdateAccepted` | `internalMutation` | itemId, leaseToken | [convex/bulkTransforms.ts:1982](../convex/bulkTransforms.ts#L1982) |
| `renewPublishMediaLease` | `internalMutation` | itemId, leaseToken | [convex/bulkTransforms.ts:2008](../convex/bulkTransforms.ts#L2008) |
| `markPublished` | `internalMutation` | itemId, leaseToken, publishedUrl | [convex/bulkTransforms.ts:2194](../convex/bulkTransforms.ts#L2194) |
| `refreshPublishedProductCaches` | `internalMutation` | itemId, nextProductIndex, referenceCursor | [convex/bulkTransforms.ts:2203](../convex/bulkTransforms.ts#L2203) |
| `markRollbackRestored` | `internalMutation` | itemId, leaseToken, resolvedUrl, resolvedSha256 | [convex/bulkTransforms.ts:2421](../convex/bulkTransforms.ts#L2421) |
| `markRollbackFailed` | `internalMutation` | itemId, leaseToken, error, conflict, resolvedUrl, resolvedSha256, safeToRelease, resetAmbiguityWindow | [convex/bulkTransforms.ts:2432](../convex/bulkTransforms.ts#L2432) |
| `refreshRollbackProductCaches` | `internalMutation` | itemId, nextProductIndex, referenceCursor | [convex/bulkTransforms.ts:2450](../convex/bulkTransforms.ts#L2450) |
| `markPublishFailed` | `internalMutation` | itemId, leaseToken, error, conflict, safeToRelease, resetAmbiguityWindow | [convex/bulkTransforms.ts:2551](../convex/bulkTransforms.ts#L2551) |
| `resetFailures` | `internalMutation` | jobId, phase | [convex/bulkTransforms.ts:2563](../convex/bulkTransforms.ts#L2563) |
| `resumeStaleJobs` | `internalMutation` | aucun | [convex/bulkTransforms.ts:2655](../convex/bulkTransforms.ts#L2655) |
| `listJobsForAssetCleanup` | `internalQuery` | aucun | [convex/bulkTransforms.ts:2831](../convex/bulkTransforms.ts#L2831) |
| `markAssetsCleaned` | `internalMutation` | jobId, cutoff, leaseStartedAt | [convex/bulkTransforms.ts:2872](../convex/bulkTransforms.ts#L2872) |
| `claimAssetsCleanup` | `internalMutation` | jobId, cutoff | [convex/bulkTransforms.ts:2903](../convex/bulkTransforms.ts#L2903) |
| `isAssetsCleanupLeaseActive` | `internalQuery` | jobId, leaseStartedAt | [convex/bulkTransforms.ts:2930](../convex/bulkTransforms.ts#L2930) |

### bulkTransformsNode

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `seedNextProduct` | `internalAction` | jobId | [convex/bulkTransformsNode.ts:142](../convex/bulkTransformsNode.ts#L142) |
| `transformNext` | `internalAction` | jobId | [convex/bulkTransformsNode.ts:262](../convex/bulkTransformsNode.ts#L262) |
| `publishNext` | `internalAction` | jobId | [convex/bulkTransformsNode.ts:402](../convex/bulkTransformsNode.ts#L402) |
| `rollbackNext` | `internalAction` | jobId | [convex/bulkTransformsNode.ts:865](../convex/bulkTransformsNode.ts#L865) |
| `cleanupExpiredAssets` | `internalAction` | aucun | [convex/bulkTransformsNode.ts:1143](../convex/bulkTransformsNode.ts#L1143) |
| `cleanupJobAssets` | `internalAction` | jobId, leaseStartedAt, cutoff | [convex/bulkTransformsNode.ts:1172](../convex/bulkTransformsNode.ts#L1172) |

### catalogueActions

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `work` | `internalAction` | id, generation | [convex/catalogueActions.ts:602](../convex/catalogueActions.ts#L602) |

### catalogues

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `context` | `internalQuery` | id | [convex/catalogues.ts:471](../convex/catalogues.ts#L471) |
| `shop` | `internalQuery` | id, owner | [convex/catalogues.ts:476](../convex/catalogues.ts#L476) |
| `claim` | `internalMutation` | id, generation, token | [convex/catalogues.ts:500](../convex/catalogues.ts#L500) |
| `checkpoint` | `internalMutation` | id, generation, token, work, structure, status, error, delay, exportKey, lastImport | [convex/catalogues.ts:544](../convex/catalogues.ts#L544) |
| `links` | `internalMutation` | id, generation, token, links | [convex/catalogues.ts:610](../convex/catalogues.ts#L610) |
| `page` | `internalQuery` | id, cursor, selected, group, limit | [convex/catalogues.ts:704](../convex/catalogues.ts#L704) |
| `byId` | `internalQuery` | id | [convex/catalogues.ts:736](../convex/catalogues.ts#L736) |
| `targetHandle` | `internalQuery` | id, handle, shopId | [convex/catalogues.ts:741](../convex/catalogues.ts#L741) |
| `result` | `internalMutation` | id, generation, token, productId, data, jsonSource, identity, error, state, attempts, remote | [convex/catalogues.ts:760](../convex/catalogues.ts#L760) |
| `resume` | `internalMutation` | aucun | [convex/catalogues.ts:908](../convex/catalogues.ts#L908) |
| `hold` | `internalMutation` | id, generation, token, work | [convex/catalogues.ts:925](../convex/catalogues.ts#L925) |
| `rankPage` | `internalMutation` | id, generation, token, initial, rank, products | [convex/catalogues.ts:938](../convex/catalogues.ts#L938) |
| `fillTop` | `internalMutation` | id, generation, token | [convex/catalogues.ts:1013](../convex/catalogues.ts#L1013) |

### generation

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `deleteFromStorage` | `internalAction` | storageUrl | [convex/generation.ts:100](../convex/generation.ts#L100) |
| `cleanupStaleOpenAiBatchReferences` | `internalAction` | aucun | [convex/generation.ts:107](../convex/generation.ts#L107) |
| `cleanupFailedOpenAiBatchReferences` | `internalAction` | segmentId | [convex/generation.ts:164](../convex/generation.ts#L164) |
| `submitBatch` | `internalAction` | jobId | [convex/generation.ts:174](../convex/generation.ts#L174) |
| `pollBatches` | `internalAction` | aucun | [convex/generation.ts:858](../convex/generation.ts#L858) |
| `pollBatchSegment` | `internalAction` | segmentId, attempt | [convex/generation.ts:888](../convex/generation.ts#L888) |
| `pollBatchJob` | `internalAction` | jobId, attempt | [convex/generation.ts:906](../convex/generation.ts#L906) |
| `processPostprocessingJob` | `internalAction` | jobId | [convex/generation.ts:1227](../convex/generation.ts#L1227) |
| `processPostprocessingBacklog` | `internalAction` | aucun | [convex/generation.ts:1255](../convex/generation.ts#L1255) |
| `processJob` | `internalAction` | jobId | [convex/generation.ts:1272](../convex/generation.ts#L1272) |

### googleFeed

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `saveDiagnostic` | `internalMutation` | shopId, status, attributes, checkedAt | [convex/googleFeed.ts:1048](../convex/googleFeed.ts#L1048) |
| `getActionContext` | `internalQuery` | userId | [convex/googleFeed.ts:1080](../convex/googleFeed.ts#L1080) |
| `getSyncCoordinates` | `internalQuery` | shopId | [convex/googleFeed.ts:1116](../convex/googleFeed.ts#L1116) |
| `assertActiveShop` | `internalQuery` | userId | [convex/googleFeed.ts:1125](../convex/googleFeed.ts#L1125) |
| `upsertSyncedVariants` | `internalMutation` | shopId, productId, variants, removeMissing | [convex/googleFeed.ts:1141](../convex/googleFeed.ts#L1141) |
| `getRulesForEvaluation` | `internalQuery` | userId | [convex/googleFeed.ts:1195](../convex/googleFeed.ts#L1195) |
| `evaluationPage` | `internalQuery` | userId, paginationOpts | [convex/googleFeed.ts:1256](../convex/googleFeed.ts#L1256) |
| `createRun` | `internalMutation` | userId, kind, source | [convex/googleFeed.ts:1326](../convex/googleFeed.ts#L1326) |
| `saveEvaluationProposals` | `internalMutation` | userId, runId, proposals | [convex/googleFeed.ts:1358](../convex/googleFeed.ts#L1358) |
| `claimPublishBatch` | `internalMutation` | userId, runId, retryRunId | [convex/googleFeed.ts:1434](../convex/googleFeed.ts#L1434) |
| `completePublishBatch` | `internalMutation` | runId, results | [convex/googleFeed.ts:1525](../convex/googleFeed.ts#L1525) |
| `finishRun` | `internalMutation` | runId | [convex/googleFeed.ts:1603](../convex/googleFeed.ts#L1603) |

### jobImagePublishing

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `nextProduct` | `internalQuery` | runId, afterPosition | [convex/jobImagePublishing.ts:221](../convex/jobImagePublishing.ts#L221) |
| `productForPush` | `internalQuery` | itemId | [convex/jobImagePublishing.ts:240](../convex/jobImagePublishing.ts#L240) |
| `recordProduct` | `internalMutation` | itemId, pushedImages, error | [convex/jobImagePublishing.ts:303](../convex/jobImagePublishing.ts#L303) |
| `finish` | `internalMutation` | runId | [convex/jobImagePublishing.ts:363](../convex/jobImagePublishing.ts#L363) |
| `workflowCompleted` | `internalMutation` | workflowId, result, context | [convex/jobImagePublishing.ts:425](../convex/jobImagePublishing.ts#L425) |
| `settleInterruptedProducts` | `internalMutation` | runId | [convex/jobImagePublishing.ts:465](../convex/jobImagePublishing.ts#L465) |
| `cleanupWorkflow` | `internalMutation` | workflowId | [convex/jobImagePublishing.ts:511](../convex/jobImagePublishing.ts#L511) |

### jobs

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `markRunning` | `internalMutation` | jobId | [convex/jobs.ts:674](../convex/jobs.ts#L674) |
| `nextQueuedImage` | `internalQuery` | jobId | [convex/jobs.ts:688](../convex/jobs.ts#L688) |
| `getJobInternal` | `internalQuery` | jobId | [convex/jobs.ts:701](../convex/jobs.ts#L701) |
| `imagesForJob` | `internalQuery` | jobId | [convex/jobs.ts:708](../convex/jobs.ts#L708) |
| `setBatchInfo` | `internalMutation` | jobId, batchId, batchStatus, batchInputFileName | [convex/jobs.ts:718](../convex/jobs.ts#L718) |
| `setBatchStatus` | `internalMutation` | jobId, batchStatus | [convex/jobs.ts:737](../convex/jobs.ts#L737) |
| `cancelInternal` | `internalMutation` | jobId, reason, batchStatus | [convex/jobs.ts:753](../convex/jobs.ts#L753) |
| `markImagesGenerating` | `internalMutation` | jobId, providerBatchId | [convex/jobs.ts:764](../convex/jobs.ts#L764) |
| `markBatchSubmitStarted` | `internalMutation` | jobId | [convex/jobs.ts:792](../convex/jobs.ts#L792) |
| `queuedImagesForBatchSubmission` | `internalQuery` | jobId, limit | [convex/jobs.ts:806](../convex/jobs.ts#L806) |
| `markAllBatchesSubmitted` | `internalMutation` | jobId | [convex/jobs.ts:827](../convex/jobs.ts#L827) |
| `markFirstResultReady` | `internalMutation` | jobId | [convex/jobs.ts:841](../convex/jobs.ts#L841) |
| `createBatchSegment` | `internalMutation` | jobId, provider, imageCount | [convex/jobs.ts:854](../convex/jobs.ts#L854) |
| `setBatchSegmentSubmitted` | `internalMutation` | segmentId, batchId, inputFileName, batchStatus | [convex/jobs.ts:881](../convex/jobs.ts#L881) |
| `setBatchSegmentStatus` | `internalMutation` | segmentId, status, batchStatus, error, ingestedCount, failedCount | [convex/jobs.ts:913](../convex/jobs.ts#L913) |
| `setBatchSegmentResultOffset` | `internalMutation` | segmentId, offset, fileIndex | [convex/jobs.ts:956](../convex/jobs.ts#L956) |
| `acquireBatchSegmentIngestion` | `internalMutation` | segmentId | [convex/jobs.ts:967](../convex/jobs.ts#L967) |
| `releaseBatchSegmentIngestion` | `internalMutation` | segmentId | [convex/jobs.ts:986](../convex/jobs.ts#L986) |
| `batchSegmentsForJob` | `internalQuery` | jobId | [convex/jobs.ts:998](../convex/jobs.ts#L998) |
| `batchSegmentInternal` | `internalQuery` | segmentId | [convex/jobs.ts:1008](../convex/jobs.ts#L1008) |
| `pendingBatchSegments` | `internalQuery` | aucun | [convex/jobs.ts:1015](../convex/jobs.ts#L1015) |
| `markSegmentImagesGenerating` | `internalMutation` | segmentId, imageIds, providerBatchId | [convex/jobs.ts:1030](../convex/jobs.ts#L1030) |
| `assignImagesToBatchSegment` | `internalMutation` | segmentId, imageIds | [convex/jobs.ts:1051](../convex/jobs.ts#L1051) |
| `imagesForBatchSegment` | `internalQuery` | segmentId | [convex/jobs.ts:1069](../convex/jobs.ts#L1069) |
| `pendingBatchJobs` | `internalQuery` | aucun | [convex/jobs.ts:1083](../convex/jobs.ts#L1083) |
| `acquireBatchIngestion` | `internalMutation` | jobId | [convex/jobs.ts:1098](../convex/jobs.ts#L1098) |
| `releaseBatchIngestion` | `internalMutation` | jobId | [convex/jobs.ts:1117](../convex/jobs.ts#L1117) |
| `setBatchResultOffset` | `internalMutation` | jobId, offset, fileIndex | [convex/jobs.ts:1129](../convex/jobs.ts#L1129) |
| `completeImage` | `internalMutation` | imageId, generatedImageUrl, storageUrl, providerBatchId, providerRequestId, providerResponseId, transparentCutoutUrl, backgroundRemovalProvider, backgroundRemovalCostUsd, backgroundRemovalRequestId, inputTokens, outputTokens, costUsd, costRateMultiplier, expectedPostProcessingStartedAt | [convex/jobs.ts:1140](../convex/jobs.ts#L1140) |
| `markImagePostprocessing` | `internalMutation` | imageId, inputUrl, inputContentType, inputExtension, providerBatchId, providerRequestId, providerResponseId, inputTokens, outputTokens, costUsd, costRateMultiplier, expectedSegmentId | [convex/jobs.ts:1340](../convex/jobs.ts#L1340) |
| `claimPostprocessingImages` | `internalMutation` | jobId, limit | [convex/jobs.ts:1390](../convex/jobs.ts#L1390) |
| `pendingPostprocessingJobs` | `internalQuery` | aucun | [convex/jobs.ts:1421](../convex/jobs.ts#L1421) |
| `markBackgroundRemovalStaged` | `internalMutation` | imageId, inputUrl, inputContentType, inputExtension, providerBatchId, providerRequestId, providerResponseId, inputTokens, outputTokens, costUsd, costRateMultiplier | [convex/jobs.ts:1432](../convex/jobs.ts#L1432) |
| `failImage` | `internalMutation` | imageId, error, providerBatchId, providerRequestId, providerResponseId, backgroundRemovalRequestId, deferSummary, expectedSegmentId, expectedPostProcessingStartedAt, batchRecoveryPending | [convex/jobs.ts:1472](../convex/jobs.ts#L1472) |
| `markImageGenerating` | `internalMutation` | imageId | [convex/jobs.ts:1533](../convex/jobs.ts#L1533) |
| `markImagePromptPrepared` | `internalMutation` | imageId, finalPromptUsed, vibeUsed | [convex/jobs.ts:1543](../convex/jobs.ts#L1543) |
| `retouchSourceForSave` | `internalQuery` | imageId | [convex/jobs.ts:1567](../convex/jobs.ts#L1567) |
| `insertRetouchedImage` | `internalMutation` | sourceImageId, storageUrl, saveMode | [convex/jobs.ts:1585](../convex/jobs.ts#L1585) |
| `failStuckJob` | `internalMutation` | jobId, error | [convex/jobs.ts:2135](../convex/jobs.ts#L2135) |
| `finishJobIfDone` | `internalMutation` | jobId | [convex/jobs.ts:2167](../convex/jobs.ts#L2167) |
| `finishSuccessfulBatchIfIdle` | `internalMutation` | jobId | [convex/jobs.ts:2192](../convex/jobs.ts#L2192) |

### openAiDurable

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `workflowCompleted` | `internalMutation` | workflowId, result, context | [convex/openAiDurable.ts:65](../convex/openAiDurable.ts#L65) |
| `cleanupWorkflow` | `internalMutation` | workflowId | [convex/openAiDurable.ts:105](../convex/openAiDurable.ts#L105) |
| `restartSegment` | `internalMutation` | segmentId | [convex/openAiDurable.ts:114](../convex/openAiDurable.ts#L114) |
| `initialize` | `internalMutation` | jobId, batchSize, concurrency | [convex/openAiDurable.ts:220](../convex/openAiDurable.ts#L220) |
| `resumeStarts` | `internalMutation` | aucun | [convex/openAiDurable.ts:280](../convex/openAiDurable.ts#L280) |
| `claim` | `internalMutation` | segmentId, token | [convex/openAiDurable.ts:308](../convex/openAiDurable.ts#L308) |
| `replaceUnacceptedSegment` | `internalMutation` | segmentId, expectedSubmissionKey, expectedInputFileId, expectedAttemptedAt, token, verifiedAbsentAt | [convex/openAiDurable.ts:335](../convex/openAiDurable.ts#L335) |
| `context` | `internalQuery` | segmentId | [convex/openAiDurable.ts:411](../convex/openAiDurable.ts#L411) |
| `imageForIngestion` | `internalQuery` | imageId | [convex/openAiDurable.ts:434](../convex/openAiDurable.ts#L434) |
| `saveReceipt` | `internalMutation` | segmentId, submissionKey, inputFileId, batchId, batchStatus | [convex/openAiDurable.ts:442](../convex/openAiDurable.ts#L442) |
| `saveRejection` | `internalMutation` | segmentId, submissionKey, inputFileId, error | [convex/openAiDurable.ts:475](../convex/openAiDurable.ts#L475) |
| `stopFailedSegment` | `internalMutation` | segmentId | [convex/openAiDurable.ts:507](../convex/openAiDurable.ts#L507) |
| `cancelledCheckpoint` | `internalMutation` | segmentId, cursor, matches, done, batchStatus | [convex/openAiDurable.ts:532](../convex/openAiDurable.ts#L532) |
| `checkpoint` | `internalMutation` | segmentId, token, phase, inputFileName, batchId, batchStatus, outputFileId, errorFileId, error, resultOffset, resultFileIndex, reconcileCursor, reconcileMatches, stepFailures, release, dispatch, submissionRejected | [convex/openAiDurable.ts:566](../convex/openAiDurable.ts#L566) |
| `claimReference` | `internalMutation` | jobId, productId, sourceUrl, token | [convex/openAiDurable.ts:659](../convex/openAiDurable.ts#L659) |
| `saveReference` | `internalMutation` | referenceId, token, url | [convex/openAiDurable.ts:703](../convex/openAiDurable.ts#L703) |
| `prepared` | `internalMutation` | segmentId, token, imageId, urls, prompt, vibe | [convex/openAiDurable.ts:723](../convex/openAiDurable.ts#L723) |
| `finish` | `internalMutation` | segmentId, token, error, resumeResults | [convex/openAiDurable.ts:761](../convex/openAiDurable.ts#L761) |

### openAiDurableActions

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `recoverUncertainSubmission` | `internalAction` | segmentId, expectedSubmissionKey, expectedInputFileId, expectedAttemptedAt, confirmResubmission | [convex/openAiDurableActions.ts:30](../convex/openAiDurableActions.ts#L30) |
| `advance` | `internalAction` | segmentId | [convex/openAiDurableActions.ts:99](../convex/openAiDurableActions.ts#L99) |
| `startJob` | `internalAction` | jobId | [convex/openAiDurableActions.ts:516](../convex/openAiDurableActions.ts#L516) |

### products

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `internalGet` | `internalQuery` | productId | [convex/products.ts:293](../convex/products.ts#L293) |
| `upsertSynced` | `internalMutation` | shopId, adoptLegacy, shopifyProductId, title, handle, vendor, productType, shopifyStatus, tags, collections, options, variants, metafields, googleProductCategory, googleProductCategoryDigest, featuredImageUrl, currentShopifyImages | [convex/products.ts:330](../convex/products.ts#L330) |
| `refreshFacets` | `internalMutation` | shopId | [convex/products.ts:409](../convex/products.ts#L409) |
| `setVibe` | `internalMutation` | productId, vibe, costUsd | [convex/products.ts:442](../convex/products.ts#L442) |
| `updateGenerationStatus` | `internalMutation` | productId, generationStatus | [convex/products.ts:458](../convex/products.ts#L458) |

### retouch

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `deletePreparedRetouchSource` | `internalAction` | storageId | [convex/retouch.ts:71](../convex/retouch.ts#L71) |

### settings

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `internalList` | `internalQuery` | shopId | [convex/settings.ts:51](../convex/settings.ts#L51) |

### shopify

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `createShopifyOauthAttempt` | `internalMutation` | stateHash, shopId, userId, shopDomain, expiresAt | [convex/shopify.ts:156](../convex/shopify.ts#L156) |
| `getShopifyOauthAttempt` | `internalQuery` | stateHash | [convex/shopify.ts:182](../convex/shopify.ts#L182) |
| `completeShopifyOauthAttempt` | `internalMutation` | stateHash, shopDomain, accessToken, scopes | [convex/shopify.ts:204](../convex/shopify.ts#L204) |
| `pushJobProductImages` | `internalAction` | itemId | [convex/shopify.ts:1508](../convex/shopify.ts#L1508) |
| `selectedImagesForPush` | `internalQuery` | productId, imageIds | [convex/shopify.ts:1529](../convex/shopify.ts#L1529) |
| `generatedImagesForPush` | `internalQuery` | productId | [convex/shopify.ts:1548](../convex/shopify.ts#L1548) |
| `promptOrder` | `internalQuery` | shopId | [convex/shopify.ts:1568](../convex/shopify.ts#L1568) |
| `markImagePushed` | `internalMutation` | imageId, pushRunId, shopifyMediaId, publishedShopifyProductId | [convex/shopify.ts:1582](../convex/shopify.ts#L1582) |
| `markProductPushed` | `internalMutation` | productId | [convex/shopify.ts:1613](../convex/shopify.ts#L1613) |
| `cacheProductImageOrder` | `internalMutation` | productId, orderedMediaIds | [convex/shopify.ts:1620](../convex/shopify.ts#L1620) |
| `internalGetImage` | `internalQuery` | imageId | [convex/shopify.ts:1647](../convex/shopify.ts#L1647) |
| `deleteImageRecord` | `internalMutation` | imageId | [convex/shopify.ts:1657](../convex/shopify.ts#L1657) |
| `staleRejectedImagesForCleanup` | `internalQuery` | cutoff, limit | [convex/shopify.ts:1690](../convex/shopify.ts#L1690) |
| `cleanupStaleRejectedImages` | `internalAction` | aucun | [convex/shopify.ts:1716](../convex/shopify.ts#L1716) |

### shopifyPublications

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `claim` | `internalMutation` | productId, fingerprint, token | [convex/shopifyPublications.ts:35](../convex/shopifyPublications.ts#L35) |
| `fail` | `internalMutation` | productId, token, error | [convex/shopifyPublications.ts:97](../convex/shopifyPublications.ts#L97) |
| `complete` | `internalMutation` | productId, token, result | [convex/shopifyPublications.ts:121](../convex/shopifyPublications.ts#L121) |
| `beginSibling` | `internalMutation` | productId, token, groupId | [convex/shopifyPublications.ts:140](../convex/shopifyPublications.ts#L140) |
| `recordSibling` | `internalMutation` | productId, token, groupId, targetProductId | [convex/shopifyPublications.ts:160](../convex/shopifyPublications.ts#L160) |
| `mediaForImages` | `internalQuery` | targetProductId, images | [convex/shopifyPublications.ts:180](../convex/shopifyPublications.ts#L180) |
| `beginMedia` | `internalMutation` | productId, token, targetProductId, baselineMediaIds, images | [convex/shopifyPublications.ts:204](../convex/shopifyPublications.ts#L204) |
| `recordMedia` | `internalMutation` | productId, token, media | [convex/shopifyPublications.ts:263](../convex/shopifyPublications.ts#L263) |
| `adoptUploadedMedia` | `internalMutation` | productId, token, targetProductId, images | [convex/shopifyPublications.ts:296](../convex/shopifyPublications.ts#L296) |

### shops

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `getShopifyCredentials` | `internalQuery` | shopId, userId | [convex/shops.ts:122](../convex/shops.ts#L122) |
| `ensureActiveForAction` | `internalMutation` | userId | [convex/shops.ts:141](../convex/shops.ts#L141) |

### users

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `isApprovedForAuthz` | `internalQuery` | userId | [convex/users.ts:43](../convex/users.ts#L43) |

### visualGroupAnalysis

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `analyzeConfiguredProduct` | `internalAction` | productId, userId | [convex/visualGroupAnalysis.ts:349](../convex/visualGroupAnalysis.ts#L349) |

### visualGroups

| Fonction | Nature actuelle | Arguments | Source |
| --- | --- | --- | --- |
| `publicationMode` | `internalQuery` | productId | [convex/visualGroups.ts:600](../convex/visualGroups.ts#L600) |
| `analysisContext` | `internalQuery` | productId, userId | [convex/visualGroups.ts:616](../convex/visualGroups.ts#L616) |
| `setAnalysisStatus` | `internalMutation` | configId, status, model, costUsd, error | [convex/visualGroups.ts:632](../convex/visualGroups.ts#L632) |
| `applyAnalysis` | `internalMutation` | configId, assignments, model, costUsd | [convex/visualGroups.ts:657](../convex/visualGroups.ts#L657) |
| `groupTargets` | `internalQuery` | groupIds | [convex/visualGroups.ts:764](../convex/visualGroups.ts#L764) |
| `createFamily` | `internalMutation` | sourceProductId, members | [convex/visualGroups.ts:795](../convex/visualGroups.ts#L795) |
| `familyForSource` | `internalQuery` | sourceProductId | [convex/visualGroups.ts:856](../convex/visualGroups.ts#L856) |

## 5. Éléments ajoutés par les composants

- Convex Auth : six tables injectées dans le schéma principal par `...authTables` : `authSessions`, `authAccounts`, `authRefreshTokens`, `authVerificationCodes`, `authVerifiers`, `authRateLimits`. `users` est redéfini dans le schéma métier. Les routes Auth sont montées par `auth.addHttpRoutes(http)`. Ces tables Auth ne sont pas isolées dans un composant comme celles de Workflow.
- `@convex-dev/workflow` : exécutions durables et étapes ; workflows OpenAI Batch et publication multi-produits. Leurs tables vivent dans le composant, pas dans `convex/schema.ts`.
- Workflows supplémentaires : `openAiDurable.segmentWorkflow({ segmentId })` et `jobImagePublishing.publishWorkflow({ runId })`, utilisés comme fonctions internes.
- HTTP explicite : `GET /shopify/oauth/callback`, signature HMAC, état haché, jeton offline puis redirection vers les paramètres.

La future API peut regrouper ces opérations par ressource métier. Le contrat à conserver est le comportement documenté, pas le nom des fonctions Convex.

## 6. Objets partagés des arguments

Les spreads et les arguments passés par nom sont développés dans les champs du JSON et les listes de la surface API. Définitions partagées utiles :

### backgroundConfigArgValidators

Source : [convex/background.ts:35](../convex/background.ts#L35).

```ts
{ removeBackground: v.optional(v.boolean()), backgroundMode: v.optional(backgroundModeValidator), backgroundColor: v.optional(v.string()), backgroundShadow: v.optional(v.boolean()), }
```

### fenceArgs

Source : [convex/catalogues.ts:486](../convex/catalogues.ts#L486).

```ts
{ id: v.id("catalogues"), generation: v.number(), token: v.string(), }
```

### productFilterArgs

Source : [convex/products.ts:94](../convex/products.ts#L94).

```ts
{ search: v.optional(v.string()), productType: v.optional(v.string()), collection: v.optional(v.string()), shopifyStatus: v.optional(v.string()), primaryAction: v.optional(productPrimaryAction), generationState: v.optional(productGenerationState), reviewState: v.optional(productReviewState), publishState: v.optional(productPublishState), generationStatus: v.optional(productGenerationStatus) }
```

