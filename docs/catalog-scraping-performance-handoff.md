# Collecte et import de catalogue — diagnostic et plan d’optimisation

Date : 25 septembre 2026. Document de passation pour une prochaine session Codex.

## 1. Demande et périmètre

L’utilisateur juge la collecte actuelle beaucoup trop lente et souhaite se rapprocher de **20 minutes pour le catalogue de test d’environ 1 000 produits**. L’UX du module présente aussi des problèmes, mais elle constitue un chantier distinct.

Cette session a réalisé une investigation en lecture seule, puis rédigé ce document. **Aucune optimisation n’a été implémentée ni mesurée.** Les objectifs chiffrés ci-dessous sont des projections, pas des résultats obtenus.

Périmètre proposé pour l’implémentation : découverte des liens, indexation, collecte JSON/HTML, checkpoints et orchestration. Conserver le contenu collecté et les garanties de reprise. Ne pas modifier les règles SEO, traduire les contenus, réduire la couverture ou lancer un import Shopify pour obtenir un meilleur chronométrage.

**Extension demandée après le diagnostic initial :** optimiser également l’import Shopify et rendre sa taille de lot paramétrable par variable d’environnement. Voir la section 11, qui étend le périmètre au moteur d’import sans autoriser son exécution sur une boutique. Les garanties métier Shopify doivent rester inchangées ; son orchestration peut évoluer.

L’objectif de 20 minutes porte par défaut sur la **collecte initiale**, entre son lancement après sélection et la fin du traitement des produits. Exclure le temps de préparation humaine, les corrections et relances manuelles, l’assemblage final et l’import dans une boutique. Mesurer séparément l’assemblage : si l’objectif devient « fichier prêt en 20 minutes », il faut lui réserver un budget supplémentaire dans ces 20 minutes.

## 2. Contexte à lire avant de commencer

- `AGENTS.md`, y compris les instructions RTK et la distinction dev/production.
- `convex/_generated/ai/guidelines.md` avant tout travail backend.
- [Contexte du catalogue de travail](catalog-workspace-context.md).
- [Documentation du module](catalog-import.md).
- [Qualification existante et limites](catalog-workspace-qualification.md).
- [Procédure de migration](catalog-workspace-migration.md) si une migration est effectivement nécessaire.

Appliquer les skills Convex pertinents. Vérifier la version de Convex installée avant d’utiliser une API citée par une guideline. Préfixer les commandes shell avec `rtk`.

Le dépôt contenait déjà de nombreuses modifications non commitées, notamment une refonte du catalogue de travail vers Convex et des changements du moteur Shopify. **Lire l’état courant et le diff ; ne pas écraser ces travaux.** Les fichiers ont pu évoluer depuis l’investigation. Ne pas supposer que le code local et le code déployé sont strictement identiques.

## 3. Mesures réellement disponibles

Cible vérifiée par le MCP Convex : développement `curious-greyhound-437`.

- Source : `https://www.kuscheltierland.de`.
- Opération observée : `q175b5k4c7mnkyw7tz64w3mc498f2t3p`.
- Mode : menu ; catalogue de travail dans Convex.
- 964 produits ; 74 collections ; 129 tâches de pages de collection.
- 256 tâches d’indexation ; 246 tâches produits initiales, avec continuations possibles.
- 12 tâches de relance individuelle ultérieures, exclues du chronométrage initial.
- Lors de la lecture, les compteurs après relances étaient de 964 réussites et zéro échec. Cela ne prouve pas que la collecte initiale était sans erreurs.

Horaires du 25 septembre 2026, Europe/Paris :

| Étape | Début | Fin | Temps écoulé |
| --- | --- | --- | --- |
| Découverte, depuis la création de `discover-0` | 15:06:00 | 15:52:36 | 46 min 37 s |
| Indexation et collecte initiale des produits | 15:52:36 | 17:31:29 | 1 h 38 min 52 s |
| Total initial | 15:06:00 | 17:31:29 | **2 h 25 min 29 s** |
| Premier assemblage, séparé | 17:58:51 | 18:09:58 | Environ 11 min 7 s |

Timestamps exacts utiles à la reproduction :

- Début collecte : `1790341560040`.
- Fin des collections : `1790344356802`.
- Fin des tâches produits initiales : `1790350289033`.

### Méthode et limites

Les durées proviennent des horodatages persistés de `catalogTasks`, pas d’un profilage HTTP. Elles représentent du temps écoulé et peuvent inclure de l’attente d’ordonnancement ; l’historique complet des pauses éventuelles n’a pas été reconstitué.

Pour les 256 tâches `index`, l’écart entre leur fin et la fin de la tâche précédente, lorsque leurs générations étaient consécutives, totalise **983,833 secondes, soit 16,397 minutes**. Ce total inclut notamment l’attente entre tâches : ce n’est ni du temps CPU, ni du temps R2 isolé.

Le poste « produits et orchestration restante » de **82,473 minutes** est obtenu par différence : 98,871 minutes après découverte, moins 16,397 minutes d’indexation. Il ne constitue pas une mesure isolée des téléchargements produits.

Les logs récupérés couvraient une période plus récente que la collecte. Ils ne permettent pas de répartir le temps initial entre Shopify, R2, Convex et Browserless. Une tâche de collection conserve une erreur HTTP 503 malgré son succès final ; cela ne démontre ni un throttling généralisé ni l’absence d’autres erreurs temporaires. Les compteurs de tentatives sont réinitialisés au succès et ne constituent pas un historique complet.

Les insights sur 72 h montraient des conflits sur `catalogWorkspace:pruneVersion` avec `rebuild` et un ancien conflit sur `catalogImport:claim`. Ils ne prouvent pas que ces conflits expliquent la collecte observée ; ne pas détourner cette optimisation vers un problème de contention non établi.

[Dashboard dev](https://dashboard.convex.dev/d/curious-greyhound-437).

## 4. Causes structurelles identifiées dans le code

### A. Exécution séquentielle à plusieurs niveaux

- `convex/catalogImport.ts`, `claim` : une seule tâche active par opération ; un bail coordonne également les opérations d’un même domaine.
- `convex/catalogImport/pipeline.ts`, branche `products` : traitement de cinq fiches par invocation dans une boucle avec `await`, une fiche après l’autre.
- Pour chaque fiche : lecture des caches, téléchargement JSON, téléchargement HTML, extraction et persistance suivent largement une chaîne séquentielle.

Un lot de cinq n’est donc pas cinq téléchargements simultanés. Le plafond nominal de 25 références par tâche ne correspond pas non plus à 25 traitements parallèles.

### B. Amplification des échanges de découverte

`mergeDiscovery` répartit les liens de chaque page dans 256 compartiments. Pour chaque compartiment touché, il lit l’ancien index et le réécrit avant de passer au suivant.

Sous `withCatalogWrites`, chaque écriture via `putText` effectue actuellement un HEAD puis un PUT conditionnel. Un compartiment mis à jour entraîne donc typiquement GET + HEAD + PUT. Les mêmes compartiments sont revisités au fil des pages.

Cette amplification est un suspect majeur pour les 46,6 minutes de découverte ; sa part exacte reste à mesurer.

### C. 256 étapes d’indexation systématiques

La branche `index` parcourt tous les compartiments, y compris les vides, avec entrées de tâches et reçus intermédiaires. Les compartiments non vides produisent des tâches produits. Sur ce catalogue, 246 tâches produits initiales ont été créées : la partition produit beaucoup de petits lots.

### D. Temporisation fixe

`settle` programme généralement le prochain travail d’export après 1 000 ms. Plusieurs centaines de transitions représentent un ordre de grandeur d’environ 11 minutes d’attente imposée sur cette collecte. Ce temps est **déjà compris dans les durées par phase**, notamment celles de l’indexation.

### E. Persistance unitaire des produits

Sur le chemin Convex d’un produit neuf réussi, le code implique au minimum :

- Trois GET R2 : checkpoint, JSON brut, HTML brut.
- Trois écritures : JSON brut, HTML brut, checkpoint ; actuellement deux requêtes chacune avec HEAD + PUT.

Soit **neuf requêtes R2 par produit**, environ **8 676 pour 964 produits**, hors reçus et entrées de tâches, erreurs, reprises et autres étapes. Convex reçoit également la recherche de l’identité précédente et la matérialisation du produit.

### F. Leviers complémentaires non quantifiés

- `fetchPublic` demande `Accept-Encoding: identity` : absence de compression de transport.
- Le rendu Browserless ouvre une page et attend `networkidle2` ; fréquence et coût pendant cette collecte inconnus.
- L’assemblage final écrit ses fiches de snapshot séquentiellement : il constitue un chantier supplémentaire si le fichier final entre dans le budget.

## 5. Ordre d’implémentation recommandé

### Étape 1 — Instrumenter avant de conclure

Ajouter des mesures agrégées par phase/invocation : temps écoulé, durée des requêtes source, extraction, échanges R2 par méthode, octets, appels Convex, attente planifiée, concurrence réelle, réponses 429/503, reprises et recours Browserless.

Associer les mesures à l’opération, à la tâche et à la génération. Ne pas journaliser de secrets, de HTML complet ou de contenu privé inutile. Sous concurrence, distinguer durée murale et somme des durées I/O : la seconde peut dépasser la première et ne doit pas être présentée comme une décomposition additive.

Rendre possible la comparaison d’une collecte froide et d’une reprise avec cache. Ne pas utiliser une reprise avec toutes les sources déjà présentes comme preuve d’accélération du scraping initial.

### Étape 2 — Réduire les tâches et échanges d’indexation

Traiter les compartiments par lots bornés, éviter une invocation par compartiment vide, et réduire les fichiers d’orchestration intermédiaires. Préserver les identités, appartenances source et compteurs de déduplication.

Objectif de travail : **16,4 → 1–2 minutes** sur le pilote. Cette cible inclut l’orchestration et reste à vérifier.

### Étape 3 — Revoir la découverte, puis la paralléliser

Séparer les résultats de pages et leur agrégation afin d’éviter de relire/réécrire les mêmes index pour chaque page. Évaluer une agrégation bornée dans Convex ou des fragments immuables fusionnés par lots ; choisir après mesure des volumes et des limites.

Introduire ensuite une concurrence limitée entre collections. Garder la pagination d’une collection cohérente, ainsi que la détection des boucles.

**Ne pas exécuter le `mergeDiscovery` actuel en parallèle sans nouvelle coordination** : deux lectures suivies de réécritures concurrentes peuvent provoquer un conflit ou perdre des appartenances. Ne pas charger tout un catalogue arbitrairement grand en mémoire pour contourner le problème.

Objectif combiné : **46,6 → 7–10 minutes**, soit environ ×5 à ×6,7.

### Étape 4 — Accélérer les produits avec une concurrence bornée

Commencer par une concurrence configurable de quatre produits, puis ajuster selon les mesures. Une approche à évaluer est de conserver un seul coordinateur d’opération et de paralléliser les I/O à l’intérieur de son travail ; elle évite de supprimer d’emblée le modèle de bail existant.

Chevaucher les lectures indépendantes et les téléchargements JSON/HTML lorsque leurs règles d’erreur le permettent. Adapter la taille des lots à la durée, aux données et aux limites Convex, pas uniquement à un nombre fixe de produits.

La concurrence expose aussi des courses entre alias du même produit : la résolution d’identité, les deltas de compteurs et les checkpoints doivent rester idempotents et cohérents. Une simple conversion de la boucle en `Promise.all` n’est pas une solution complète.

Réguler les requêtes **par domaine**. Quatre produits avec deux téléchargements chacun peuvent déjà produire huit requêtes simultanées. Respecter `Retry-After`, réduire le débit après 429, conserver un nombre borné de tentatives et l’interruption sur 403/challenge. Ne pas poursuivre les effets d’écriture d’un worker remplacé ou retourner d’une action avec des promesses actives non attendues.

Objectif combiné concurrence + I/O : **82,5 → 10–14 minutes**, soit une accélération effective de ×6 à ×8. Quatre travailleurs seuls ne garantissent pas cet objectif.

### Étape 5 — Réduire la persistance redondante et les attentes

Réexaminer les neuf échanges R2 par fiche : lectures de cache, regroupement éventuel des sources, reçus et écritures immuables. Toute évolution de format doit tenir compte des reprises existantes.

**Ne pas supprimer les HEAD/ETag ou les checkpoints uniquement pour accélérer.** Une alternative doit prouver les mêmes garanties face à une réponse perdue, un rejeu et un worker périmé. Les deltas doivent rester récupérables avant les effets qui pourraient entraîner un double comptage.

Remplacer la seconde d’attente systématique par une limitation explicite des requêtes source. Les étapes purement internes ne devraient pas subir arbitrairement le même délai que les requêtes au site.

### Étape 6 — Optimisations complémentaires selon les mesures

Activer la compression si utile, avec décompression correcte et maintien de la limite sur la taille décompressée. Mesurer les raisons des rendus Browserless avant d’en éviter ; ne pas perdre les sections ou contenus dynamiques.

Optimiser séparément les écritures de snapshot si l’assemblage est inclus dans le besoin final. Conserver sa révision verrouillée et les snapshots utilisés par les imports en cours.

## 6. Modèle de temps et objectif

Modèle simplifié, fondé sur les trois postes de la section 3 :

`T = 46,613 / gainDécouverte + tempsIndex + 82,473 / gainProduits`

| Scénario cumulatif | Durée projetée |
| --- | ---: |
| Situation initiale | 145,5 min |
| Indexation à 1,5 min | 130,6 min |
| + découverte accélérée ×6 | 91,7 min |
| + produits accélérés ×4 | 29,9 min |
| + produits accélérés ×8 au total | **19,6 min** |

Budget cible : **7,8 min découverte + 1,5 min index + 10,3 min produits**.

Ces gains sont effectifs, après overhead. Une concurrence nominale de huit n’implique pas une accélération ×8. Les optimisations se recouvrent : ne pas additionner à nouveau les onze minutes de temporisation aux gains par phase. La première plage de qualification proposée est **20–30 minutes**, avec un objectif vers 20 ; ne pas annoncer l’objectif atteint sans collecte froide réelle comparable.

Si l’assemblage final doit entrer dans les 20 minutes, ce scénario ne suffit pas : réserver par exemple quelques minutes à l’assemblage impose d’accélérer davantage la collecte. Le budget exact reste à qualifier.

## 7. Coûts et capacité backend

Aucun nouveau service payant n’est requis par ce plan. Privilégier l’infrastructure Convex/R2 existante ; ne pas ajouter un service de scraping externe par défaut.

| Changement | Effet attendu sur les coûts | Points à mesurer |
| --- | --- | --- |
| Moins d’étapes et de fichiers d’orchestration | Baisse probable | Invocations et requêtes R2 évitées |
| Agrégation des écritures de découverte | Baisse R2 probable | Éventuel transfert de coût vers écritures, lectures et index Convex |
| Concurrence produits/collections | Volume utile similaire ; pas de multiplicateur automatique de facture | Mémoire, durée facturée cumulée, limites de concurrence et nouvelles tentatives |
| Moins d’I/O par produit | Baisse probable | Méthodes R2, taille des objets, coût de reprise |
| Compression | Moins d’octets transférés, un peu plus de CPU | Temps et octets réels ; conditions tarifaires applicables |
| Moins de rendus Browserless inutiles | Baisse éventuelle | Fréquence, durée et forfait réels |

Exemple **hypothétique**, pas une conception validée : passer de neuf à six requêtes R2 par produit ferait passer ce poste de 8 676 à 5 784 requêtes, soit −33 %. Cela ne signifie pas −33 % sur la facture globale : les méthodes R2 ont des tarifications différentes et d’autres postes subsistent.

Ne pas déduire la facture du seul temps mural. Comparer le temps d’exécution cumulé, la mémoire, les appels, les octets et les rendus ; appliquer les tarifs et franchises effectifs avant d’estimer un montant. Une concurrence excessive peut augmenter la facture par les reprises. Ne pas promettre zéro surcoût sans mesure.

## 8. Garanties fonctionnelles à préserver

- Convex reste la source de vérité éditable des catalogues migrés ; R2 conserve sources, checkpoints et snapshots immuables.
- Identité source stable, déduplication des alias et union correcte des appartenances aux collections.
- Conservation des corrections manuelles, de la langue, des tags anglais et de la résolution métier commune.
- Même couverture de produits, variantes, images, descriptions et sections ; les erreurs partielles restent visibles.
- Contrôles d’accès et protections réseau : DNS validé, refus des adresses privées, redirections et tailles bornées.
- Pause/reprise, annulation, génération, tâche active et écritures conditionnelles cohérentes.
- Pas de raccourcissement du bail de quinze minutes ou du watchdog pour masquer une lenteur. Respecter la limite de durée des actions Convex.
- Compatibilité avec les opérations existantes ou procédure explicite de transition ; un déploiement peut rencontrer des tâches en cours.
- Isolation des snapshots, identité des produits importés et garanties du moteur Shopify inchangées, y compris lors des optimisations d’import de la section 11.

## 9. Validation attendue

### Correctness

Tests ciblés sur les nouveaux risques : concurrence sur une identité partagée, collections qui se recouvrent, réponse de persistance perdue, rejeu après crash, ancien worker après reprise, pause/annulation, 429 avec `Retry-After`, 403, pagination en boucle et reprise de lots partiellement réussis.

Comparer les identités et le contenu normalisé, pas seulement le nombre final de produits. Un catalogue vivant peut changer : utiliser des fixtures identiques pour l’égalité fonctionnelle, et documenter les différences de source sur les essais réseau.

### Performance et coût

1. Mesurer une référence instrumentée, si possible sur le même état source et la même configuration.
2. Mesurer une collecte froide optimisée, sans bénéficier des sources d’une collecte précédente.
3. Mesurer séparément une reprise avec cache et un scénario d’erreur contrôlé.
4. Répéter sur plusieurs exécutions comparables si le budget le permet ; rapporter médiane et dispersion. Ne pas présenter un p95 fiable à partir de quelques essais.
5. Fournir le détail par phase, requêtes source et R2, octets, reprises, Browserless et consommation Convex. Vérifier que le gain n’est pas obtenu par une perte de couverture.

Ne pas relancer en boucle une collecte complète avant de valider les changements sur un échantillon représentatif. Réserver la collecte complète à la qualification du débit réel.

### Vérifications du dépôt et contrôle manuel

Exécuter les tests pertinents, `rtk npm run typecheck`, `rtk npm run build` et les contrôles requis par le dépôt ; `rtk npm run check:convex-contract` si l’intégration frontend/backend change. Vérifier manuellement la progression et la pause/reprise dans l’application authentifiée. Un test isolé ou synthétique ne remplace pas ce contrôle.

Mettre à jour les documents de contexte, qualification et exploitation avec les contrats réellement modifiés et les preuves réellement obtenues.

## 10. Exécution et autorisations

Ce document décrit un travail futur ; il n’autorise pas à lui seul des mutations en production ou un import Shopify réel.

- Vérifier et annoncer la cible avant toute commande affectant un déploiement. Dev connu : `curious-greyhound-437` ; prod connue : `youthful-bandicoot-479`.
- `npx convex dev --once` déploie réellement : ce n’est pas un contrôle local.
- Les benchmarks en dev doivent être isolés pour préserver le catalogue existant et éviter des relances concurrentes sur le même domaine.
- Aucun changement de production, transfert dev/prod, suppression de données ou import Shopify réel sans autorisation correspondant à cette action.

Livrable attendu de l’implémentation : changements cohérents et testés, comparaison avant/après des temps et consommations, limites restantes, et conclusion explicite sur l’atteinte ou non des 20 minutes. Si la cible n’est pas atteinte, identifier le poste dominant mesuré plutôt que multiplier arbitrairement la concurrence.

## 11. Extension : import Shopify et taille de lot configurable

### Décision utilisateur

La taille des lots envoyés à Shopify doit être **paramétrable par variable d’environnement serveur**, et non rester fixée à 25 dans le code. Cette demande porte sur la configuration future ; aucune variable de déploiement n’a été modifiée pendant l’investigation.

Contrat proposé pour l’implémentation :

- Nom : `CATALOG_IMPORT_BATCH_SIZE`, dans l’environnement **Convex**, jamais avec un préfixe `VITE_`.
- Valeur par défaut proposée : **100 produits** par opération bulk. Ce défaut est une recommandation technique, pas une valeur déjà qualifiée ni une valeur numérique imposée par l’utilisateur.
- Accepter un entier strictement positif. Refuser explicitement les valeurs vides si présentes, non numériques, fractionnaires, nulles, négatives ou hors de la plage applicative documentée ; ne pas les tronquer silencieusement avec `parseInt`.
- Qualifier au minimum 100 et 250 ; permettre une valeur couvrant tout le pilote, par exemple 1 000 pour 964 produits, une fois les garde-fous ci-dessous implémentés. Ne pas présenter 250 comme un plafond Shopify du nombre de produits dans un fichier bulk.
- Définir et documenter une borne applicative raisonnable selon la mémoire et les volumes mesurés. La configuration doit rester soumise à une limite en octets du JSONL ; un nombre de produits ne suffit pas à borner sa taille.
- Il s’agit d’un plafond de lignes produits effectivement soumises dans un bulk, distinct de la pagination du stockage, du nombre de vérifications par invocation et du nombre d’opérations bulk simultanées. Un lot peut être plus petit à cause de la fin du catalogue, de la taille du fichier ou des produits exclus/existants.
- Capturer la valeur effective à la création d’un nouvel import et la conserver pour ses reprises. Une modification d’environnement doit s’appliquer aux nouveaux imports sans redécouper les lots déjà préparés ou soumis. Prévoir explicitement la compatibilité avec les imports anciens sans ce champ et leurs checkpoints de 25.
- Documenter la variable, sa valeur par défaut, ses bornes et sa prise en compte dans `docs/catalog-import.md` et dans le modèle d’environnement approprié du dépôt, s’il existe.

### État et performances observés

Inspection en lecture seule du dev `curious-greyhound-437`, le 25 septembre 2026 :

- Boutique cible : **Peluche**, `dp2iki-0b.myshopify.com`.
- Import : `q1727tzh0t8g7rdtd11y2pb76s8f3zdq`, lancé à 22:42:47, heure de Paris.
- Au dernier relevé du diagnostic : 200 produits validés, zéro échec comptabilisé, phase `importProducts`. L’import avançait ; ces chiffres ne décrivent pas son état final.
- Préparation : **181,929 secondes**, environ trois minutes.
- Sept lots terminés de 25 produits : **102,073 secondes en moyenne**, entre 98,650 et 104,286 secondes.
- Les logs de ces cycles montrent cinq invocations de travail par lot : une première d’environ 14–17 secondes, trois courtes de 2–4 secondes et une dernière de 38–40 secondes. Le code permet de les rapprocher de la préparation/soumission, des contrôles d’avancement et du traitement final ; aucun profilage interne ne sépare précisément Shopify de R2.
- Environ 40 secondes entre invocations par cycle correspondent aux quatre attentes de dix secondes. Shopify travaille pendant une partie de ces attentes : les supprimer ne garantit pas 40 secondes gagnées par lot.
- Projection linéaire : **environ 66 minutes pour la seule phase produits** de 964 fiches au même rythme.
- Phase suivante `importLinks` : dix fiches par tranche et dix secondes entre continuations, soit **96 pauses = 16 minutes** pour 964 fiches, avant même le temps de traitement.

En ajoutant préparation et pauses de réécriture, on obtient environ **85 minutes projetées**, hors travail effectif de réécriture et finalisation. Ce n’est pas un temps final mesuré. Ne pas confondre ce diagnostic avec l’import précédent annulé, `q17b4szjczyk4wne5zkz1sc09s8f3gdf`, qui avait comptabilisé 75 échecs.

### Limites Shopify vérifiées

La variable `SHOPIFY_API_VERSION` du dev a été lue : **2026-04**. La documentation officielle consultée indique :

| Limite | Conséquence |
| --- | --- |
| Fichier JSONL limité à **100 Mo** | Borne de taille par opération ; mesurer les octets sérialisés avant soumission et garder une marge |
| Une exécution de mutation par ligne JSONL | Les 25 produits actuels sont un choix du code, pas un plafond bulk Shopify ; 100, 250 ou 964 lignes sont envisageables |
| Jusqu’à **5 opérations bulk mutation simultanées par application et boutique**, depuis 2026-01 | Possibilité distincte de la taille des lots ; ne pas lancer automatiquement cinq opérations sans coordination ni qualification |
| Durée maximale de **24 heures** par opération bulk | Conserver le suivi d’état et la gestion des échecs/temps dépassés |
| Une seule connexion GraphQL dans la mutation bulk | Maintenir la conformité de la mutation soumise |
| Limite générale de 250 éléments pour les tableaux d’entrée, sous réserve des règles spécifiques aux mutations | Ne pas confondre un tableau dans les variables d’une mutation avec les lignes indépendantes d’un fichier JSONL |

Sources à revérifier à l’implémentation : [guide des imports bulk](https://shopify.dev/docs/apps/build/apis/graphql-admin/bulk-operations/imports), [limites API](https://shopify.dev/docs/api/usage/limits). Les requêtes GraphQL ordinaires de recherche et de vérification restent soumises au budget de coût Shopify.

### Changements nécessaires au-delà de la variable

Fichiers principaux : `convex/catalogImport/shopify.ts`, `convex/catalogImport/graphql.ts`, `convex/catalogImport.ts`, `convex/catalogImportActions.ts`, `convex/catalogImport/storage.ts` et `convex/shopify/client.ts`.

1. **Dissocier taille de soumission et taille de traitement.** Préparer les gros lots par étapes bornées, soumettre une fois, puis lire et vérifier les résultats en tranches reprenables avec progression par ligne/produit. Au rythme actuel de 38 secondes pour 25 produits, vérifier 964 produits d’un coup représenterait environ 24 minutes, au-delà des dix minutes d’une action Convex. Changer seulement le `25` de `listKeys` ne suffit pas.
2. **Conserver les résultats et la progression.** Actuellement, un produit dont les médias ou collections ne sont pas prêts peut provoquer un retour avant la fin du lot ; le passage suivant peut retélécharger les résultats, reprendre les premières lignes et répéter des écritures. Enregistrer les validations acquises, les produits encore en attente et les erreurs, sans double comptage.
3. **Séparer l’attente des médias de l’avancement des soumissions.** Un produit lent ne doit pas bloquer arbitrairement tout le catalogue. Conserver une finalisation honnête : les produits en attente ne sont pas déclarés entièrement validés. Respecter la limite Shopify de concurrence et la coordination par boutique.
4. **Distinguer attente distante et continuation interne.** Les dix secondes imposées par `settle` à toute continuation d’import sont inadaptées à `importLinks`. Utiliser une attente seulement quand une opération distante doit réellement progresser ; envisager un polling adapté ou un webhook de fin, sans supprimer les vérifications.
5. **Éviter les mises à jour inutiles de descriptions.** Le code actuel lance `DESCRIPTION_UPDATE` pour chaque produit créé rencontré dans la passe liens. Comparer le résultat à la description effectivement soumise avant d’écrire. Préserver la résolution des liens internes et les avertissements.
6. **Réduire les I/O et réguler les appels GraphQL.** Qualifier une concurrence bornée et/ou des lectures groupées. Le client actuel ne remonte pas `extensions.cost`/`throttleStatus` : rendre le budget disponible avant d’accélérer fortement les appels ordinaires. Conserver les garanties des écritures R2.
7. **Adapter les limites locales de fichiers.** Le lecteur de résultats refuse actuellement plus de 8 000 000 caractères et le lecteur JSON R2 borne ses objets à 32 Mio. Un fichier accepté par Shopify peut dépasser ces limites applicatives. Lire, découper ou stocker progressivement plutôt que relever aveuglément tous les plafonds ; compter les octets et borner la mémoire.

### Effet attendu et coûts

Pour 964 produits tous à créer, hors découpage par taille :

| Taille maximale de lot | Nombre d’opérations bulk |
| --- | ---: |
| 25, actuel | 39 |
| 100 | 10 |
| 250 | 4 |
| 1 000 | 1 |

Ce tableau chiffre la réduction des cycles, **pas une accélération proportionnelle du temps total**. La préparation, les validations, les images et les liens ont leur propre coût. Aucun temps cible d’import de 20 minutes n’a été validé ; l’objectif initial de 20 minutes concerne la collecte.

Aucun nouveau service payant n’est nécessaire. Moins de soumissions, de polling et de travail répété devrait réduire l’orchestration ; un fichier plus gros augmente la mémoire et le coût potentiel d’une reprise mal conçue. Comparer les appels GraphQL, requêtes R2, durées cumulées et reprises avant/après, sans promettre un coût constant non mesuré.

### Validation spécifique

- Tester la configuration absente, 25, 100, 250, 1 000 et les valeurs invalides ; tester le fractionnement en fonction des octets et des lignes, sans perte ni doublon aux limites de pagination.
- Tester une modification d’environnement entre deux invocations : lot et import déjà commencés restent stables ; le prochain nouvel import adopte la nouvelle valeur.
- Tester une réponse de soumission perdue, la réconciliation de l’opération bulk, une pause et un crash à chaque étape, les erreurs partielles, une ligne absente/dupliquée et un média lent sans retraitement des validations acquises.
- Préserver les produits en brouillon, les tags manuels, les identités distantes, l’absence de doublons, les règles des collections et le snapshot source figé. Lire aussi [le contexte de réparation des identités](catalog-identity-repair.md) ; ne pas réexécuter sa procédure historique.
- Qualifier séparément première création et réimport de produits existants ; leurs chemins et coûts diffèrent. Un réimport rapide ne prouve pas le débit de première création.
- Une qualification réelle écrit dans Shopify, même si le backend est en dev : demander une autorisation spécifique pour la boutique et l’essai envisagés si elle n’est pas déjà fournie dans la session d’implémentation. Le présent ajout au CR n’autorise aucune exécution d’import.
