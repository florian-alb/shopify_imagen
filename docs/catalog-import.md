# Import de catalogue Shopify

Le module est accessible dans **Import de catalogue**, à `/catalog-import`. Il collecte une boutique publique Shopify, prépare ses règles SEO, génère un JSON privé et importe les collections choisies dans une boutique connectée. Il ne publie pas les produits et n’affecte pas le menu au thème.

Pour reprendre le développement du module avec une IA, lire [le contexte technique du catalogue de travail](catalog-workspace-context.md) : architecture Convex/R2, contrats, parcours, pièges connus et validations restantes.

## Configuration

Configurer côté **Convex**, jamais dans des variables `VITE_` :

| Variable | Rôle |
| --- | --- |
| `CATALOG_R2_BUCKET` | Bucket privé distinct de `R2_BUCKET` ; désactiver le domaine public et l’accès r2.dev. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Identifiants existants avec accès lecture/écriture au bucket privé. |
| `CATALOG_BROWSERLESS_URL` | Endpoint Chromium géré `wss://…browserless.io`, facultatif pour les thèmes lisibles en HTML. |
| `CATALOG_BROWSERLESS_TOKEN` | Jeton du navigateur distant. |
| `GEMINI_API_KEY` | Suggestions facultatives. |
| `CATALOG_CLASSIFIER_MODEL` | Par défaut `gemini-2.5-flash-lite`. |
| `SHOPIFY_API_VERSION` | `2026-04`, version de validation du contrat GraphQL et des identités personnalisées. |

L’écran d’accueil indique les services configurés. Le bucket n’est pas créé automatiquement. Les liens de téléchargement expirent après cinq minutes. L’accès à chaque opération et à chaque boutique de destination est contrôlé côté serveur.

L’application Shopify cible doit autoriser `write_products`, `write_files` et `write_online_store_navigation`. Publier la configuration de l’application personnalisée, puis utiliser **Réautoriser les accès catalogue**. Le scope de navigation est demandé uniquement pour ce parcours ; les autres fonctions d’Imagen conservent leurs exigences actuelles.

## Parcours

1. Entrer le domaine et choisir le menu sélectionné ou tout le catalogue public.
2. Vérifier le menu hiérarchique et les collections. L’éditeur permet de renommer, ajouter, retirer et réordonner les rubriques.
3. Définir les tags et les conditions ET/OU. Les propositions Gemini restent non validées jusqu’à la validation humaine. Les suggestions de tags sont en anglais uniquement (`rabbit`, `large`), indépendamment de la langue du site source. Aucun plafond total de tokens ne bloque les appels IA. La consommation reste suivie : une estimation de 66 000 tokens est ajustée à la consommation déclarée après réponse ; une requête interrompue conserve son estimation. Les anciennes propositions doivent être régénérées, puis validées ; les corrections manuelles restent à vérifier en anglais.
4. Lancer la collecte : pages de collections, sitemap optionnel, déduplication des liens, puis `.json` et HTML de chaque produit. Les thèmes à listes imbriquées Dawn/Horizon et le menu à composants de Kuscheltierland disposent de profils de lecture.
5. Vérifier les produits, les rubriques, les variantes, les conflits de taille et les tags. La sélection de collection dans la liste prévisualise les règles automatiques, y compris les collections ajoutées manuellement. Une variante conforme suffit pour le seuil de taille ; les contradictions sont signalées.
6. Générer l’export. Accepter explicitement le caractère partiel si des erreurs subsistent.
7. Choisir une boutique, vérifier ses accès, sélectionner les collections validées puis confirmer l’import. Les produits sont créés en brouillon et les images transférées par Shopify. Un menu distinct est créé, dans la limite Shopify de trois niveaux.

Les titres et contenus conservent leur langue. Les certifications et âges recommandés restent des déclarations de la source. Les rubriques commerciales globales, livraison, retours et avis sont exclues des sections supplémentaires.

## Stockage et reprise

Depuis la refonte, Convex contient le catalogue de travail des nouveaux exports et des exports migrés, en plus des opérations, baux et tâches. Les catalogues non migrés conservent le lecteur legacy R2. Voir [la procédure de migration et le contrat du stockage](catalog-workspace-migration.md). Les tâches de produits regroupent 25 références et avancent par cinq fiches. La découverte des collections est planifiée par groupes de 50 et l’index est partitionné en 256 compartiments.

R2 conserve les sources brutes, checkpoints, reçus et snapshots immuables. Les chemins `products/`, `summaries/`, `preparation/`, `overrides/` et `identities/` ci-dessous sont des archives legacy pour un catalogue migré ; la collecte migrée écrit les données normalisées dans Convex. La racine effective vient de l’opération, elle ne doit pas être reconstruite depuis son identifiant.

Organisation legacy et archives :

```text
catalog-exports/{owner}/{export}/
  raw/{handle}/product.json, page.html
  discovery/{collection}/{page}.json
  indexes/discovery/{bucket}.json
  identities/{shopifyId}.json
  products/{canonicalHandle}.json
  summaries/{canonicalHandle}.json
  product-checkpoints/{task}/{inputHash}/{handle}.json
  preparation/{revision}-{token}.json
  overrides/{revision}-{token}/{bucket}.json
  inputs/{task}-{inputHash}.json
  receipts/{task}/{inputHash}.json
  final/{revision}/catalogue.json
  final/{revision}/preparation.json
  final/{revision}/products/{canonicalHandle}.json
  imports/{shop}/{import}/state.json, bulk/, mappings/, errors/, result.json
```

Une fiche dont le JSON réussit et le HTML échoue conserve son JSON ; **Relancer cette fiche** ne retélécharge que la source manquante. Le checkpoint stocke les deltas de compteurs avant de remplacer la fiche : rejouer l’écriture R2 ne transforme pas une réussite en double comptage. Les alias sont rapprochés par identifiant Shopify, jamais par titre ou SKU.

Les validations Convex vérifient la génération du worker. Les écritures R2 utilisent également une génération et des conditions ETag pour rejeter le remplacement par un worker ancien. Le bail de quinze minutes dépasse le plafond de dix minutes des actions Convex ; le watchdog examine les opérations inactives après seize minutes. Ne pas raccourcir ce bail sans adapter les garanties d’exécution et les uploads multipart.

L’assemblage écrit des parties multipart bornées, avec buffers intermédiaires immuables. Un objet final déjà terminé permet de récupérer une réponse de finalisation perdue. Chaque révision conserve les produits utilisés par les imports : les corrections ultérieures du catalogue n’altèrent pas un import déjà démarré.

**Pause** termine le checkpoint en cours. Les échecs réseau sont retentés jusqu’à quatre fois avec temporisation croissante ; un 403/challenge interrompt la collecte. La fermeture du navigateur ne stoppe pas le travail serveur.

## Import et identités

L’identité distante produit est le metafield `imagen_catalog.source_id` de type Shopify **`id`** (unicité automatique) : domaine source sans `www` + identifiant Shopify source. Sa définition est vérifiée avant import. Un `single_line_text_field`, même doté de `uniqueValues`, est incompatible avec `productByIdentifier(customId)` et `productSet(identifier.customId)`. Une ancienne définition texte doit être réparée explicitement en préservant ses valeurs ; le code ne la supprime pas automatiquement. Le marqueur de collection portant la même clé reste un champ texte sur le propriétaire `COLLECTION` et ne doit pas être confondu avec cette définition `PRODUCT`. Les produits existants reçoivent les tags manquants via `tagsAdd` ; leurs tags manuels et leurs listes de variantes ne sont pas remplacés.

Les collections utilisent un handle déterministe composé du handle source et d’un suffixe lié aux règles. Un marqueur vérifie qu’une collection retrouvée appartient à cet import. Une modification des règles génère une nouvelle collection plutôt que d’écraser une collection existante. Chaque import crée son propre menu, sans remplacer celui de la boutique.

Les créations de produits passent par les opérations Shopify en masse. Le journal R2 conserve les variables, l’identifiant de soumission, l’identifiant d’opération et les résultats par ligne. Une soumission à résultat incertain est recherchée dans les opérations récentes ; si la preuve manque, le lot reste en erreur au lieu d’être soumis aveuglément. Les résultats partiels et lignes absentes deviennent des erreurs explicites.

Les produits créés sont relus : identité, nombre de variantes, tags, médias et appartenances automatiques. Le rapport d’activité montre les erreurs par produit et le handle du menu. Une nouvelle importation retrouve les produits déjà créés. Une seconde passe réécrit les liens vers les produits et collections importés après création des correspondances ; les destinations internes non résolues sont retirées et signalées dans le rapport. Ces avertissements de liens n’empêchent pas l’état terminé : le rapport doit être contrôlé avant publication. Les transferts d’images échoués reçoivent une tentative supplémentaire, consignée avant l’appel Shopify, uniquement si l’URL d’origine retournée correspond exactement à une source unique. Si Shopify ne fournit pas cette preuve, une correction dans Shopify est signalée ; la position dans la liste des médias ne sert jamais d’identité.

## Conservation

Les sauvegardes et correspondances sont conservées sans suppression automatique : elles servent à la reprise et à la déduplication entre imports. Les URL d’images dépendent du site source ; aucun archivage binaire n’est effectué.

Configurer dans R2 une règle d’abandon des **uploads multipart incomplets après sept jours**. Ne pas appliquer une expiration générale au bucket : elle effacerait également les snapshots référencés par des imports. La suppression d’exports complets et de leurs correspondances doit être une opération d’exploitation explicite après vérification des imports dépendants.

## Validation et limites de qualification

Commandes du dépôt :

```sh
rtk npm test
rtk npm run typecheck
rtk npm run lint
rtk npm run build
rtk npm run check:convex-contract
rtk proxy npx convex dev --once
```

Les tests couvrent la fixture réelle Kuscheltierland, les menus Dawn/Horizon, les URL de variantes, les appartenances multiples, les règles ET, les sources partielles, les checkpoints après crash, l’isolation des propriétaires, les générations périmées, le suivi de consommation IA sans plafond, les imports existants et les réponses Shopify partielles/incertaines. Le test synthétique de 100 000 produits qualifie la déduplication et le partitionnement ; il ne constitue pas une mesure de débit réseau sur 100 000 pages.

Validation du 24 septembre 2026 : 242 tests réussis, dont 36 pour le module catalogue ; typecheck, build, contrat public Convex et schéma GraphQL Shopify validés. Le lint conserve 59 avertissements préexistants, sans erreur ni avertissement dans les nouveaux fichiers catalogue. Le backend a été validé sur le déploiement Convex de développement. Les tests de réimport vérifient aussi l’attente du recalcul des collections automatiques et le signalement d’un échec après un délai borné.

Pour le lecteur **legacy seulement**, la lecture de produits reste bornée à 50 résultats et 500 résumés examinés par requête. Une recherche très sélective peut donc nécessiter plusieurs tranches. Les collections sont affichées par pages de 20. La structure éditable est limitée à 500 collections, 1 000 nœuds de menu, 12 niveaux et 300 Ko UTF-8, vérifiés dès la découverte puis à l’enregistrement. Ces limites maintiennent les échanges de structure sous le plafond Convex ; elles ne limitent pas le nombre de produits stockés dans R2. Un menu dépassant ces limites est refusé avec un message explicite. Les thèmes entièrement différents demandent une adaptation des sélecteurs ; un contenu non reconnu est signalé.

L’interface a été vérifiée sur ordinateur et à 390 × 844 dans une prévisualisation isolée utilisant les composants réels et des données publiques du pilote. Cette vérification couvre la présentation et les interactions ; elle ne remplace pas une session authentifiée connectée à R2 et Shopify. Les deux audits Impeccable indépendants (conception et contrôle mécanique) ont été réalisés, puis leurs corrections d’accessibilité, de pagination et de mise en page intégrées.

Avant utilisation en production, réaliser un import sur une boutique de développement avec R2 privé et les scopes requis. Vérifier les transferts de médias, la devise, les trois niveaux de navigation et les collections après recalcul Shopify. Les médias encore en échec après la tentative de réparation et les destinations non importées restent signalés ; traiter ce rapport avant publication. Aucune publication ni affectation au thème n’est automatisée.
