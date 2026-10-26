# Revue des conflits Flux Google

La vue `/google-feed/preview?status=conflict&page=1` présente les conflits par produit. La liste utilise l’index `by_shop_id_and_status_and_included_and_product_id` et une pagination par identifiant produit : les variantes d’un produit ne sont pas séparées entre plusieurs pages et les brouillons récents d’autres statuts ne masquent pas les conflits anciens. Aucun total global incomplet n’est présenté comme exhaustif.

## Lecture

`googleFeedConflicts.listProducts` retourne dix produits par page, avec recherche dans les titres (casse et accents neutralisés). Une recherche parcourt au plus soixante groupes par requête ; si la suite existe, la pagination permet de la poursuivre. Seuls les conflits inclus et non manuels sont actionnables.

`googleFeedConflicts.productDetails` charge les brouillons du produit et les variantes concernées. Les attributs sont séparés pour éviter qu’un choix de genre modifie aussi l’âge ou la catégorie. Les règles proviennent de `matchingRuleIds`, avec repli sur `sourceRuleId`. Les critères remplis sont calculés avec le même `conditionMatches` que le moteur de règles, et affichent les valeurs effectivement trouvées. Les variantes permettent d’identifier les règles qui les concernent individuellement.

Ces explications décrivent les règles et données **actuelles**, pas un historique immuable de l’évaluation. Les règles modifiées depuis le brouillon, inactives et supprimées sont signalées. Un recalcul est nécessaire après modification d’une règle. Aucun changement des conditions métier, des priorités ou des règles d’âge n’est inclus dans cette interface.

## Résolution et concurrence

`googleFeedConflicts.resolve` accepte un produit, un attribut, une valeur et les identifiants/horodatages des brouillons sélectionnés. L’identité est dérivée de l’authentification ; la boutique active, le produit et chaque brouillon sont vérifiés côté serveur. Une sélection obsolète provoque un rejet atomique.

La mutation ne modifie que les conflits encore inclus, non manuels et sélectionnés. Une correction manuelle, une exclusion ou une publication intervenue après l’ouverture est conservée. Les corrections deviennent des brouillons manuels prêts à publier, sans appel Shopify. Une analyse de règles qui se termine après une correction revérifie `sourceKind` dans la transaction de sauvegarde et ne remplace pas le choix manuel.

Les brouillons d’autres attributs, produits ou variantes ne sont pas modifiés. Le formulaire ne présélectionne pas de valeur. Une modification des brouillons réinitialise la décision et sa sélection ; les variantes peuvent être décochées individuellement. « Laisser en attente » navigue sans écriture.

## Limites et validation

- La revue d’un produit est bornée à 1 000 brouillons. Dépasser cette borne produit une erreur explicite ; aucune résolution partielle silencieuse n’est effectuée.
- L’ancien aperçu des autres statuts reste borné à 5 000 brouillons, mais signale maintenant ses compteurs partiels. La vue des conflits par produit est indépendante de cette borne.
- Les tests `convex/tests/googleFeed/conflicts.test.ts` couvrent les droits, l’isolation entre boutiques et produits, la résolution partielle, les valeurs manuelles, les exclusions, la concurrence avec les évaluations, les sélections périmées, les règles supprimées/modifiées, la pagination et l’accès aux conflits au-delà de 5 000 brouillons récents.
- La revue visuelle des composants est réalisée sur données de test. Elle ne constitue pas un parcours navigateur authentifié avec les données réelles.
- Le backend est validé sur le développement `curious-greyhound-437`. Le déploiement de production et les modifications des règles/données de production nécessitent une autorisation distincte.
