> Historique du moteur remplacé. Mesures et travaux conservés ; ils ne qualifient pas la refonte du 1er octobre 2026. Voir [qualification courante](catalog-refonte-qualification.md).

# Qualification collecte et import — 26 septembre 2026

## Périmètre et méthode

Développement **`curious-greyhound-437`** exclusivement. Source publique : `https://www.kuscheltierland.de`. Aucune écriture Shopify, modification de production, suppression de données existantes, utilisation d’IA ou ajout de service payant. Les fixtures ont leur propre catalogue Convex et racine `catalog-performance/{id}` ; la préparation est copiée, les produits et caches ne le sont pas.

L’objectif de 20 minutes concerne le temps entre lancement après sélection et fin des produits, hors sélection humaine, assemblage du snapshot et import Shopify. La lecture du menu initial n’est donc pas chronométrée. Les essais utilisent les mêmes collections sélectionnées de la préparation historique. Une collecte froide n’a aucun brut ou checkpoint local préalable ; le cache du site public/CDN n’est pas maîtrisé.

Le dépôt était propre au début de l’implémentation, contrairement à l’état historique mentionné dans la passation. Les mesures du 25 septembre demeurent historiques. Les essais instrumentés ci-dessous ont été conservés avant toute relance.

## Échantillons froids : 52 produits, deux collections

Collections `capybara-kuscheltier` et `otter-kuscheltier`, trois pages de collections.

| Essai | ID | Écoulé | Complets / échecs | Particularité |
| --- | --- | ---: | ---: | --- |
| Référence instrumentée | `q174w3520gbdb5tyfv8qzq45ad8f5anh` | 19 min 01,699 s | 52 / 0 | Ancien index R2, traitement séquentiel |
| Optimisé v1 | `q179ethfcfgppr7hb3602nytgx8f4naq` | 2 min 12,224 s | 47 / 5 | Cinq HTTP 503 HTML : **essai non accepté à couverture égale** |
| Optimisé v2 | `q17d01b8jmm2xz5pn5gr99njpn8f5fc0` | 2 min 08,948 s | 52 / 0 | ETag issu du GET, départs espacés de 450 ms, reprise des 503 |
| Optimisé v3 | `q172y1f431bbe5f0qgva8f92h98f5ydv` | 2 min 31,472 s | 52 / 0 | Sources regroupées, pipeline chevauché, un 429 repris automatiquement |
| Optimisé v4, code final | `q1708fc3jf3h15qq2n4vmsdx218f4kek` | 2 min 24,982 s | 52 / 0 | Mutations du workspace sérialisées, zéro conflit OCC |

Les **52 empreintes SHA-256 normalisées sont identiques** entre référence, v2, v3 et v4 : identité, handle, appartenances, variantes, images, descriptions, sections, langue et autres propriétés source. Seul `fetchedAt` est omis et les appartenances sont triées. Les corrections utilisateur ne sont pas copiées dans ces fixtures. Leur préservation est couverte par les tests du catalogue de travail et les essais antérieurs documentés séparément.

Ces essais correspondent à des révisions successives, pas à des répétitions de la même configuration : aucune médiane ou p95 stable n’en est déduit. La v3 réduit les requêtes R2 mais n’est pas plus rapide que v2 dans cet essai avec reprise réseau. Le mode de fixture `baseline` actuel n’est pas une capsule exacte de l’ancien transport : des helpers communs ont ensuite évolué. La référence archivée constitue la preuve historique instrumentée.

### Par phase et échanges

Les durées ci-dessous sont les **sommes des durées murales des actions** par phase, en secondes ; elles excluent l’ordonnancement entre actions. Les durées I/O parallèles, disponibles dans les rapports JSON, ne s’additionnent pas au temps mural.

| Phase | Référence : actions / secondes | v2 : actions / secondes | v3 : actions / secondes |
| --- | ---: | ---: | ---: |
| Découverte des tâches | 1 / 2,724 | 1 / 1,390 | 1 / 2,354 |
| Pages de collections | 3 / 46,748 | 2 / 10,796 | 2 / 14,668 |
| Indexation | 256 / 496,207 | 1 / 3,362 | 1 / 2,774 |
| Produits | 45 / 271,323 | 5 / 104,186 | 6 / 117,267 |
| Total | 305 / 817,002 | 9 / 119,734 | 10 / 137,062 |

| Indicateur | Référence | v2 | v3 |
| --- | ---: | ---: | ---: |
| R2 GET | 1 068 | 176 | 141 |
| R2 HEAD | 817 | 22 | 22 |
| R2 PUT | 817 | 181 | 130 |
| Total de ces requêtes R2 | 2 702 | 379 | 293 |
| Octets R2 lus | 26 726 | 19 337 | 83 967 |
| Octets R2 écrits | 19 859 522 | 19 791 255 | 20 855 679 |
| Requêtes source | 107 | 107 | 108 |
| Octets source reçus | 20 959 175 | 20 957 995 | 20 967 477 |
| Appels Convex depuis le worker : mutations / queries | 664 / 53 | 75 / 54 | 86 / 54 |
| Browserless | 0 | 0 | 0 |

Sur cet échantillon, v3 donne **−86,7 % de temps écoulé et −89,2 % de requêtes R2** contre la référence. Ce n’est pas une réduction de facture du même pourcentage. Les compteurs R2 mesurent les commandes SDK : d’éventuelles tentatives HTTP internes au SDK ne sont pas comptées séparément. Les octets écrits v3 augmentent légèrement : sérialisation JSON du HTML et reprise partielle. La métrique Convex du worker exclut la mutation supplémentaire d’enregistrement des mesures et les fonctions planifiées sans tâche acquise.

### Dernier échantillon après correction des conflits

La v4 mesure 9 invocations et 134,925 s de durée d’action cumulée : découverte 2,242 s, collections 15,094 s, index 3,393 s, produits 114,196 s. **275 commandes R2** (124 GET, 22 HEAD, 129 PUT), soit **−89,8 %** contre la référence ; 19 337 octets lus et 20 849 560 écrits. 107 requêtes source, toutes réussies, 20 957 995 octets ; 75 mutations/54 queries depuis les workers. Les 52 empreintes sont identiques à la référence. Le temps écoulé baisse de **87,3 %** sur cet échantillon (19 min 01,699 s → 2 min 24,982 s).

Les logs donnent **zéro tentative OCC**, 149 complétions de fonctions, 11 292 551 octets base lus et 7 133 563 écrits, 505 documents lus / 4 498 écrits, 17 830 entrées d’index, 22 242 917 octets d’egress, 72,646 Gio-secondes Node. La v2, également sans erreur source, avait 43 tentatives OCC et 19 714 859 octets base lus ; les écritures et entrées d’index restent pratiquement identiques. Les conflits et les lectures associées ont donc effectivement diminué sur ce contrôle. Le temps Node v4 reste supérieur à v2 : ne pas convertir ces résultats en économie globale ou gain de vitesse systématique. Une seule exécution finale ne fournit pas de p95. La seconde collecte complète froide du code final, lancée après cet échantillon, est terminée et détaillée ci-dessous ; aucune projection de durée n’est tirée des 52 fiches.

## Première collecte complète froide, avant sérialisation du workspace

Fixture : `q17cy8vwa838jdtmgfyrv0meb98f5685`, 74 collections, racine vide au départ, concurrence quatre et régulation adaptative persistante par domaine. Démarrage : `1790425926979`.

La découverte retrouve exactement les **964 handles et 1 987 appartenances** de la référence historique, sans ajout, omission ni différence (`output/catalog-performance-full-discovery.json`).

Le passage froid termine à **52 min 30,676 s**, état `partial` : 963 fiches complètes et une fiche avec JSON complet mais timeout HTML de 30 secondes (`braunes-faultier-kuscheltier`). Les 964 identités, 1 987 appartenances, 1 567 variantes et 2 321 images sont présentes. **963 empreintes normalisées sont exactement égales à la référence historique** ; la seule divergence est cette fiche incomplète. Aucun produit supplémentaire ni manquant. Rapport froid archivé avant réparation : `output/catalog-performance-full-cold.json`.

| Temps écoulé | Historique du 25 septembre | Essai froid du 26 septembre |
| --- | ---: | ---: |
| Découverte + pages de collections | 46 min 37 s | 8 min 18,816 s |
| Indexation + produits, attentes incluses | 1 h 38 min 52 s | 44 min 11,860 s |
| Total initial | 2 h 25 min 29 s | **52 min 30,676 s** |

La référence historique n’est pas un essai froid contemporain instrumenté : ses erreurs initiales et pauses éventuelles ne sont pas entièrement reconstituées. Le temps observé est nettement inférieur, mais cette comparaison n’isole pas tous les effets de source/configuration. Le passage froid actuel comprend une erreur finale et ne prouve pas seul une collecte complète sans réparation.

| Phase actuelle | Invocations | Somme des durées murales d’action |
| --- | ---: | ---: |
| Découverte | 2 | 14,918 s |
| Collections, 129 pages | 71 | 451,822 s |
| Indexation | 10 | 41,162 s |
| Produits | 83 | 2 124,245 s |
| Total | 166 | 2 632,147 s |

Échanges : **2 063 appels source**, dont trois 503, trois 429 et un timeout ; 417 460 634 octets reçus ; zéro Browserless. Les 503/429 ont été repris automatiquement, avec **38 checkpoints produits et huit JSON bruts réutilisés**. R2 : 2 512 GET, 577 HEAD, 2 642 PUT, soit **5 731 commandes** ; 716 853 octets lus et 384 346 961 écrits. Appels Convex depuis les workers : 1 536 mutations et 976 queries, hors enregistrement des mesures.

La phase produits domine : 35 min 24 s de durée d’action cumulée. Sur cette phase, les PUT R2 cumulent 1 877,805 s, les GET 518,697 s, les requêtes source 910,305 s et l’attente du budget source 1 937,183 s **entre travailleurs** ; ces sommes parallèles ne sont pas additives. Les six intervalles suivant les erreurs HTTP représentent environ 463 s d’attente/ordonnancement, estimés depuis la chronologie persistée. Le total hors actions est 518,529 s, incluant aussi les transitions normales. Le réglage de la concurrence ne suffit donc pas à supprimer le coût des I/O et de la source.

**Conclusion : objectif de 20 minutes non atteint.** Même en retirant toutes les attentes entre actions, les 43 min 52 s d’actions restent au-dessus de l’objectif ; il serait incorrect d’attribuer tout l’écart aux 503/429. Une future optimisation devra mesurer et réduire encore la persistance/orchestration par fiche et les traitements redondants, sans retirer les checkpoints ou augmenter arbitrairement la pression sur le site.

Après ce relevé, une dernière correction sérialise les mutations `collected`/`collectStructure` qui écrivent le même workspace, tout en gardant les I/O source/R2 parallèles. Elle cible les conflits mesurés, avec qualification réussie sur le nouvel échantillon froid v4 ci-dessus. **Aucune nouvelle durée complète n’est projetée à partir de cette correction.** Le durcissement des erreurs concurrentes (priorité 403 et Retry-After maximal) est couvert par les tests locaux ; il n’a pas été provoqué artificiellement sur le site public.

## Collecte complète froide sur le code final

Fixture **`q175ky3d5ke47c48r5zbb12w8h8f58av`**, racine neuve, même sélection de 74 collections, concurrence quatre. Début `1790429942682`, fin `1790432895175`. Aucun changement de code ou d’environnement pendant le passage, aucune relance manuelle. L’opération termine en `review` à **964 réussites / zéro échec**, en **49 min 12,493 s**.

Les **964 identités et empreintes normalisées sont exactement égales à la référence historique**, sans fiche ajoutée/manquante : **1 987 appartenances, 1 567 variantes, 2 321 images**. La vérification utilise les sources archivées, pas les valeurs métier recalculées. Rapports : `output/catalog-performance-full-final-cold.json`, `output/catalog-performance-full-final-timeline.json`. Le relevé `output/catalog-performance-full-final-scope.json` ne trouve aucune autre opération catalogue chevauchant cette fenêtre.

| Temps écoulé | Historique du 25 septembre | Code final, froid |
| --- | ---: | ---: |
| Découverte + collections | 46 min 37 s | **8 min 02,369 s** |
| Indexation + produits, attentes comprises | 1 h 38 min 52 s | **41 min 10,124 s** |
| Total | 2 h 25 min 29 s | **49 min 12,493 s** |

| Phase finale | Invocations | Somme des durées murales d’action |
| --- | ---: | ---: |
| Découverte | 2 | 14,095 s |
| Collections, 129 pages | 71 | 453,914 s |
| Indexation | 10 | 40,140 s |
| Produits | 82 | 2 061,958 s |
| Total | 165 | **2 570,108 s** |

**2 062 requêtes source** : 2 057 succès, deux HTTP 429 et trois HTTP 503, tous repris automatiquement ; aucun timeout final, zéro Browserless. 417 805 966 octets source, **43 checkpoints produits et huit JSON bruts réutilisés** au cours des reprises. Ces reprises automatiques font partie du passage froid ; elles ne le transforment pas en essai initialisé depuis un cache d’une autre collecte.

R2 : **2 515 GET, 576 HEAD, 2 641 PUT = 5 732 commandes SDK**, 752 160 octets lus et 384 743 777 écrits. Convex depuis les workers : 1 539 mutations et 976 queries, hors enregistrement des mesures. Les commandes R2 sont presque identiques au premier complet (5 731), malgré les différences de reprises : aucun gain supplémentaire de volume R2 n’est attribué à la sérialisation des mutations.

La phase produits représente **34 min 21,958 s d’actions**. Ses I/O parallèles cumulent 1 850,688 s de PUT R2, 497,139 s de GET R2, 867,702 s de requêtes source et 1 982,039 s d’attente du budget source ; ces postes ne s’additionnent pas. Les cinq intervalles suivant les réponses HTTP temporaires totalisent environ **352,077 s** d’attente/ordonnancement. Le total hors actions est **382,385 s**.

**Objectif de 20 minutes non atteint sur le code final.** Même sans aucun délai entre actions, les 42 min 50,108 s cumulées restent au-dessus de l’objectif. Le temps observé est inférieur de 66,2 % à l’historique, avec les limites de comparabilité de cet historique déjà indiquées ; ce n’est pas une expérience contrôlée isolant chaque optimisation. Le passage final est 6,3 % plus court que le premier complet, mais les réponses réseau et la couverture initiale diffèrent : ce pourcentage ne mesure pas à lui seul l’effet de la correction OCC. Le poste dominant mesuré reste le traitement/persistance des produits sous régulation source, pas l’indexation. Aucun gain vers 20 minutes ni économie monétaire supplémentaire n’est projeté.


## Reprises réelles séparées

Sur la collecte complète, la relance de `braunes-faultier-kuscheltier` termine à **964/0**, état `review`. Les **964 empreintes normalisées sont exactement égales à la référence historique**, avec 1 987 appartenances, 1 567 variantes et 2 321 images. La réparation seule mesure **3,224 s d’action**, un GET HTML source (200), JSON brut réutilisé, quatre GET R2, un HEAD et trois PUT. Le délai global de 57 min 33,602 s jusqu’à cet état comprend environ cinq minutes de lecture des rapports, diagnostic et déploiement manuel après la collecte froide : ne pas le présenter comme un débit intrinsèque du moteur. Rapport : `output/catalog-performance-full-after-retry.json`.


La v3 a reçu un HTTP 429. Elle a terminé à 52/0, avec neuf checkpoints produits réutilisés et un JSON brut réutilisé. Les compteurs et les 52 empreintes restent égaux à la référence. La temporisation adaptative inter-tâches a été ajoutée après cet essai et est utilisée par la collecte complète ; son contrat de cooldown et `Retry-After` est aussi testé localement.

Après archivage du rapport froid v3, **Relancer cette fiche** a été exécuté sous l’identité propriétaire via la CLI dev sur `blauer-otter-kuscheltier-weich` : 2,435 s de durée d’action, quatre GET, un HEAD, deux PUT, **zéro requête source**, un hit JSON et un hit HTML. Compteurs inchangés à 52/0 et empreintes identiques. Le temps global `elapsedMs` de ce rapport de reprise inclut l’attente humaine et n’est pas un temps de collecte.

Pause puis reprise via l’API publique ont été acceptées et l’opération revient à `review`. La relance était déjà terminée au moment de la pause : cela ne qualifie pas une pause en plein téléchargement. Les fences/crashs/pause pendant un travail sont couverts par les tests locaux, pas présentés comme un parcours navigateur réel. L’onglet local isolé arrive sur l’écran de connexion ; le contrôle visuel authentifié reste non qualifié.

## Consommation Convex

`scripts/capture_catalog_usage.mjs` archive seulement les métadonnées d’exécution. `scripts/summarize_catalog_usage.mjs` relie les sous-appels aux `requestId` des workers et écarte les lectures de rapport/UI. Les tentatives OCC sont incluses ; le temps des sous-appels est déjà compris dans celui de l’action, donc `executionSeconds` n’est pas une durée murale additionnable.

| Mesure issue des logs | v2 | v3 |
| --- | ---: | ---: |
| Complétions de fonctions, tentatives OCC comprises | 192 | 183 |
| Tentatives avec conflit OCC | 43 | 21 |
| Base : octets lus | 19 714 859 | 18 834 910 |
| Base : octets écrits | 7 132 228 | 8 335 836 |
| Documents lus / écrits | 722 / 4 498 | 4 268 / 6 000 |
| Entrées d’index écrites | 17 830 | 23 816 |
| Egress des fonctions | 21 408 494 | 22 392 669 |
| Actions Node, allocation 512 Mio : Gio-secondes | 64,632 | 74,044 |

La référence n’a que 140 complétions de workers capturées, contre 305 invocations instrumentées : son historique est **incomplet**. Impossible d’annoncer un pourcentage fiable de baisse des octets base ou de la facture Convex. La version du premier essai complet introduisait des conflits mesurés sur `catalogWorkspace:collected` et le document partagé `catalogWorkspaces`, corrigés avant l’essai final. Les reprises réécrivent aussi les vues pour préserver l’idempotence. Le nombre réduit d’actions/R2 est établi ; une économie monétaire globale ne l’est pas. Les tarifs et franchises effectifs n’ont pas été fournis.

### Consommation de la première collecte complète froide

167 complétions de workers (166 invocations instrumentées et la transition finale), 3 126 complétions de fonctions au total. **280 tentatives OCC**, dont 274 sur `catalogWorkspace:collected` et six sur `collectStructure`. Lectures base : 281 303 063 octets / 37 484 documents ; écritures : 160 486 560 octets / 121 727 documents / 482 674 entrées d’index. Egress : 412 854 448 octets. Allocation Node : 1 347,112 Gio-secondes à 512 Mio. Ces volumes incluent les reprises et les coûts de matérialisation des index métier. Ils ne constituent pas un montant facturé.

### Consommation de la collecte complète finale

166 complétions de workers (165 invocations instrumentées et la transition finale), **2 850 complétions de fonctions**, **trois tentatives OCC** sur `catalogDiscovery:merge`, et **zéro sur les mutations du workspace**. Les fusions concurrentes de liens conservent la reprise transactionnelle Convex.

| Mesure | Premier complet | Complet final |
| --- | ---: | ---: |
| Octets base lus | 281 303 063 | **222 178 557** |
| Octets base écrits | 160 486 560 | 161 182 003 |
| Documents lus | 37 484 | 22 093 |
| Documents écrits | 121 727 | 122 867 |
| Entrées d’index écrites | 482 674 | 487 214 |
| Egress fonctions, octets | 412 854 448 | 412 896 736 |
| Allocation Node, Gio-secondes | 1 347,112 | 1 302,981 |

Les lectures base baissent de **21,0 %** entre ces deux passages ; les écritures augmentent de **0,4 %**, notamment avec des reprises différentes. La disparition des conflits du workspace est mesurée, sans extrapoler ce pourcentage à toute la facture. Ces volumes concernent l’exécution de collecte ; les lectures de diagnostic/rapport sont exclues. La capture est arrêtée après la fin de qualification. Le rapport agrégé conserve les six essais comparés dans `output/catalog-performance-backend-usage.json`.

## Import Shopify : qualification sans boutique

Version réellement configurée en dev : **2026-04**. Les opérations GraphQL ont été validées contre son schéma officiel. Limites officielles vérifiées : JSONL 100 Mo, exécution 24 h, une connexion par mutation bulk, cinq mutations bulk simultanées au maximum depuis 2026-01. Les tableaux d’entrée limités généralement à 250 éléments ne limitent pas le nombre de lignes JSONL. L’application conserve **un seul bulk en cours par boutique**.

Contrôle des variables dev : `SHOPIFY_API_VERSION=2026-04` ; `CATALOG_COLLECT_CONCURRENCY` et `CATALOG_IMPORT_BATCH_SIZE` sont absentes, donc valeurs par défaut **4** et **100**. Aucune variable de déploiement n’a été changée.

Configuration serveur : `CATALOG_IMPORT_BATCH_SIZE`, défaut **100**, entier strict **1–1000**. Limite applicative **16 Mio UTF-8** par lot ; préparation et vérifications **10 produits par invocation**. Valeur figée à la création de l’import, anciens imports à 25, lots soumis/incertains jamais redécoupés. Voir [contrat d’exploitation](catalog-import.md#performance-lots-et-exploitation-26-septembre-2026).

Les simulations exécutent le moteur réel contre Shopify/R2 simulés, avec résultats en ordre inversé. Elles ne mesurent ni latence distante ni coût facturé. Les chiffres portent sur les phases produits/vérification, hors setup et passe liens.

| 964 premières créations simulées | Plafond 100 | Plafond 250 | Plafond 1 000 |
| --- | ---: | ---: | ---: |
| Bulk soumis | 10 | 4 | 1 (964 lignes) |
| Invocations du moteur | 204 | 198 | 195 |
| Appels GraphQL simulés | 1 958 | 1 940 | 1 931 |
| Vérifications uniques | 964 | 964 | 964 |
| Octets écrits via helpers de stockage simulés | 7 365 182 | 13 259 422 | 42 874 294 |

| 964 réimports simulés, tags déjà présents | Plafond 100 | Plafond 250 | Plafond 1 000 |
| --- | ---: | ---: | ---: |
| Bulk soumis / ajouts de tags | 0 / 0 | 0 / 0 | 0 / 0 |
| Invocations du moteur | 194 | 194 | 194 |
| Appels GraphQL simulés | 1 928 | 1 928 | 1 928 |
| Vérifications uniques | 964 | 964 | 964 |
| Octets écrits via helpers de stockage simulés | 6 040 975 | 12 157 511 | 42 876 308 |

Le nombre de soumissions baisse fortement ; le nombre total de recherches et vérifications reste proche de deux par produit. Le journal du lot est relu/réécrit pendant la préparation, ce qui amplifie les octets avec un grand plafond. Le fractionnement des variables de vérification évite cette amplification pendant la vérification. **100 demeure le défaut prudent ; 250 et 1 000 sont fonctionnellement testés, sans preuve de gain distant.** Un lot de 964 est possible si son JSONL respecte 16 Mio, pas garanti pour n’importe quelles fiches.

Les tests couvrent aussi perte de réponse R2 après préparation/manifeste/progression (sans doublons), limite en octets UTF-8 et reste de page, configuration invalide/changée, résultat absent/dupliqué, média lent sans revalidation des lignes acquises ni blocage des prochains lots, réponse de soumission perdue, résultat legacy déjà téléchargé malgré URL expirée, brouillons et tags manuels, coût GraphQL, description inchangée sans mutation. La passe liens utilise une continuation interne sans pause arbitraire ; les attentes distantes restent explicites.

**Aucun gain de durée Shopify n’est annoncé. Aucun import réel n’a été lancé.** Peluche (`dp2iki-0b.myshopify.com`) contient déjà l’import historique des 964 produits ; la réimporter ne qualifie pas la première création. Une autorisation précise de boutique/volume/effets est nécessaire pour les essais distants. Il ne faut ni supprimer les produits historiques ni changer leurs identités pour simuler une première création.

Diagnostic final **en lecture seule**, via `catalogImportActions:importDiagnostic` sur le dev sous l’identité propriétaire : aucune permission manquante, devise EUR, domaine public `https://pluschwelt.com`, définition d’identité de type `id` avec unicité activée et 964 valeurs. L’import historique est toujours `completed`, 964/0 ; son export source possède le snapshot final de révision 19. Aucun import n’a été créé par ce diagnostic.

Essai distant proposé, **non autorisé à ce stade** : un échantillon d’au plus 52 produits existants des collections capybara/otter sur Peluche. Précontrôle obligatoire du volume et des identités avant toute écriture ; arrêter si une création de produit serait nécessaire. Effets autorisables : ajout des seuls tags manquants, réutilisation ou création d’au plus deux collections automatiques, création d’un menu séparé non affecté au thème. Aucune publication ni suppression. Cet essai mesure le réimport ; les soumissions de 100/250/964 premières créations exigent ensuite une destination et une autorisation distinctes.

## Vérifications et reproduction

323 tests passent, un benchmark optionnel est ignoré dans la suite normale. TypeScript, build et contrat public Convex (108 références) passent. ESLint conserve les 59 avertissements historiques ; le build conserve l’avertissement de bundle >500 Ko. Le contrôle visuel authentifié et l’import Shopify réel restent distincts de ces tests.

```sh
rtk npm test
rtk npm run typecheck
rtk npm run build
rtk npm run lint
rtk npm run check:convex-contract
rtk proxy env CATALOG_IMPORT_BENCHMARK=1 npx vitest run convex/catalogImport/shopify.test.ts
rtk proxy node scripts/catalog_performance_report.mjs OPERATION_ID LABEL coverage
rtk proxy node scripts/compare_catalog_performance.mjs output/catalog-performance-historical-full-reference.json output/catalog-performance-full-final-cold.json
```

Les rapports sont dans `output/catalog-performance-*.json` et `output/catalog-import-synthetic-*.json`. La CLI de rapport cible explicitement le dev connu. `catalogPerformance.fixture` est une mutation interne, verrouillée sur ce dev et cette source, qui refuse une collecte déjà active sur le domaine. Elle crée des données neuves ; ne pas la lancer en boucle ou en production. L’assemblage final reste inchangé et n’a pas été requalifié en débit dans ces essais.
