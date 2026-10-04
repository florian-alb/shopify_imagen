# Refonte catalogue — vérification préalable du 29 septembre 2026

## Périmètre

Lecture du site public `https://www.kuscheltierland.de`, sans compte Shopify, écriture distante, déploiement ni modification du moteur. Analyse locale avec les extracteurs existants, Cheerio et `getConvexSize` de **Convex 1.39.1** installé dans le dépôt. Les scripts exploratoires et réponses HTTP sont temporaires ; le relevé durable est [le rapport JSON](../output/catalog-refonte-preflight-2026-09-29.json).

58 lectures HTTP de la source : sitemap racine, deux sitemaps utiles, 41 pages best-selling, quatre pages de collections et dix réponses pour cinq produits (JSON + HTML). Les lectures du script séquentiel sont espacées d’une seconde. Aucune erreur de lecture n’a interrompu ce relevé. Ce n’est ni un benchmark du futur moteur ni un test de son interface.

## Sitemaps et menu

| Mesure | Résultat |
| --- | ---: |
| Produits du sitemap | **964** |
| Collections du sitemap | **115** |
| Collections du menu principal extrait | **74** |
| Collections du sitemap absentes de ce menu | **41** |

Le sitemap produits contient aussi la page d’accueil : son entrée ne doit pas devenir un produit. Le menu principal a été extrait depuis le HTML de la page `/collections/all`; les 74 identités ont également été retrouvées par une lecture indépendante des liens collections du `header`. Il ne s’agit pas d’un contrôle navigateur de toutes les variantes mobile ou interactions dynamiques du thème.

Les 41 collections hors menu incluent notamment `hirsch-kuscheltier`, `pfau-kuscheltier`, `lama-kuscheltier`, `neuheiten` et `labubu`. Le rapport JSON conserve la liste complète. **Le précédent pilote limité aux 74 collections du menu ne suffit donc pas à qualifier les appartenances des 115 collections de la refonte.**

Sitemaps réellement lus :

- [Index](https://www.kuscheltierland.de/sitemap.xml).
- [Produits](https://www.kuscheltierland.de/sitemap_products_1.xml?from=10639337718097&to=11105423884625).
- [Collections](https://www.kuscheltierland.de/sitemap_collections_1.xml?from=672476234065&to=688904438097).

## Pagination et classement best-seller

Parcours complet de [`/collections/all?sort_by=best-selling`](https://www.kuscheltierland.de/collections/all?sort_by=best-selling) : **41 pages**, soit 40 pages de 24 produits et une dernière de quatre produits. Tous les liens de continuation conservaient `sort_by=best-selling`.

Résultat : **964 produits uniques, zéro doublon, zéro produit du sitemap manquant et zéro produit supplémentaire**. Comparaison par handle canonique, sans télécharger les 964 fiches. Le Top 25 a été constitué dans cet ordre et franchit correctement la limite entre la première et la deuxième page. L’ordre retourné est observable ; les volumes de ventes ne sont pas publics et ce relevé n’en valide pas les chiffres. Une seule traversée ne garantit pas un ordre immuable si la boutique évolue.

Trois collections ont été parcourues jusqu’à leur dernière page :

| Collection | Pages | Produits uniques | Membres du Top 25 global |
| --- | ---: | ---: | ---: |
| Capybara | 2 (24 + 16) | **40** | **1** |
| Otter | 1 | **12** | **0** |
| Hirsch, absente du menu principal | 1 | **2** | **0** |

Cela confirme sur ces cas la pagination, la récupération d’une collection hors menu et la situation attendue où des collections non vides à la source deviennent vides dans le catalogue Top N. Leurs fiches de collection doivent rester présentes. La liste exhaustive des membres des **115** collections n’a pas été relevée durant cette vérification préalable.

## JSON intégral et compléments HTML

Cinq fiches ont été choisies : les deux premières du classement, un produit à sept variantes, un produit à cinq images et une fiche ayant eu un timeout lors de la qualification historique.

Le JSON contient 16 champs produit et 25 champs sur la première variante observée, notamment des dates, des paramètres de quantité et des champs que le modèle normalisé actuel ne conserve pas tous. **Il faut garder le JSON reçu intégralement**, en plus des champs normalisés nécessaires aux listes et à l’import. Proposition simple : une chaîne JSON intacte dans la fiche Convex, sans fichier R2 individuel ; elle évite de perdre des champs inconnus ou de dépendre de leurs noms dans le schéma.

Sur les cinq fiches, trois rubriques complémentaires sont présentes directement dans le HTML et absentes du texte de `body_html` :

- **Pflege** : entretien et nettoyage.
- **Produktdetails** : selon le produit, matière, remplissage, dimensions, modèle, âge recommandé, avertissements ou certifications déclarées par la source.
- **Hinweise Zur Verwendung** : précautions d’utilisation.

Exemple mesuré sur la peluche pigeon : le HTML ajoute une dimension de **23 cm**, le remplissage **PP Cotton**, un âge recommandé et un avertissement relatif au feu. Ces déclarations sont à conserver telles quelles ; leur présence dans la source ne constitue pas une vérification de conformité.

L’audit des accordéons de la zone produit trouve cinq rubriques : description, les trois compléments ci-dessus et livraison/retours. L’extracteur existant récupère les trois compléments utiles ; la description est déjà dans le JSON et les conditions générales de livraison/retours restent hors contenu produit. Aucun tableau ni iframe n’apparaît dans cette zone sur l’échantillon. Aucun navigateur ni rendu JavaScript n’a été nécessaire pour ces cinq pages. Cela ne prouve pas la couverture de tous les thèmes ou de tous les contenus dynamiques.

## Taille des fiches et limites Convex

La [documentation officielle](https://docs.convex.dev/production/state/limits) consultée indique **1 Mio par document**, profondeur de 16 niveaux et 8 192 éléments par tableau. La version Markdown a également été lue. Les actions Node sont limitées à dix minutes ; les actions du runtime Convex ont une limite distincte, actuellement trente minutes. Le choix d’actions courtes reste adapté à la refonte.

Mesure locale d’un document candidat comprenant la chaîne JSON intégrale, les champs normalisés, les sections HTML extraites, le rang et l’état :

| Produit | JSON source, octets | HTML reçu, octets | Document candidat Convex, octets |
| --- | ---: | ---: | ---: |
| Pigeon flauschiger Vogel | 5 043 | 363 045 | **10 212** |
| Capybara Schlafkissen | 7 007 | 371 905 | **12 747** |
| Delfin blau-weiß, 7 variantes | 8 902 | 372 751 | **15 224** |
| Labubu beige, 5 images | 5 666 | 368 659 | **10 986** |
| Faultier braun | 5 606 | 364 557 | **10 851** |

Le HTML téléchargé contient le thème entier, mais seuls les compléments produit sont stockés. Les tailles candidates sont calculées avec `getConvexSize`, pas avec le seul nombre de caractères. Les identifiants système, les appartenances réelles et les futurs champs d’import ajouteront des octets : **aucune insertion réelle de ces documents dans Convex n’a été effectuée**. Le plus gros candidat de cet échantillon occupe environ **1,45 %** de 1 Mio. Cette marge ne remplace pas un contrôle de taille pour chaque fiche.

Les tailles de l’ensemble des 964 JSON et du document catalogue enrichi des 115 collections ne sont pas qualifiées par cet échantillon. Il reste nécessaire de borner les écritures par octets et de signaler tout dépassement sans tronquer les données.

## Conclusion pour l’architecture

- Le parcours sitemap → classement → collections → fiches est faisable sur le pilote vérifié.
- Le Top N doit conserver les collections sans membre sélectionné ; les exemples réels Otter et Hirsch le démontrent.
- Le JSON seul perd des informations produit importantes ; le HTML systématique reste obligatoire.
- Le modèle Convex par produit, sans fichier R2 individuel, est compatible avec les cinq fiches mesurées.
- La découverte doit inclure **115 collections**, dont **41 hors menu principal**, et non réutiliser le périmètre historique de 74.

Ces vérifications ne valident pas un import Shopify, une reprise du futur moteur ou une performance de collecte. Aucun code de la refonte n’a été implémenté.
