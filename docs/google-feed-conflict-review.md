# Espace de travail Flux Google

`/google-feed` regroupe les propositions dans une liste par produit. Les trois vues partagent la recherche, la pagination et le panneau produit :

- **À vérifier** : conflits non manuels et valeurs invalides incluses.
- **Prêts à publier** : brouillons inclus dont la valeur proposée diffère de Shopify, corrections manuelles comprises.
- **Erreurs Shopify** : échecs de publication inclus, avec relance par produit.

Un produit apparaît une fois dans chaque vue concernée, même si plusieurs attributs ou variantes nécessitent une action. Les variantes restent dans le panneau produit. Les propositions exclues, en publication ou confirmées ne sont pas dans ces files et ne sont pas supprimées. Le catalogue sans proposition ne fait pas partie de cet écran.

## Navigation et lecture

Le point d’entrée est `GoogleFeedWorkspacePage`. Les routes règles et historique restent accessibles depuis son en-tête. Le paramètre `returnTo` conserve la vue, la recherche, le produit et les curseurs ; ouvrir une règle puis revenir retrouve le produit. L’ancienne route `/google-feed/preview` redirige vers cet espace.

`googleFeedWorkspace.listProducts` utilise l’index `by_shop_id_and_status_and_included_and_product_id`. Les pages contiennent jusqu’à dix produits, sans couper leurs variantes. Une requête examine au plus soixante produits candidats et s’arrête après le groupe qui atteint 8 000 brouillons lus. La recherche neutralise la casse et les accents, puis cherche une sous-chaîne dans le titre et le handle. Lorsqu’une page de recherche ne contient aucun résultat mais possède une suite, l’interface poursuit le parcours des curseurs.

`countProducts` compte les produits distincts, indépendamment de la recherche. La lecture est bornée à 500 candidats et 2 000 lignes de repli. Si la suite existe, le compteur affiche `+` ; ce nombre ne prétend pas être un total exhaustif. `productDetails` charge au plus 1 000 brouillons du produit, puis seulement les variantes associées. Le dépassement produit une erreur explicite.

## Règles et décisions

Le panneau compare les règles applicables : nom, valeur proposée et critère rempli avec sa valeur observée. Les détails conservent les autres critères et la logique OR/AND. Les explications réutilisent `googleFeedConflicts.productDetails` et le même `conditionMatches` que le moteur. Elles décrivent les règles actuelles ; une règle supprimée, désactivée ou modifiée depuis l’analyse est signalée.

Les attributs sont traités séparément. Aucun choix n’est présélectionné. « Valider et suivant » appelle `googleFeedWorkspace.choose` avec le produit, l’attribut, la valeur et les identifiants/horodatages sélectionnés. Les variantes peuvent être décochées. « Passer » ne modifie aucune donnée.

La mutation dérive l’identité de l’authentification et vérifie la boutique, le produit et chaque ligne. Une proposition non manuelle périmée provoque un rejet atomique. Les corrections manuelles, exclusions et publications concurrentes sont conservées. Les nouvelles décisions deviennent des brouillons manuels ; aucun appel Shopify n’est fait à cette étape. Le moteur d’analyse conserve également les valeurs manuelles lorsqu’il enregistre ses résultats.

Une correction manuelle reste consultable dans le panneau. Sa modification explicite passe par `updateDraftValue`, avec contrôle d’horodatage et refus pendant une publication. La décision groupée ne l’écrase jamais.

### Correction de plusieurs produits

Dans « À vérifier », chaque produit possède une case à cocher. « Toute la page » sélectionne les produits actuellement affichés (au plus dix). « Sélectionner tous les produits filtrés » parcourt `listProducts` depuis le début avec la recherche actuelle, y compris les pages intermédiaires vides qui possèdent une suite. Les produits sont dédupliqués ; le compteur final correspond aux résultats effectivement parcourus, sans utiliser le compteur global borné. Un curseur absent ou répété provoque une erreur explicite. Une annulation ou une erreur conserve la sélection précédente et n’accepte jamais les résultats partiels comme une sélection complète.

La sélection reste active lors des changements de page. Elle est réinitialisée lors d’un changement de recherche, de vue ou de boutique. Les cases permettent de retirer certains produits, et « Tout désélectionner » vide le lot complet. Le périmètre est l’ensemble collecté au moment de la sélection ; les nouveaux résultats arrivant après celle-ci ne sont pas ajoutés automatiquement.

« Corriger la sélection » ouvre un panneau avec le champ et la valeur commune à appliquer. Le compteur précise le nombre de produits et de valeurs concernés ; les produits sans conflit ou valeur invalide pour ce champ ne sont pas modifiés. Aucun choix n’est présélectionné.

Le panneau lit un instantané `productDetails` pour chaque produit coché, avec quatre requêtes simultanées au maximum et une progression de chargement. Il ne conserve que les identifiants, titres, champs, statuts, sources et horodatages nécessaires à la correction. Il appelle ensuite la mutation existante `choose` une fois par produit, avec les identifiants et horodatages consultés. Les appels sont séquentiels et chaque produit garde l’atomicité et les contrôles de droits/concurrence du parcours individuel. Le lot n’est pas une transaction globale : une erreur n’empêche pas les produits suivants d’être traités. Les succès sont décochés ; les échecs restent sélectionnés avec leur message et un bouton de rechargement avant une nouvelle tentative. La progression est affichée et les contrôles de sélection sont désactivés pendant l’application. Les corrections manuelles, exclusions, publications concurrentes et autres champs sont conservés. Ce parcours prépare des brouillons, sans publier vers Shopify ni nécessiter de nouvelle fonction backend.

## Publication et erreurs

Le bouton de publication apparaît dans « Prêts à publier ». Sa confirmation précise qu’il concerne toute la boutique, y compris les produits hors recherche. Les conflits et échecs sont exclus de cette publication normale.

Une relance depuis « Erreurs Shopify » prend un instantané des seuls échecs du produit. Chaque ligne doit encore être en échec et conserver son horodatage avant d’être reprise. Une correction manuelle ultérieure est donc préservée. Les nouveaux échecs du même passage ne sont pas repris en boucle. La relance historique conserve son périmètre de run.

L’index `by_shop_id_and_status_and_last_run_id_and_included` permet de cibler une relance historique. Il n’y a aucun champ obligatoire ajouté ni reprise de données. Le backend doit être publié avant le frontend qui utilise les nouvelles requêtes.

## Validation et limites

- `convex/tests/googleFeed/workspace.test.ts` couvre les trois vues, plusieurs attributs d’un même produit, la recherche, la pagination par produit, l’isolation des droits, la résolution partielle, les corrections concurrentes, les sélections périmées et le périmètre des publications/relances.
- Les tests de conflits existants couvrent aussi les règles modifiées/supprimées et l’accès aux conflits au-delà de 5 000 brouillons récents.
- Vérifications locales : 688 tests, typecheck app/Convex, contrat public et build. La revue navigateur utilise les composants réels avec des données et actions simulées : retour règle → produit, choix partiel, préservation des corrections manuelles, trois vues, recherche et affichage mobile. Ce contrôle ne constitue pas un parcours authentifié avec publication Shopify réelle.
- Le backend de développement est `curious-greyhound-437`. La production `youthful-bandicoot-479` n’est pas modifiée par cette livraison locale.
- Correction multi-produits, y compris tous les produits filtrés : 37 tests ciblés passent (helpers du flux Google, conflits et espace de travail Convex), ainsi que `npm run typecheck`, `npm run check:convex-contract` et `npm run build`. `npm run lint` passe avec 67 avertissements préexistants hors des fichiers modifiés. Les tests couvrent le parcours de plusieurs pages, les pages intermédiaires vides, la déduplication, l’annulation, les erreurs de lecture/curseur, la concurrence bornée à quatre lectures et l’application aux produits hors page. Vérification navigateur des composants réels avec données/actions simulées : 22 produits filtrés sélectionnés sur plusieurs pages, navigation et exclusion d’un produit, correction par champ, produits hors filtre préservés, succès partiels et reprise d’un échec hors page, remise à zéro après recherche et affichage à 390 px. Aucun parcours authentifié ni appel Shopify réel n’a été effectué pour cet ajout ; le backend reste inchangé.
