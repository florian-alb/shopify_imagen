# OpenAI Batch durable

Le bulk reste un seul `generationJobs`. Les nouvelles générations OpenAI Batch utilisent `@convex-dev/workflow` et des segments internes. Gemini conserve son parcours ; les anciens jobs avec un identifiant fournisseur conservent leur récupération, désormais progressive pour OpenAI.

Le composant Workflow `0.4.9` requiert Convex `1.46.0` au minimum. Le lockfile fixe les versions utilisées pour les vérifications ; les tests emploient `convex-test` `0.0.60` et enregistrent le véritable composant Workflow.

## Configuration

Variables serveur Convex, lues au démarrage puis figées dans le job :

| Variable | Défaut | Bornes |
| --- | ---: | --- |
| `OPENAI_BATCH_SEGMENT_SIZE` | 100 images | 1–100 |
| `OPENAI_BATCH_MAX_CONCURRENT` | 2 segments | 1–3 |

Le plafond de segments actifs s'applique à la clé OpenAI partagée par le déploiement, entre les jobs, et inclut les anciens segments OpenAI actifs et les annulations non confirmées. Les soumissions incertaines retiennent leur place. Les étapes Node utilisent un Workpool limité à trois workers. Ces limites ne représentent pas le quota réel du compte OpenAI.

Le point d'entrée accepte au maximum 900 tâches OpenAI Batch par job. Pour 300 produits × trois images, neuf segments de 100 sont créés à mesure que les places se libèrent. Le démarrage est une mutation programmée, transactionnelle ; le watchdog récupère aussi les anciens démarrages restés en file.

## Étapes persistées

1. Attribution des tâches et démarrage du Workflow dans la même transaction.
2. Préparation d'une image par étape, au maximum quatre références. Une référence est identifiée par job, produit et URL source ; les autres images et segments la réutilisent. L'objet R2 déterministe est vérifié avant un téléchargement après interruption. Chaque référence est enregistrée avant de passer à la suivante. L'analyse de contexte utilise la référence préparée.
3. Téléversement d'un fichier JSONL contenant les URLs R2, sans base64 de référence ; enregistrement de son identifiant avant la création du batch.
4. Intention de soumission enregistrée avant le POST. Une clé immuable de segment est envoyée dans les métadonnées OpenAI avec les identifiants du job et du segment. Le reçu est enregistré dès réception, même si une annulation intervient entretemps.
5. Attente OpenAI sans monopoliser une action Node. Les statuts et fichiers de sortie sont persistés. Les sorties partielles des batches expirés, échoués ou annulés restent récupérables.
6. Lecture JSONL progressive, deux lignes par étape, avec curseur exact en octets et index du fichier de succès/erreurs. Une ligne est validée avant l'avancement du curseur. Une interruption entre l'image et le curseur rejoue une ligne sans doubler son traitement. Aucun fichier de résultats complet n'est chargé en mémoire.
7. Post-traitement avec lease, contrôle de tentative avant validation et objet final déterministe. Seules les tâches échouées sont relancées : une erreur de récupération réouvre le même segment à son curseur, une erreur de post-traitement réutilise l'image intermédiaire, et une erreur de génération crée une nouvelle tentative.

Chaque étape dispose d'un lease de onze minutes, supérieur à la durée maximale de l'action Node. Un ancien worker ne peut valider l'état d'un worker qui l'a remplacé. Une erreur du moteur Workflow après épuisement de ses reprises programme un nouveau Workflow à partir des checkpoints. Les journaux de Workflows terminés sont nettoyés après sept jours ; les identifiants et états applicatifs restent conservés.

## Soumissions incertaines et annulations

Un timeout, une réponse serveur ambiguë ou une interruption après le POST n'autorise **jamais** un second POST automatique. Le Workflow parcourt la liste paginée OpenAI, enregistre son curseur et cherche une correspondance exacte de clé de soumission **et** fichier d'entrée. Une correspondance unique est rattachée ; aucune correspondance ou plusieurs correspondances laissent un état explicitement incertain. Les refus HTTP explicites sont distingués des réponses inconnues et peuvent être relancés après correction.

Une annulation pendant cette fenêtre continue le rapprochement en lecture ; un batch retrouvé est annulé et sa place reste réservée jusqu'à un état fournisseur terminal. Les refus explicites reçus pendant l'annulation sont aussi conservés et libèrent cette réservation. La relance est refusée tant que la soumission ou son annulation reste incertaine.

Si un autre parcours passe le bulk en échec pendant qu'un segment est actif, le Workflow ferme les segments non soumis et rapproche/annule les soumissions déjà tentées. La relance ne peut pas doubler un batch encore actif ni réutiliser son créneau avant confirmation.

Les anciens échecs sans identifiant et sans clé de soumission ne disposent pas de cette identité rétrospective. La relance automatique est refusée pour ces anciennes soumissions : il faut vérifier leur acceptation dans le compte OpenAI et rapprocher les identifiants avec l'opérateur avant toute nouvelle génération. La nouvelle architecture ne prétend pas prouver une absence d'acceptation par une liste vide.

## Bornes et stockage

- Référence fournisseur : 20 MiB et 16 millions de pixels au maximum dans le nouveau parcours ; JPEG normalisé à 1024 px. Le parcours synchrone/Gemini conserve ses paramètres existants.
- Fichier d'entrée : 8 MiB maximum, contrôle des identifiants uniques et de une à quatre références par image.
- Ligne de sortie : 32 MiB maximum ; un seul résultat décodé est consommé à la fois. Le téléchargement dispose de 240 secondes, les uploads de 120 secondes, la création de 60 secondes.
- HTTP Range : vérifié lorsqu'il est honoré. Sans Range, le préfixe déjà validé est lu et jeté progressivement. La mémoire reste bornée, mais le volume téléchargé et la durée augmentent ; le comportement réel doit être mesuré.
- Les références partagées R2 ne sont pas supprimées lors du traitement d'une première image : elles restent disponibles pour les autres segments et reprises. Les fichiers d'entrée OpenAI et références partagées nécessitent une politique de rétention à qualifier.

## Publications Shopify

Les publications utilisent un lease par produit et un journal d'intention par image, URL de résultat et produit destinataire. L'intention précède la création du média ; les identifiants reçus sont persistés immédiatement. Une reprise recherche les médias absents du snapshot initial avec l'identité attendue. Une correspondance absente ou ambiguë bloque une seconde création. Les médias déjà publiés et les retouches qui ont mis à jour leur média Shopify sont réutilisés.

Pour les produits séparés, une duplication acceptée sans réponse reste incertaine et bloque une seconde duplication ; elle demande une vérification opérateur. Aucun mécanisme local ne garantit l'identité des effets externes exécutés avant l'introduction de ce journal.

## Qualification

Les tests utilisent le véritable composant Workflow avec IO simulées, sans appels payants. Ils couvrent 900 tâches, neuf segments, concurrence entre bulks, cache de références, interruptions, reçus perdus, annulations incertaines, leases obsolètes, curseurs, doublons, conservation des résultats et publications. Le harness `scripts/openai_batch_ui_check.tsx` affiche les vrais composants de suivi avec des données fictives.

Ces tests ne simulent pas les limites de ressources du cloud Convex et ne remplacent pas un parcours authentifié avec les fournisseurs réels. À qualifier après autorisation : quota Batch du compte et modèle, durée/mémoire avec références et sorties réelles, support Range, visibilité des métadonnées après perte de réponse, rétention et accessibilité R2, et reprises/publications contre les services réels. Aucun bulk payant de qualification n'a été lancé.

Les échecs historiques sont documentés dans [l'audit de production](openai-batch-production-audit.md).

## Vérifications du 7 octobre 2026

| Vérification | Résultat |
| --- | --- |
| `npm test -- --silent` | 395 tests, 59 fichiers, tous réussis |
| `npm run typecheck` | Réussi |
| `npx tsc --noEmit -p convex/tsconfig.json` | Réussi |
| `npm run build` | Réussi ; avertissement habituel sur les chunks de plus de 500 kB |
| `npm run check:convex-contract` | Réussi, 103 références frontend |
| ESLint ciblé sur le nouveau moteur et ses tests | Aucune erreur ni avertissement |
| `git diff --check` | Réussi |
| `npx convex dev --once` | Fonctions prêtes sur `curious-greyhound-437` à 01:53:58 Paris |

Avant la validation en développement, les requêtes en lecture seule ont confirmé zéro job queued/running, zéro image en post-traitement et aucune fonction de génération programmée en attente. Aucun déploiement de production ni appel de génération payant n'a été exécuté.

Le contrôle local Chrome headless a navigué sur les cinq scénarios du harness, ouvert les détails et activé le thème sombre, à 1440 px et 390 px. Aucune erreur JavaScript ni débordement horizontal ; dix captures sous `output/openai-batch-ui/`, dont [phases simultanées](../output/openai-batch-ui/parallel.png) et [soumission incertaine sur mobile](../output/openai-batch-ui/uncertain-mobile-dark.png), inspectées visuellement. Les requêtes externes étaient bloquées. Les outils CUA ne disposaient pas de navigateur utilisable ; les appels natifs suspendus ont été interrompus avant ce contrôle local. Ce contrôle utilise les composants réels avec des données fictives, sans authentification réelle ni fournisseurs.
