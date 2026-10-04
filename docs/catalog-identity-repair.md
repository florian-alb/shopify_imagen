# Réparation de la définition Shopify des identifiants catalogue

## Diagnostic vérifié le 25 septembre 2026

Boutique Peluche, `dp2iki-0b.myshopify.com` (domaine public `https://pluschwelt.com`). Le diagnostic en lecture seule retourne la définition PRODUCT `imagen_catalog.source_id`, ID `gid://shopify/MetafieldDefinition/490507534600`, type `single_line_text_field`, unicité activée et **0 valeur associée**. Shopify exige le type `id` pour `productByIdentifier` et `productSet` avec `customId`.

Le code corrigé crée désormais une définition et des valeurs de type `id`. Une définition texte existante déclenche une erreur explicite ; elle n'est jamais supprimée automatiquement. La définition COLLECTION reste indépendante et de type texte.

## Intervention exécutée le 25 septembre 2026

Après autorisation explicite de l'utilisateur, la définition vide a été remplacée sur **Peluche uniquement**. Le contrôle juste avant suppression confirmait toujours zéro valeur. Nouvelle définition : `gid://shopify/MetafieldDefinition/490521133320`, type `id`, unicité active, zéro valeur. Une recherche `productByIdentifier(customId)` avec une valeur de contrôle inexistante a réussi et retourné `null`, sans erreur Shopify. Aucun produit modifié, aucun import relancé.

L'intervention a utilisé une action interne temporaire sur Convex développement `curious-greyhound-437`, verrouillée sur le domaine de Peluche et l'ancienne définition. Cette action a été retirée après exécution. Le connecteur Shopify générique étant lié à Maison Patine, aucune écriture n'y a été effectuée. Aucun déploiement Convex de production n'a été modifié.

## Procédure utilisée (archive, ne pas réexécuter)

Une nouvelle intervention nécessite sa propre vérification et autorisation. Les identifiants ci-dessous documentent l'ancienne définition désormais supprimée. La correction du code est déployée en développement ; l'import réel n'a pas été qualifié par cette réparation.

1. Vérifier que les imports sont arrêtés. Relire la définition avec les identifiants de **cette boutique**, vérifier l'ID, le propriétaire PRODUCT, le namespace, la clé et le compteur toujours nul. Si des valeurs existent, arrêter : cette procédure ne couvre pas leur migration.
2. Supprimer uniquement la définition vide avec l'opération ci-dessous, en conservant `deleteAllAssociatedMetafields: false`. Vérifier l'absence de `userErrors` et l'ID supprimé.
3. Recréer immédiatement la définition avec la même clé et le type `id`. Vérifier l'absence de `userErrors`.
4. Relire la définition : type `id`, unicité active, compteur nul. Vérifier une recherche `productByIdentifier` en lecture seule. Aucun produit n'est créé par cette procédure.
5. La reprise d'un import réel reste une action distincte nécessitant l'autorisation utilisateur.

Opérations validées contre le schéma Shopify et exécutées lors de cette intervention :

```graphql
mutation RemoveEmptyCatalogIdentityDefinition($id: ID!) {
  metafieldDefinitionDelete(id: $id, deleteAllAssociatedMetafields: false) {
    deletedDefinitionId
    userErrors { field message code }
  }
}
```

Variables : `{"id":"gid://shopify/MetafieldDefinition/490507534600"}`.

```graphql
mutation CreateCatalogIdentityDefinition($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) {
    createdDefinition { id }
    userErrors { field message code }
  }
}
```

```json
{
  "definition": {
    "name": "Identifiant source Imagen",
    "namespace": "imagen_catalog",
    "key": "source_id",
    "ownerType": "PRODUCT",
    "type": "id"
  }
}
```

Les deux mutations ne sont pas atomiques. Si la création échoue après suppression, garder les imports arrêtés et reprendre la création après diagnostic. Tant que la nouvelle définition reste vide, revenir à une définition texte unique est possible par suppression/recréation, mais rétablit l'erreur initiale. Après création de valeurs, ne plus appliquer cette procédure de remplacement : préserver et migrer les identités afin d'éviter les doublons.
