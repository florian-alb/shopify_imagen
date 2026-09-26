# Qualification du catalogue de travail — 25 septembre 2026

## Périmètre et état

Développement uniquement : `curious-greyhound-437`, catalogue `q17317nba9s76hgmxhdeydsbrx8ezbdg`. Aucune commande de production, aucun scraping, appel IA ou import Shopify réel pour cette qualification.

Le catalogue contient 964 produits (955 complets, 9 incomplets), 74 collections, révision 2, génération 774. Aucune collection n’est approuvée : les listes cibles vides sont donc attendues ; aucune règle n’a été approuvée automatiquement. Les objets R2 d’origine restent conservés.

## Mesures réseau réelles

Trois appels par scénario, même catalogue et même identité propriétaire, avant et après bascule. Les temps ci-dessous sont les temps serveur instrumentés des actions `catalogImportActions`, comprenant autorisation et lecture ; ils excluent le démarrage de la CLI. Le frontend migré appelle directement les queries réactives, sans passer par ces actions. Ces mesures ne sont donc pas des temps de rendu navigateur.

| Lecture | Avant, médiane | Après, médiane | Après, min–max | GET/LIST R2 avant → après |
| --- | ---: | ---: | ---: | --- |
| Tous les produits, 50 lignes | 9 208 ms | 28 ms | 27–603 ms | 101/1 → 0/0 |
| Recherche `capybara` | 13 606 ms | 151 ms | 25–290 ms | 546/22 → 0/0 |
| Erreurs | 6 974 ms | 196 ms | 156–697 ms | 536/11 → 0/0 |
| Collection `capybara-kuscheltier` | 5 526 ms | 73 ms | 26–86 ms | 501/10 → 0/0 |
| Détail `affe-kuscheltier-in-pink` | 313 ms | 65 ms | 35–139 ms | 2/0 → 0/0 |
| Structure | 148 ms | 67 ms | 44–116 ms | 1/0 → 0/0 |

Avant : recherche 35 lignes avec continuation, erreurs 5 lignes avec continuation, collection vide avec continuation. Après : recherche 40 lignes sans continuation, 9 erreurs sans continuation, collection vide sans continuation. Les ensembles sont paginés directement : la nouvelle première page peut contenir davantage de résultats parce que l’ancienne s’arrêtait après un budget de scans. L’ordre avec recherche est documenté dans la procédure de migration.

Le premier appel de liste après bascule prend 603 ms ; les suivants 28 et 27 ms. On ne peut pas attribuer précisément ce premier coût à un démarrage froid. Trois échantillons ne permettent pas de qualifier un p95 stable. Aucune mesure de retour en cache <150 ms ni de rendu navigateur n’est revendiquée.

Sources reproductibles : `output/catalog-benchmark-before.json`, `output/catalog-benchmark-after.json`. Le rapport `catalog-benchmark-before-initial.json` conserve un essai incomplet avant réutilisation du client S3, avec une erreur runtime ; il n’est pas mélangé à la comparaison ci-dessus. `ioMs` additionne les lectures parallèles et peut dépasser le temps mural.

```sh
rtk proxy node scripts/benchmark_catalog.mjs --deployment curious-greyhound-437 --id q17317nba9s76hgmxhdeydsbrx8ezbdg --owner kh79a14wfhn2hy42rk291dvfdh87e67y --samples 3 --label after
```

## Migration et intégrité

- Dry-run sans écriture : 964 produits. Corps source p50 5 586 octets, p95 6 424, maximum 7 103.
- Interruption volontaire après 25 produits, reprise au checkpoint, copie des 939 restants puis validation des 964 produits. `count = validated = 964`, état `ready`, révision et génération inchangées.
- Comparaison SHA-256 canonique des sources et corrections, résolution effective, résumés et index. Rejet explicite des résumés périmés et des appartenances qui divergeraient du filtre legacy après normalisation des tags.
- Bascule atomique sur Convex et rejeu idempotent de la publication.
- Retour arrière réel vers legacy réussi avant édition ; fiche originale relue dans R2 (2 GET), titre et variantes conservés.
- Remigration complète réussie : 964 produits recopiés et 964 validés, version de vues 2, révision 2 et génération 774 inchangées ; seconde bascule vérifiée en mode Convex actif.

Les compteurs `products`/`postings` des rapports de script comptent les entrées traitées, y compris la seconde passe et les rejeux. Le nombre unique de produits est `checkpoint.count`, comparé à `checkpoint.validated` ; ne pas interpréter 1 928 traitements comme 1 928 produits. La remigration traite 71 324 postings sur deux passes, soit **35 662 entrées actives**, environ 37 par produit. Le dry-run initial estimait 36 879 entrées avant compression des suffixes ; utiliser le dry-run courant pour dimensionner une autre migration.

## Éditions, règles et export en développement

Fixture distincte : `q177kbtc61xzttgjbnn0fhfx4x8f35nv`, un produit copié, racine `catalog-rehearsals/...`. Le script refuse toute autre cible que le développement désigné.

Validations réelles réussies : édition publique sous identité du propriétaire ; rejeu sans double révision ; rejet d’une correction avec révision périmée ; recalcul planifié d’une règle ET sur `monkey` et `pink` ; présence cohérente dans la collection et la recherche ; génération R2 ; égalité du produit exporté et du détail Convex ; snapshot inchangé après une correction ultérieure ; refus du rollback legacy après édition. Le catalogue principal n’a pas reçu ces corrections de test.

```sh
rtk proxy node scripts/rehearse_catalog_workspace.mjs q17317nba9s76hgmxhdeydsbrx8ezbdg kh79a14wfhn2hy42rk291dvfdh87e67y
```

Chaque exécution crée une nouvelle fixture identifiable. Rapport : `output/catalog-rehearsal-dev.json`. Aucun import Shopify n’est exécuté ; le moteur d’import est couvert par les tests existants et les snapshots restent au format existant.

## Vérifications locales et limites

Le benchmark synthétique `convex-test` passe à 1 000 et 10 000 produits, avec recherche répétitive, petite collection, erreurs et filtres combinés. Au plus 51 postings sont lus pour une page de 50 lignes. Ses temps sont ceux d’un émulateur en mémoire, pas des latences du service Convex. Rapport : `output/catalog-synthetic-benchmark.json`.

La suite compte 268 tests réussis (benchmark synthétique lancé séparément). Le contrôle TypeScript, le build et le contrat public Convex passent (108 références frontend). ESLint ne signale aucune erreur ; les 59 avertissements existants hors de ce chantier restent présents. Le build conserve son avertissement préexistant de bundle supérieur à 500 Ko.

Le test visuel authentifié n’est pas encore validé : l’onglet local arrive sur la connexion. Il reste à vérifier avec une session utilisateur les onglets, le retour en cache, la pagination, les erreurs, l’édition et les états de recalcul. La qualification production reste conditionnée à ce contrôle et à une autorisation explicite. Aucun p95 de production, coût mensuel ni test Shopify réel n’est déduit des fixtures.

Procédure de migration et limites du retour arrière : [catalog-workspace-migration.md](catalog-workspace-migration.md).

## Correction de la boucle d’abonnements détectée dans les logs

L’inspection des logs dev a montré 20 appels alternant `catalogWorkspace:products` et `catalogWorkspace:structure` en 455 ms. Tous avaient `cachedResult = true`, aucune erreur et aucune lecture base. Le hook dépendait de l’identité de `api.catalogWorkspace.*` : le SDK génère un nouveau proxy à chaque accès. L’effet recréait donc l’abonnement à chaque rendu, et sa mise à jour d’état déclenchait le rendu suivant.

Le hook dépend désormais du nom stable de la fonction et crée sa référence dans l’effet. Un test exécuté dans un vrai navigateur avec React et un client Convex simulé confirme : un abonnement au montage, aucun réabonnement après dix rendus avec de nouveaux proxies, mise à jour réactive sans boucle, remplacement unique lors d’un changement de catalogue et zéro abonnement après démontage. Ce test n’accède à aucune donnée et ne remplace pas le parcours authentifié restant à qualifier.

```sh
rtk proxy npx vite --config scripts/vite.catalog-query.config.ts
```

Ouvrir `http://127.0.0.1:3001/scripts/catalog_query_check.html` : les cinq contrôles doivent afficher `PASS`. Le serveur de test est distinct du routeur de l’application sur le port 3000.
