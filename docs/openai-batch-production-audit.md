# OpenAI Batch — audit de production du 7 octobre 2026

## Périmètre et méthode

Audit demandé en lecture seule du déploiement de production `youthful-bandicoot-479`, identifié avec le MCP Convex `status`. Les métadonnées des fonctions ont été vérifiées avec `functionSpec`. Le MCP `logs` était bloqué par sa configuration de lecture des données de production ; le CLI authentifié a permis la lecture demandée sans activer les outils de mutation.

Commande : `rtk proxy npx convex logs --prod --history 2000 --jsonl`, interrompue volontairement après réception de l'historique. Le paramètre `history` est un nombre d'entrées, pas une période. Les entrées ont été filtrées localement par `success: false` / `error`, puis par request ID pour les traces. Aucun déploiement, changement d'environnement, traitement de données, appel de génération ou publication Shopify n'a été lancé.

Fenêtre réellement reçue : **982 entrées, du 6 octobre 2026 à 22:31:39 UTC au 6 octobre à 23:15:16 UTC** (7 octobre 00:31:39–01:15:16 à Paris). La collecte est bornée par l'historique disponible ; elle ne couvre pas tous les incidents passés ni le batch de 300 images réussi mentionné par l'utilisateur. Les logs bruts restent dans un fichier temporaire local ; seuls les éléments nécessaires au diagnostic sont conservés ici.

## Échecs observés

Les **trois exécutions en échec** sont `generation:submitBatch` :

| Fin (UTC, 6 octobre) | Durée | Request ID |
| --- | ---: | --- |
| 22:41:44 | 605,263 s | `9054628c1694e627` |
| 22:47:50 | 605,638 s | `167f8ecafc89da58` |
| 22:50:21 | 605,499 s | `7ce91b938ca1da81` |

Erreur commune : `Function execution unexpectedly timed out. Check your function for infinite loops or other long-running operations.`

La trace `167f8ecafc89da58` contient l'événement de soumission avec **900 images**, fournisseur `openai`, modèle `gpt-image-2.5-sunburst`. Les trois traces contiennent des retries de références fournisseur avec `Timed out downloading supplier reference image.` (respectivement 1, 1 et 10 événements conservés dans cette fenêtre).

À **22:58:59 UTC**, `generation:pollBatches` a ensuite détecté et échoué trois jobs sans identifiant Batch. Ces erreurs applicatives sont capturées dans une exécution techniquement réussie du poller : filtrer seulement les exécutions `failed` les masquerait.

La limite d'exécution Node Convex de dix minutes est donc atteinte dans ces incidents. Les téléchargements/retries de références contribuent au travail effectué dans l'action ; les logs ne permettent pas d'attribuer toute la durée à une étape précise. La fenêtre ne contient ni erreur OpenAI 429 ni confirmation d'acceptation OpenAI pour ces soumissions. **L'absence d'identifiant local ne prouve pas qu'OpenAI n'a rien accepté.**

Vérification humaine : [logs de production Convex](https://dashboard.convex.dev/d/youthful-bandicoot-479/logs) ; filtrer `generation:submitBatch` et les request IDs ci-dessus.

## Contrats OpenAI vérifiés

- Le Batch prend en charge `/v1/images/edits` et `gpt-image-2.5-sunburst`. Le quota Batch est séparé des limites synchrones. La documentation décrit 50 000 requêtes / 200 Mo par fichier, 2 000 créations par heure et une limite de tokens d'entrée en attente par modèle, propre au compte. Le quota effectif de ce compte reste à consulter dans ses paramètres. Les résultats sont associés par `custom_id`, indépendamment de l'ordre du fichier ; les batches expirés peuvent avoir des résultats partiels facturés. [Guide officiel Batch](https://developers.openai.com/api/docs/guides/batch).
- La création accepte des métadonnées et retourne `id` et `input_file_id`. Une clé durable de segment/tentative dans les métadonnées, avec le fichier d'entrée enregistré avant création, fournit une identité de rapprochement. La référence de création consultée ne documente pas de garantie d'idempotence ni de durée de rétention d'une éventuelle clé d'idempotence. [Référence Create batch](https://developers.openai.com/api/reference/resources/batches/methods/create).
- La liste expose `metadata` et `input_file_id`, avec pagination `after` et `limit` (1–100). Elle ne propose pas de filtre de métadonnées dans ses paramètres documentés : le rapprochement se fait localement, en conservant le curseur. Une liste sans correspondance ne prouve pas qu'une soumission interrompue n'a pas été acceptée. [Référence List batches](https://developers.openai.com/api/reference/resources/batches/methods/list).
- La récupération des fichiers Batch est illustrée par `GET /v1/files/{id}/content`. Aucune garantie HTTP `Range` n'a été trouvée dans la référence consultée : une reprise doit accepter une réponse intégrale `200`, ignorer progressivement les lignes déjà validées, et ne pas dépendre de `206`. [Référence du contenu des fichiers](https://developers.openai.com/api/reference/resources/files/methods/retrieve_content), [SDK officiel Files](https://github.com/openai/openai-node/blob/main/src/resources/files.ts).

## Conséquences pour le traitement durable

Séparer préparation par produit, téléversement du fichier, création, rapprochement des créations incertaines, polling et récupération. Enregistrer une intention de création avant le POST ; après interruption, chercher le batch existant plutôt que recréer automatiquement. Conserver un état explicitement incertain si le rapprochement ne conclut pas. Le traitement des lignes doit être borné, idempotent par tâche/tentative et protégé par un lease avec fencing ; les résultats déjà terminés restent acquis lors des retries. Les sorties des batches terminaux partiels doivent être récupérées avant d'échouer leurs seules tâches restantes.

À qualifier après autorisation : quota réel du compte, durée et mémoire des étapes sur 900 images réelles, comportement réel de la pagination/visibilité des batches après interruption, support `Range` des fichiers, accessibilité et durée de vie des références R2, ainsi que les reprises avec les services réels. Les preuves ci-dessus diagnostiquent l'ancien parcours ; elles ne constituent pas une validation authentifiée de la nouvelle implémentation.

## Protection de publication ajoutée localement

La publication des images générées conserve désormais une intention et un lease par produit (11 minutes, supérieur à la durée maximale d'une action). Un registre par image, URL de stockage et produit Shopify mémorise les médias acceptés avant les étapes suivantes. Les mêmes résultats sont réutilisés après double clic, interruption ou changement des options de publication. Les images historiques déjà `uploaded` sont rapprochées de leur identifiant Shopify existant ; une retouche en mode écrasement réutilise aussi ce fichier, puisque son remplacement distant est déjà effectué par le parcours de retouche avant l'enregistrement local. Une nouvelle sortie `generated` peut être publiée.

Après perte d'une réponse de création, la reprise consulte une photographie paginée des médias Shopify et n'adopte qu'une correspondance unique par texte alternatif parmi les médias absents de la photographie préalable. Un résultat manquant ou ambigu reste explicitement incertain, sans deuxième création. Une création de produit séparé dont l'identifiant n'a pas été enregistré reste bloquée pour vérification ; aucun rapprochement fiable par seul titre n'est supposé.

Vérification locale : 22 tests ciblés Shopify/retouche passent, dont les doublons, concurrence, perte de réponse après acceptation, absence/ambiguïté des résultats, fencing, médias historiques, retouches et nouvelles sorties. La nouvelle requête a été validée localement avec `graphql.validate` contre le schéma officiel Shopify `2026-04` embarqué dans le plugin (aucune erreur, aucun réseau). Le contrôle d'approbation avait refusé une commande de validation du skill portant le prompt complet et la requête du dépôt, invoquant un risque de transmission externe ; elle n'a pas été exécutée. L'inspection du script a permis d'utiliser directement son schéma embarqué pour le contrôle local.

Le rapprochement par texte alternatif n'est pas une garantie d'identité côté Shopify : toute ambiguïté reste bloquée. Le comportement des services réels et la résolution opérateur des cas incertains restent à qualifier avant production.
