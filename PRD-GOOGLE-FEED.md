# PRD — Gestion du flux Google Merchant Center

## Statut du document

- **Statut** : cadrage initial
- **Date** : 4 août 2026
- **Périmètre** : gestion des attributs Google au niveau des produits et variantes Shopify
- **Document frontend associé** : [PRD-GOOGLE-FEED-FRONTEND.md](./PRD-GOOGLE-FEED-FRONTEND.md)
- **Étape suivante** : génération de la fonctionnalité à partir des deux PRD

## 1. Résumé

L'application doit proposer un espace générique de gestion du flux Google Merchant Center. Cet espace permettra à chaque boutique Shopify de consulter, compléter et modifier en masse les attributs Google portés par les produits et leurs variantes, puis d'automatiser leur attribution grâce à des règles configurables propres à la boutique.

La première version cible trois attributs :

- `google_product_category`, au niveau du produit ;
- `gender`, au niveau de la variante, avec une valeur normalement commune à toutes les variantes d'un produit ;
- `age_group`, au niveau de la variante, avec la possibilité d'avoir plusieurs groupes d'âge au sein d'un même produit selon la taille ou la pointure.

Les correspondances métier ne doivent jamais être codées en dur. Le moteur est commun à toutes les boutiques, mais les règles, priorités, plages de tailles et choix d'écrasement sont enregistrés séparément pour chaque boutique.

## 2. Contexte et problème

Google Merchant Center utilise des attributs structurés pour classer et diffuser correctement les produits dans Google Ads. Shopify ne fournit pas, dans le flux de travail actuel de la boutique, une expérience suffisamment efficace pour modifier en masse les valeurs situées sur les variantes.

Le marchand doit aujourd'hui gérer des valeurs telles que le genre et le groupe d'âge variante par variante. Cette opération devient lente et risquée à l'échelle du catalogue, alors que la plupart des valeurs peuvent être déduites de données Shopify existantes : titre du produit, collections, tags, type de produit, nom de variante, option de taille ou pointure.

## 3. Objectifs

Le module doit permettre de :

1. vérifier que l'environnement Shopify est compatible avant toute lecture ou écriture métier ;
2. centraliser les produits, variantes et attributs Google dans une vue opérationnelle ;
3. modifier les attributs manuellement et en masse ;
4. définir des règles d'attribution propres à chaque boutique ;
5. prévisualiser l'effet des règles avant publication ;
6. publier les valeurs vers Shopify avec un suivi clair des réussites et erreurs ;
7. conserver une architecture générique, réutilisable sur d'autres boutiques et catalogues.

## 4. Principes produit

- **Configuration par boutique** : aucune collection, pointure ou convention de nommage n'est intégrée au code.
- **Contrôle humain** : aucune publication automatique silencieuse dans la première version.
- **Prévisualisation avant écriture** : le marchand voit les changements proposés, leur origine et les conflits éventuels.
- **Écriture sûre** : seules les valeurs modifiées et validées sont envoyées à Shopify.
- **Compatibilité vérifiée** : aucune écriture n'est tentée tant que les définitions de metafields ne sont pas valides et accessibles.
- **Traçabilité** : chaque exécution indique les règles appliquées, les valeurs modifiées et les erreurs rencontrées.

## 5. Prérequis et diagnostic Shopify

L'espace Flux Google doit commencer par un diagnostic de la boutique.

Le contexte attendu est l'un des suivants :

- l'application Shopify **Google & YouTube** est installée ;
- des définitions de metafields compatibles existent déjà dans la boutique.

Dans tous les cas, la présence de l'application seule ne suffit pas à autoriser les écritures. Le module doit vérifier les définitions réellement disponibles.

Pour chaque attribut, le diagnostic doit contrôler :

- le namespace et la clé exacts ;
- le type de valeur ;
- le type de propriétaire Shopify ;
- l'accès en lecture ;
- l'accès en écriture par l'application ;
- la compatibilité des valeurs existantes avec les valeurs attendues par Google.

| Attribut | Propriétaire attendu | Cardinalité fonctionnelle |
|---|---|---|
| `google_product_category` | Produit | Une valeur par produit |
| `gender` | Variante | Une valeur par variante, normalement identique dans le produit |
| `age_group` | Variante | Une valeur par variante, potentiellement différente dans le produit |

Le diagnostic doit aboutir à un état explicite :

- **Prêt** : les trois attributs sont valides et accessibles ;
- **Partiellement prêt** : certains attributs seulement peuvent être gérés ;
- **Bloqué** : aucune écriture sûre n'est possible.

Les coordonnées validées des metafields doivent être enregistrées dans la configuration de la boutique. Le module ne doit pas créer silencieusement de nouvelles définitions ni dupliquer celles d'une autre application.

## 6. Modèle fonctionnel des attributs

### 6.1 Google Product Category

- La valeur est gérée au niveau du produit.
- Elle s'applique fonctionnellement à toutes les variantes du produit.
- Elle peut être modifiée manuellement, en masse ou par une règle produit.
- Les règles peuvent s'appuyer notamment sur le titre, le type, les tags, le vendeur ou les collections du produit.

### 6.2 Gender

- La valeur est écrite sur chaque variante.
- L'interface la présente comme une propriété commune du produit.
- Une modification de genre sur un produit cible toutes ses variantes.
- Les valeurs Google prises en charge dans le périmètre initial sont `male`, `female` et `unisex`.
- Si les variantes d'un produit contiennent des valeurs différentes, l'interface signale une incohérence avant toute modification.

### 6.3 Age Group

- La valeur est gérée variante par variante.
- Un même produit peut comporter plusieurs groupes d'âge.
- Chaque variante ne reçoit qu'une seule valeur.
- Les valeurs Google prises en charge sont `newborn`, `infant`, `toddler`, `kids` et `adult`.
- L'attribution peut notamment dépendre du nom de la variante, du nom d'une option ou de sa valeur : taille, pointure, âge ou autre convention propre à la boutique.
- Une variante couvrant plusieurs groupes d'âge doit être signalée comme ambiguë ou résolue par une règle métier explicite.

## 7. Vue de gestion du catalogue

Le module doit afficher les produits déjà synchronisés avec l'application et leurs variantes. Les données utiles comprennent au minimum :

- identifiants Shopify du produit et de la variante ;
- titre du produit ;
- titre de la variante ;
- SKU ;
- options et valeurs de variante ;
- type de produit, vendeur, tags et collections ;
- catégorie Google actuelle ;
- genre actuel ;
- groupe d'âge actuel ;
- état de synchronisation et éventuelle erreur.

Le marchand doit pouvoir :

- rechercher un produit ou un SKU ;
- filtrer par collection, type, attribut manquant, valeur actuelle ou erreur ;
- sélectionner plusieurs produits ou variantes ;
- appliquer une valeur en masse ;
- distinguer la valeur Shopify actuelle, la valeur proposée et la valeur qui sera publiée ;
- annuler des changements non publiés ;
- publier uniquement la sélection souhaitée.

## 8. Moteur de règles par boutique

Les règles sont enregistrées dans la base de l'application et rattachées à l'identifiant de la boutique. Elles ne sont pas stockées en dur dans le code et ne sont pas partagées entre boutiques.

Une règle contient au minimum :

- un nom ;
- un statut actif ou inactif ;
- une priorité ;
- une cible : produit ou variante ;
- un attribut cible ;
- une ou plusieurs conditions ;
- une action d'attribution ;
- une politique d'écrasement ;
- les dates de création et modification.

### 8.1 Sources utilisables dans les conditions

- titre du produit ;
- type de produit ;
- vendeur ;
- tags ;
- collections ;
- titre de la variante ;
- nom d'une option ;
- valeur d'une option ;
- SKU ;
- valeur actuelle d'un attribut Google.

### 8.2 Opérateurs initiaux

- est égal à / n'est pas égal à ;
- contient / ne contient pas ;
- commence par / se termine par ;
- appartient à une liste ;
- est vide / n'est pas vide ;
- est compris dans une plage numérique lorsque la valeur peut être interprétée comme un nombre.

Les règles doivent pouvoir combiner des conditions avec une logique **ET** ou **OU**.

### 8.3 Actions initiales

- attribuer une catégorie Google au produit ;
- attribuer un genre à toutes les variantes du produit ;
- attribuer un groupe d'âge aux variantes correspondantes.

### 8.4 Priorités et conflits

- Les règles sont évaluées dans un ordre de priorité défini par la boutique.
- Lorsqu'au moins deux règles proposent des valeurs différentes pour le même attribut, le conflit doit être visible dans la prévisualisation.
- Par défaut, une valeur manuelle validée ne doit pas être écrasée par une règle.
- Une règle peut être configurée pour remplir uniquement les valeurs vides ou remplacer les valeurs existantes.
- L'origine de chaque valeur proposée doit rester consultable.

### 8.5 Exemple de configuration marchande

Ces exemples illustrent le moteur et ne constituent pas des règles par défaut :

- si la collection est « Femme », attribuer `female` à toutes les variantes ;
- si l'option « Pointure » appartient à une plage configurée, attribuer `toddler` ;
- si le type de produit est « Sandales », attribuer une catégorie Google sélectionnée par le marchand.

## 9. Prévisualisation et publication

Le flux de travail cible est :

1. synchroniser ou actualiser les produits et valeurs Shopify ;
2. exécuter les règles actives sur le catalogue ou sur une sélection ;
3. afficher les valeurs actuelles et proposées ;
4. signaler les conflits, ambiguïtés et valeurs invalides ;
5. permettre au marchand de corriger ou exclure certaines propositions ;
6. confirmer la publication ;
7. écrire les metafields par lots dans Shopify ;
8. relire les valeurs publiées et présenter le résultat final.

Les écritures utilisent l'Admin API Shopify et doivent être effectuées avec `metafieldsSet`. Une exécution doit être idempotente : relancer une publication ne doit pas créer de doublon ni modifier inutilement des valeurs déjà correctes.

En cas d'échec partiel, les réussites sont conservées et seules les lignes en erreur doivent pouvoir être relancées.

## 10. Données propres à chaque boutique

La séparation entre boutiques doit couvrir au minimum :

- la configuration des metafields détectés ;
- les règles et leur priorité ;
- les plages de tailles ou pointures ;
- les politiques d'écrasement ;
- les brouillons de modifications ;
- l'historique d'exécution ;
- les préférences futures du module.

Aucune boutique ne doit pouvoir lire, exécuter ou modifier les règles d'une autre boutique.

## 11. Historique et audit

Chaque publication doit conserver :

- la boutique concernée ;
- la date et l'auteur de l'action lorsqu'il est disponible ;
- le périmètre de produits et variantes ;
- les règles exécutées ;
- les anciennes et nouvelles valeurs ;
- le nombre de réussites, d'éléments ignorés et d'erreurs ;
- le détail utile des erreurs Shopify.

## 12. Exigences non fonctionnelles

- Supporter un catalogue volumineux grâce à la pagination et aux traitements par lots.
- Respecter les limites de débit de l'Admin API Shopify.
- Ne jamais exposer de secret Shopify dans le navigateur.
- Préserver les modifications utilisateur en cas d'échec partiel.
- Afficher une progression compréhensible pour les synchronisations et publications longues.
- Garantir l'isolation des données par boutique.
- Rendre les opérations de publication vérifiables et rejouables.

## 13. Périmètre de livraison proposé

### Phase 1 — Diagnostic et édition manuelle

- diagnostic des définitions et accès ;
- lecture des trois attributs ;
- vue produits et variantes ;
- filtres et recherche ;
- modification unitaire et en masse ;
- prévisualisation et publication contrôlée.

### Phase 2 — Règles configurables

- création, modification, activation et priorisation des règles ;
- conditions produit et variante ;
- attribution des trois attributs ;
- détection des conflits ;
- prévisualisation avant publication.

### Phase 3 — Automatisation et suivi avancé

- exécution planifiée ou déclenchée lors des synchronisations ;
- politiques automatiques approuvées par le marchand ;
- historique détaillé et relance ciblée ;
- extension éventuelle à d'autres attributs du flux Google.

## 14. Hors périmètre initial

- création silencieuse de metafields incompatibles avec Google & YouTube ;
- modification automatique sans prévisualisation ni validation ;
- règles métier codées pour une boutique particulière ;
- gestion complète de tous les attributs Google Merchant Center ;
- modification directe du compte Google Merchant Center en dehors des données transmises par Shopify ;
- génération ou traitement d'images.

## 15. Critères d'acceptation du MVP

Le MVP est accepté lorsque :

1. le module identifie les définitions utilisées pour les trois attributs et bloque les écritures incompatibles ;
2. les produits et variantes affichent leurs valeurs Shopify actuelles ;
3. la catégorie Google peut être modifiée au niveau du produit ;
4. le genre peut être défini une fois puis appliqué à toutes les variantes du produit ;
5. le groupe d'âge peut être modifié indépendamment pour chaque variante ;
6. les changements peuvent être appliqués en masse sur une sélection ;
7. le marchand voit précisément les changements avant publication ;
8. la publication met à jour Shopify et confirme les valeurs effectivement enregistrées ;
9. les erreurs partielles sont visibles et peuvent être relancées ;
10. toutes les configurations et données de travail sont isolées par boutique.

## 16. Questions ouvertes pour les prochaines étapes

- Quelles sont les définitions exactes actuellement présentes dans la boutique : namespace, clé, type et propriétaire ?
- Quelles conventions de nommage sont utilisées pour les options de taille et de pointure ?
- Quelles plages réelles correspondent à `newborn`, `infant`, `toddler`, `kids` et `adult` dans cette boutique ?
- Comment présenter au mieux la relation entre une valeur de genre commune au produit et son stockage sur chaque variante ?
- Quel niveau de densité, de regroupement et d'édition en ligne convient le mieux à la future interface ?
