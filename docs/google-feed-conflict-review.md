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

## Publication et erreurs

Le bouton de publication apparaît dans « Prêts à publier ». Sa confirmation précise qu’il concerne toute la boutique, y compris les produits hors recherche. Les conflits et échecs sont exclus de cette publication normale.

Une relance depuis « Erreurs Shopify » prend un instantané des seuls échecs du produit. Chaque ligne doit encore être en échec et conserver son horodatage avant d’être reprise. Une correction manuelle ultérieure est donc préservée. Les nouveaux échecs du même passage ne sont pas repris en boucle. La relance historique conserve son périmètre de run.

L’index `by_shop_id_and_status_and_last_run_id_and_included` permet de cibler une relance historique. Il n’y a aucun champ obligatoire ajouté ni reprise de données. Le backend doit être publié avant le frontend qui utilise les nouvelles requêtes.

## Validation et limites

- `convex/tests/googleFeed/workspace.test.ts` couvre les trois vues, plusieurs attributs d’un même produit, la recherche, la pagination par produit, l’isolation des droits, la résolution partielle, les corrections concurrentes, les sélections périmées et le périmètre des publications/relances.
- Les tests de conflits existants couvrent aussi les règles modifiées/supprimées et l’accès aux conflits au-delà de 5 000 brouillons récents.
- Vérifications locales : 688 tests, typecheck app/Convex, contrat public et build. La revue navigateur utilise les composants réels avec des données et actions simulées : retour règle → produit, choix partiel, préservation des corrections manuelles, trois vues, recherche et affichage mobile. Ce contrôle ne constitue pas un parcours authentifié avec publication Shopify réelle.
- Le backend de développement est `curious-greyhound-437`. La production `youthful-bandicoot-479` n’est pas modifiée par cette livraison locale.
