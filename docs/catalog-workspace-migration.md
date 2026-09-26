# Catalogue de travail Convex — exploitation et migration

Rapport du pilote de développement et mesures réelles : [catalog-workspace-qualification.md](catalog-workspace-qualification.md).

## Contrat

- Convex est l’unique stockage éditable après bascule (`catalogOperations.storageMode = convex`). Aucun GET/LIST R2 dans les queries de listes, erreurs, structure ou détail.
- `catalogSources` conserve identité stable et corrections séparées ; `catalogBodies` découpe le JSON source en fragments de 100 000 caractères, sans couper les paires UTF-16. Le JSON conserve les champs inconnus, variantes, médias, SEO, états et erreurs.
- `catalogRows` contient les résumés uniquement. `catalogPostings` matérialise les appartenances par version, collection et filtres erreurs/à vérifier. Règles et menu restent dans un document de structure borné par le contrat existant (300 Ko, 500 collections).
- Une seule résolution (`resolveWorkspace`, qui appelle `prepareProduct` et `matchesCollection`) alimente résumé, appartenance, détail et export. Les tags manuels remplacent toujours les tags hérités. La taille minimale reste un avertissement. Aucune traduction, IA ni modification métier pendant la migration.
- Les scopes filtrés préexistent : une collection vide ne nécessite pas un scan de tous les produits. Une liste lit au plus 50 résumés et une entrée d’anticipation ; elle ne lit ni description ni variantes complètes.
- L’activité garde sa pagination Convex existante ; les résultats d’import restent des rapports R2 séparés. La refonte n’attribue pas leur latence aux listes produit.

## Recherche et limites explicites

Le moteur plein texte Convex ne conserve pas la sémantique `title.toLowerCase().includes(search.toLowerCase())` : tokenisation, termes de 32 caractères et limite de scan de 1 024 résultats. La refonte utilise donc des index B-tree de suffixes encodés par unité UTF-16. Espaces, ponctuation, accents, casse et caractères supplémentaires conservent la sémantique JavaScript existante. Une seule occurrence par titre est retournée, même entre deux pages.

L’ordre de navigation sans recherche suit le handle encodé, comme les clés R2. **Avec recherche**, l’ordre est celui de la longueur minimale de préfixe distinctif, puis du suffixe et du handle (et non un classement de pertinence). Les curseurs lient catalogue, version, données, collection, texte et filtres ; un curseur incompatible revient à la première page.

Le coût d’écriture et de stockage est proportionnel à la longueur des titres et aux appartenances. Le dry-run fournit le nombre exact d’entrées, avant bascule. Une édition atomique est limitée à 3 500 entrées d’index par produit (remplacement ≤ 7 000 écritures). Un produit dépassant cette limite bloque explicitement la migration ; aucune donnée n’est tronquée. Les suffixes entièrement déjà présents plus tôt dans le titre sont omis. Les autres sont partitionnés par la longueur minimale de préfixe qui les distingue des occurrences antérieures : une recherche ne lit que les partitions admissibles et chaque entrée correspond à un produit unique. Le nombre de partitions est borné à 1 024 ; il dépend des titres, pas du nombre de produits. Ces limites doivent être requalifiées si des règles très larges sont ajoutées. Ce choix favorise l’exactitude des sous-chaînes et les lectures ; ce n’est pas un index gratuit en écritures.

Un corps source ne peut dépasser 64 fragments ; un résumé ne peut dépasser 64 Ko. Les dépassements empêchent la publication, ils ne suppriment aucun champ. Les tailles réelles figurent dans le rapport de qualification.

## Éditions, collecte et export

Les éditions produit sont transactionnelles : révision attendue, corrections, résumé et index changent ensemble. Un identifiant déterministe de requête évite une double application après perte de réponse. Une réponse ancienne est rejetée après une autre édition.

Les modifications de règles construisent une version séparée, un produit par transaction planifiée. L’interface garde l’ancienne version cohérente et montre la progression. Éditions et collecte sont bloquées pendant ce calcul. Une erreur est visible et peut être relancée ; les anciennes versions d’index sont supprimées par lots après publication. Les archives R2 et snapshots ne sont jamais supprimés par ce nettoyage.

La collecte conserve les sources brutes et checkpoints R2, puis upserte Convex avec vérification de l’opération, de la tâche et de sa génération. Une réponse perdue rejoue le même checkpoint. Les alias sont rapprochés par identifiant Shopify source, jamais par titre ou SKU. Les corrections ne sont pas remplacées lors d’une relance.

L’assemblage parcourt Convex par lots de cinq corps, puis écrit le format de snapshot existant dans R2, avec multipart borné. Les éditions sont interdites pendant le snapshot, y compris après pause : reprendre ce snapshot avant de modifier le catalogue. Un import démarré garde son chemin de snapshot immuable ; l’API et le moteur Shopify restent inchangés. Aucun import Shopify réel n’est inclus dans la qualification de cette refonte.

Le cache navigateur conserve au plus 32 réponses / 8 Mo et 20 états de navigation. Il n’utilise ni stockage persistant ni abonnements conservés aux collections quittées. Les clés contiennent propriétaire/catalogue/révision/paramètres ; la déconnexion et le changement de compte le vident. Une réponse d’une ancienne session n’est pas réinsérée. Les données en cache restent visibles pendant l’actualisation de leur propre clé.

## Préconditions d’exploitation

1. Vérifier la cible (dev `curious-greyhound-437`, prod `youthful-bandicoot-479`) et l’absence d’une clé d’environnement contradictoire. Ne pas réutiliser une ancienne autorisation de production.
2. Pousser le schéma additif et le backend sur l’environnement autorisé. Déployer ensuite le frontend compatible avec le champ `storageMode` optionnel. Les anciens catalogues restent utilisables sans backfill.
3. Mettre le catalogue inactif et attendre la fin de son checkpoint. La migration refuse un worker actif ou une édition sous verrou. Ne lancer aucune autre écriture administrative sur les objets source R2 pendant la procédure.
4. Conserver les objets R2 et les anciennes tables. Le script ne contacte ni le site source ni Gemini ni Shopify.

## Commandes développement

Depuis la racine du dépôt, avec l’authentification CLI Convex existante :

```sh
rtk proxy node scripts/catalog_workspace.mjs --deployment curious-greyhound-437 --id q17317nba9s76hgmxhdeydsbrx8ezbdg --command dry-run --report output/catalog-dry-run-dev.json
rtk proxy node scripts/catalog_workspace.mjs --deployment curious-greyhound-437 --id q17317nba9s76hgmxhdeydsbrx8ezbdg --command migrate --limit-batches 1 --report output/catalog-migrate-interrupted.json
rtk proxy node scripts/catalog_workspace.mjs --deployment curious-greyhound-437 --id q17317nba9s76hgmxhdeydsbrx8ezbdg --command resume --report output/catalog-migrate-dev.json
rtk proxy node scripts/catalog_workspace.mjs --deployment curious-greyhound-437 --id q17317nba9s76hgmxhdeydsbrx8ezbdg --command status
```

`dry-run` lit et valide sans écrire. `migrate` fige la révision et le pointeur de préparation, puis copie par lots. Le checkpoint est stocké dans Convex ; interrompre le processus ne perd pas les lots confirmés. `resume` reprend le checkpoint. Les écritures d’un même produit sont des upserts transactionnels. Une seconde passe compare SHA-256 canonique source+corrections, valeurs effectives, résumés et toutes les entrées d’appartenance/recherche. Un objet/correction/résumé manquant, une identité ambiguë ou une source modifiée bloque la publication. Les compteurs et la phase doivent correspondre au checkpoint attendu.

Le script s’arrête en **ready** sans basculer. Vérifier `checkpoint.count = checkpoint.validated = done + failed`, le rapport des tailles, les identités et les éventuels échecs, puis :

```sh
rtk proxy node scripts/catalog_workspace.mjs --deployment curious-greyhound-437 --id q17317nba9s76hgmxhdeydsbrx8ezbdg --command publish --report output/catalog-publish-dev.json
```

La mutation de publication vérifie à nouveau la préparation source et les compteurs, puis bascule lectures/écritures ensemble. Relancer une migration publiée est sans effet sur les produits. Un dry-run interrompu peut être relancé intégralement ; il n’a pas de checkpoint serveur puisqu’il n’écrit rien.

## Production — à exécuter seulement après autorisation explicite

Aucune commande de cette section n’est une autorisation. Faire qualifier le rapport de développement et le test visuel authentifié avant de déployer. Le script exige de répéter le nom exact dans `--allow-production` pour empêcher une sélection implicite.

```sh
rtk proxy node scripts/catalog_workspace.mjs --deployment youthful-bandicoot-479 --allow-production youthful-bandicoot-479 --id q174qb3sh3z0gzrh7k970zhh8h8f0h8b --command dry-run --report output/catalog-dry-run-prod.json
rtk proxy node scripts/catalog_workspace.mjs --deployment youthful-bandicoot-479 --allow-production youthful-bandicoot-479 --id q174qb3sh3z0gzrh7k970zhh8h8f0h8b --command migrate --report output/catalog-migrate-prod.json
rtk proxy node scripts/catalog_workspace.mjs --deployment youthful-bandicoot-479 --allow-production youthful-bandicoot-479 --id q174qb3sh3z0gzrh7k970zhh8h8f0h8b --command status
```

Après validation du rapport (et dans le périmètre de l’autorisation de bascule) :

```sh
rtk proxy node scripts/catalog_workspace.mjs --deployment youthful-bandicoot-479 --allow-production youthful-bandicoot-479 --id q174qb3sh3z0gzrh7k970zhh8h8f0h8b --command publish --report output/catalog-publish-prod.json
```

Remplacer `migrate` par `resume` après une interruption. Ne jamais changer les chemins R2 pour faire passer une validation en échec.

## Retour arrière

Avant nouvelle édition/collecte/export, le retour au lecteur legacy est transactionnel et ne supprime aucune donnée :

```sh
rtk proxy node scripts/catalog_workspace.mjs --deployment curious-greyhound-437 --id q17317nba9s76hgmxhdeydsbrx8ezbdg --command rollback --report output/catalog-rollback-dev.json
```

En production, utiliser les mêmes arguments de cible explicite que ci-dessus et obtenir l’autorisation correspondant à ce retour arrière. Le rollback exige la révision et la génération d’origine, aucun recalcul en cours et `edited = false`. Il est aussi utilisable pour abandonner une migration non publiée dont la source est inchangée.

**Après édition ou collecte dans Convex, aucun rollback R2 sans perte n’est promis.** La commande refuse cette opération : les archives legacy ne contiennent pas les nouvelles corrections. Il faut réparer en avant, ou concevoir et valider un export inverse avant tout retour. Générer un snapshot change la révision et désactive aussi le rollback direct. Ne pas contourner ces contrôles par un patch manuel du mode de stockage.

## Reproduction des validations

```sh
rtk npm test
rtk npm run typecheck
rtk npm run lint
rtk npm run build
rtk npm run check:convex-contract
rtk proxy env CATALOG_BENCHMARK=1 npx vitest run convex/catalogImport/workspace.bench.test.ts
```

Le benchmark synthétique local vérifie les bornes de lecture à 1 000/10 000 produits. `convex-test` utilise une implémentation en mémoire ; ses temps ne qualifient pas les index réseau de production. Le script `scripts/benchmark_catalog.mjs` mesure les actions réelles du pilote dev, avec instrumentation R2 et échantillons enregistrés dans `output/`. Le champ `ioMs` additionne les appels, y compris parallèles : il peut dépasser le temps mural. `cliMs` inclut le démarrage et l’authentification CLI ; le champ serveur `totalMs` les exclut.

Pour répéter les éditions et l’export sans modifier le pilote original :

```sh
rtk proxy node scripts/rehearse_catalog_workspace.mjs q17317nba9s76hgmxhdeydsbrx8ezbdg kh79a14wfhn2hy42rk291dvfdh87e67y
```

Cette commande crée une fixture dans le développement désigné, teste les conflits/rejeux, le recalcul et le snapshot R2, puis vérifie son immutabilité après une autre édition. Elle ne lance aucun import Shopify. Les corrections de test restent dans cette fixture, identifiable par `rehearsal = true`. Elle n’a aucun mode production.
