> Mise à jour du 1er octobre 2026 : implémentation autorisée dans la conversation suivante. « Reprendre là où ça a fail » remplace le redémarrage destructif ; « supprime tout » autorise le retrait des anciennes données catalogue **dev uniquement**. Voir [transition](catalog-workspace-migration.md) et [qualification](catalog-refonte-qualification.md). Le cadrage historique ci-dessous est conservé.

# Refonte import/export Shopify — attendus

Date : 28 septembre 2026. Dernière précision fonctionnelle : 29 septembre 2026. Maquette de cadrage ajoutée le 30 septembre 2026.

Ce document conserve le besoin reformulé par l’utilisateur après la qualification de performance. Il constitue la référence fonctionnelle pour réfléchir à la refonte. Il ne décrit pas une nouvelle implémentation déjà réalisée. Les travaux existants et leurs mesures restent conservés.

## Attendus exprimés par l’utilisateur

> Je veux pouvoir exporter toute la structure, c’est-à-dire le menu, les collections et les produits d’une boutique Shopify vers une autre boutique.
>
> Pour cela :
> 1. Export du menu.
> 2. Export des collections.
> 3. Export des produits.
>
> Le menu : crawling depuis le frontend / le HTML directement.
>
> Les collections : sitemap.
>
> Les produits : sitemap.
>
> Collections : mise en place de smart collections avec des tags.
>
> Produits : assignation d’un ou plusieurs tags au produit. Les tags sont ceux qu’on a créés à l’étape de récupération des collections.
>
> Menu : certaines collections ne sont peut-être pas présentes dans le menu ; les mettre en évidence.

## Précisions utilisateur — simplicité et modes d’export

Les choix de modes et de tags ci-dessous restent valables. La politique initiale d’échec est remplacée par la décision validée dans la section suivante.

- Convex et R2 doivent rester aussi simples que possible, avec le minimum de fichiers.
- Politique initiale, désormais remplacée : aucun checkpoint ni reprise partielle, suppression de la tentative en échec et redémarrage de zéro.
- L’IA peut servir à créer les tags associés aux collections. Les produits reçoivent ensuite les tags de leurs collections.
- Proposer deux modes : **tout le catalogue** ou **les N meilleures ventes**.
- Pour le mode meilleures ventes, procéder en deux temps : d’abord parcourir `/collections/all?sort_by=best-selling` et les pages suivantes si nécessaire pour sélectionner les N premiers produits distincts, puis récupérer les fiches de ces produits uniquement.
- Récupérer le menu et toutes les collections dans les deux modes. Les collections sans produit parmi les N sélectionnés restent présentes et vides.
- Permettre à l’utilisateur de lancer manuellement la récupération des produits d’une collection et de les ajouter au catalogue d’import, sans doublonner les produits déjà présents.
- Permettre de classer les produits par meilleures ventes, en conservant l’ordre observé via `?sort_by=best-selling`. Ce classement ne fournit pas les chiffres de ventes.

## Architecture et politique d’échec validées ensuite

L’utilisateur accepte la proposition de rester sur Convex avec des actions courtes et de conserver les produits déjà récupérés. Il précise : **« pour le lot de produits ce sera collection par collection, la taille est variable »**.

- La **collection est l’unité de travail métier**, avec son nombre réel de produits. Traiter les collections successivement.
- Une collection volumineuse peut avancer sur plusieurs actions Convex courtes, bornées en durée et en volume. Ce découpage technique ne crée pas de nouveaux lots visibles ni de fichiers intermédiaires.
- Deux tables métier prévues : `catalogues` pour configuration, menu, collections et suivi ; `produits` pour URL, identité, appartenances, rang, état et données récupérées. Les tables existantes d’authentification et de boutiques restent réutilisées.
- Les fiches réussies sont conservées dans Convex. Après quelques tentatives bornées, signaler les fiches en échec et continuer les autres. Proposer « Relancer les produits en échec » et « Tout recommencer ».
- Aucun stockage de sources brutes, checkpoints ou journaux intermédiaires dans R2. Un seul JSON final par catalogue, généré à la demande à partir de Convex.
- Dédupliquer globalement : un produit commun à plusieurs collections n’est récupéré qu’une fois ; il conserve toutes ses appartenances et leurs tags. Une action rejouée retrouve la même fiche au lieu de créer un doublon.
- En mode TOP_N, chaque collection traite seulement l’intersection entre ses membres et les N produits sélectionnés globalement. Une collection vide reste présente. N n’est pas une limite appliquée séparément à chaque collection.
- Les produits sélectionnés sans collection sont traités dans un groupe technique « Sans collection », sans créer une collection Shopify artificielle.
- Un ajout manuel collecte les produits manquants de la collection choisie et conserve les produits déjà présents ; le total peut dépasser N. Il ne supprime pas les réussites en cas d’échec partiel.
- Le classement best-seller source reste distinct de l’ordre de traitement collection par collection.

## Décisions fonctionnelles du 29 septembre 2026

- **Tags IA : validation manuelle obligatoire.** Les propositions peuvent être corrigées ; elles ne deviennent pas automatiquement des règles de collections validées.
- **Contenu produit : conserver tout le JSON source et rechercher systématiquement les informations complémentaires dans le HTML.** Cette seconde source est obligatoire, pas un recours uniquement si le JSON est absent. Ne pas limiter la récupération à titre/prix/images et ne pas supprimer les champs JSON inconnus. Conserver langue, descriptions et sections propres à la fiche produit, sans réécriture SEO implicite.
- **Menu : ne récupérer que les liens vers les collections.** Exclure les liens de produits, pages, articles et autres destinations. La proposition de structure est de conserver les parents nécessaires comme libellés sans lien lorsqu’ils regroupent des collections, et de retirer les branches sans collection.
- **Catalogue incomplet : export et import autorisés**, avec erreurs et éléments manquants visibles. L’acceptation du caractère partiel est présentée lors de la confirmation de l’opération.
- L’utilisateur souhaite une découverte par **sitemap avec consolidation du classement best-seller**. Précision technique : le sitemap standard Shopify expose les URL mais pas la relation produit–collection ; celle-ci doit être consolidée depuis les listes publiques paginées des collections. Le classement global provient de `/collections/all?sort_by=best-selling`.
- Les autres paramètres techniques sont laissés à la proposition de l’assistant ; voir l’UML pour les valeurs de départ et les validations restantes.

Le JSON source complet est une donnée du catalogue, conservée dans Convex et dans l’export, pas un fichier brut R2 supplémentaire. L’import Shopify traduit les champs acceptés par l’API destination ; conserver tout le JSON ne signifie pas réécrire les identifiants ou dates de la source dans Shopify. Une erreur de lecture HTML reste visible même si le JSON a réussi. Une donnée trop volumineuse pour les limites de stockage ne doit jamais être tronquée silencieusement.

Vérification préalable effectuée le 29 septembre : [résultats et limites](catalog-refonte-verification-prealable.md). La source expose 964 produits et **115 collections**, dont 41 absentes du menu principal extrait. Les 41 pages best-selling couvrent exactement les 964 produits du sitemap. Les cinq fiches JSON + compléments HTML mesurées tiennent dans la limite Convex ; ce n’est pas une qualification de toutes les fiches ni un import réel.

Ces attendus et l’[UML actualisé](catalog-refonte-uml.md) décrivent la refonte à implémenter ; la mise à jour documentaire ne modifie pas le moteur déployé et ne supprime aucune donnée existante. L’utilisateur a demandé de ne pas commencer à coder à ce stade.

## Cadrage de l’interface

Le [document d’interface](catalog-refonte-interface.md) décrit le parcours Source → Tags → Catalogue et intègre la [maquette V2 fournie par l’utilisateur le 30 septembre](../output/catalog-refonte-interface-v2.png). Elle représente la liste Produits et sa fiche latérale, avec les onglets Collections et Menu. Ses contenus et états sont illustratifs ; elle ne constitue pas une qualification réelle ni une autorisation d’import Shopify.
