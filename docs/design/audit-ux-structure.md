# Audit UX et structure des pages

22 octobre 2026 — état après l’intégration visuelle.

## Périmètre et niveau de preuve

Lecture des routes, composants et hooks des espaces Produits, Générations, Opérations groupées, Imports, Flux Google, SEO, Modèles d’images, Documents et Réglages. Réexamen dans le navigateur de la liste Produits et de son aperçu avec les vrais composants sur le banc local. Les autres constats structurels reposent sur le code ; les observations des bancs de la précédente intégration sont documentées séparément dans [integration-interface.md](./integration-interface.md).

Cet audit applique le skill [apple-design](/Users/florian/.agents/skills/apple-design/SKILL.md) : hiérarchie, proximité entre une action et sa cible, contexte conservé, contrôle de l’utilisateur et divulgation progressive. Il ne mesure ni le temps réel des utilisateurs ni un taux d’erreur. Les conséquences UX sont des hypothèses argumentées, à valider par les scénarios de fin de document. Aucun parcours Shopify authentifié ni aucune publication réelle n’a été effectué pour cet audit.

## Diagnostic

La cohérence visuelle a progressé. La structure reste largement celle d’une collection de modules : l’utilisateur doit choisir lui-même entre la fiche produit, un lot de génération, l’historique des opérations et les réglages pour terminer une tâche.

Le prochain gain vient de trois changements :

1. Faire correspondre chaque entrée à un travail précis : vérifier ouvre la vérification, publier ouvre la préparation de publication, reprendre ouvre le problème.
2. Séparer le travail courant, la configuration et les traces techniques à l’intérieur des pages.
3. Rendre explicites la cible, l’étendue et l’état d’enregistrement de chaque action.

La première refonte a aussi introduit des choix à revoir : l’aperçu produit apporte surtout des informations et une génération supplémentaire ; il ne permet pas de traiter les images à vérifier. Sur une liste rétrécie, les boutons d’action disparaissent alors que l’aperçu reste accessible. C’est une simplification visuelle dont il faut maintenant améliorer l’utilité opérationnelle.

## Priorités

| Priorité | Constat établi | Effet probable | Changement recommandé |
|---|---|---|---|
| Haute | Les liens « Vérifier », « Publier », « Suivre » et « Examiner » ouvrent la même fiche, sans cible de travail. | Nouvelle recherche dans la page après avoir déjà exprimé une intention. | Transmettre le mode attendu à la fiche, ouvrir la section correspondante et préserver les filtres de départ. |
| Haute | La fiche juxtapose espaces de déclinaisons, configuration, galeries, historique et informations. | La compréhension de la page et de la cible des actions demande trop de lecture. | Un espace produit avec une cible persistante et des vues Images, Références et déclinaisons, Historique, Informations. |
| Haute | L’aperçu propose « Ouvrir l’espace produit » et « Générer des visuels », même pour un produit à vérifier. | Un détour qui ne traite pas la prochaine tâche. | Aperçu explicitement facultatif ; action principale correspondant à l’état, accès direct à la tâche dans la liste, y compris sur mobile. |
| Haute | Dans un lot, l’approbation porte sur les images visibles, la publication sur les images publiables du lot. Le flux Google publie depuis une vue filtrée sans transmettre ce filtre à l’action. | Confusion possible entre ce qui est affiché et ce qui sera traité. | Afficher « dans cette vue », « dans ce lot » ou « toutes les pages », avec quantités et destination. |
| Haute | Les documents légaux sont en mémoire ; choisir une autre règle Google remplace immédiatement le brouillon de l’éditeur. | Perte possible d’un travail de saisie, indépendante de la qualité du design. | Sauvegarde de brouillon adaptée au module, état enregistré/modifié et protection ciblée avant abandon. |
| Moyenne | Produits n’a pas de raccourci « En cours » ou « À reprendre » ; les vues rapides n’ont pas de compteurs. | Les tâches bloquées sont moins repérables que les tâches terminées. | Rendre visibles les files de travail, en donnant la priorité aux erreurs et aux vérifications. |
| Moyenne | La fenêtre de génération compte les images, mais n’affiche pas le fournisseur ni le mode d’exécution effectifs. | Le résultat et le délai attendus sont difficiles à anticiper. | Récapitulatif de lancement : boutique, produits, déclinaisons, types, quantité, réglages réellement appliqués. |
| Moyenne | Les pages d’accueil Imports et SEO privilégient la création ; les travaux précédents viennent après ou sur le côté. | Reprendre un travail récurrent est moins direct que commencer un nouveau. | Liste des travaux en premier pour les utilisateurs existants ; formulaire principal dans l’état vide. |
| Moyenne | Les mots « modèles », « prompts », « templates », « jobs », « bulk » et « review » coexistent. | Des concepts identiques semblent différents ; « Modèles » désigne aussi les modèles IA. | Vocabulaire métier stable, avec termes techniques dans les détails appropriés. |

« Haute » indique un fort effet potentiel sur l’exécution d’une tâche ou la préservation du travail, pas un incident observé en production.

## Navigation et accueil

Aujourd’hui, « Catalogue » contient seulement Imports alors que Produits appartient à Studio. Documents légaux est rangé dans Configuration, bien que ce soit un outil de production de contenu. Générations et Opérations groupées sont deux historiques au premier niveau. Voir [navigation.tsx](../../app/components/app-shell/navigation.tsx).

Structure proposée, avec huit destinations principales :

```text
Produits
Imports de catalogues
Activité
  Générations | Opérations groupées
Modèles de visuels
Flux Google
Projets SEO
Documents
Réglages
```

Produits et Imports doivent être voisins. Activité regroupe l’accès aux deux historiques tout en conservant leurs pages, filtres, détails, annulations, reprises et restaurations propres. Les modèles de visuels restent accessibles depuis la génération. Les réglages restent une destination stable ; leurs modèles IA deviennent « Fournisseurs et modèles IA ».

L’accueil peut rester Produits. Ajouter au-dessus de la liste une bande de travail compacte avec les quantités à vérifier, prêtes à publier et en échec. Les nombres doivent être calculés sur le périmètre annoncé, pas sur la seule page chargée. Un état vide guide vers la connexion/synchronisation ou le premier travail utile. L’ajout d’un tableau de bord indépendant devra être justifié par un usage réel.

Conserver une boutique active visible dans le shell. Pour un import, montrer séparément **source** et **destination** : la destination peut différer de la boutique active. Au lancement d’une écriture, répéter la destination près de l’action.

## Produits : une liste pour choisir le travail

**À garder :** recherche et filtres dans l’URL, filtres avancés dépliables, état principal lisible, sélection entre pages et barre d’actions commune. La fiche possède déjà un retour qui transmet les filtres et une navigation précédent/suivant : ces acquis doivent rester.

**À modifier :**

- Compléter les vues rapides avec En cours et À reprendre ; écrire « Prêts à publier » plutôt que « Prêts ». Sur petit écran, utiliser un sélecteur de vue et quelques compteurs prioritaires plutôt qu’allonger indéfiniment la rangée horizontale.
- Donner aux filtres actifs des résumés visibles même quand leur panneau est fermé. Le nombre de filtres ne dit pas lesquels s’appliquent.
- Garder une action métier accessible sur chaque produit à toutes les largeurs. Actuellement elle se masque sous 52 rem de largeur de conteneur ; l’ouverture de l’aperçu peut elle-même faire franchir ce seuil.
- Clarifier le clic : titre = espace produit, bouton d’aperçu = consultation rapide, action = travail ciblé. La miniature et l’œil ouvrent aujourd’hui le même aperçu ; une seule affordance explicite peut suffire.
- Dans l’aperçu, mettre « Vérifier les 3 images » ou « Préparer la publication » en premier selon l’état. La génération reste disponible comme action secondaire. Éviter de construire un second éditeur complet dans ce petit panneau.
- Distinguer la sélection de la page, la sélection accumulée et un éventuel « tous les résultats ». La sélection actuelle survit à la pagination mais s’efface au changement de filtre et au démontage de la liste ; rendre cette règle explicite avant d’envisager une persistance par boutique.

Sources : [ProductsFilters.tsx](../../app/features/products/components/ProductsFilters.tsx), [ProductTableRow.tsx](../../app/features/products/components/ProductTableRow.tsx), [ProductQuickView.tsx](../../app/features/products/components/ProductQuickView.tsx), [useProductsListPage.ts](../../app/features/products/hooks/useProductsListPage.ts).

## Fiche produit : le changement structurel prioritaire

La fiche possède déjà une vraie notion de déclinaison et des actions dont le libellé s’adapte au groupe sélectionné. Ce mécanisme est utile. En revanche, le contenu des galeries, celui de l’historique et la présence des informations produit changent selon cette sélection locale. La configuration des déclinaisons est un autre bloc situé sous l’espace de travail ; elle est repliée lorsqu’une configuration existe sans erreur.

Structure cible :

```text
Retour aux résultats · précédent / suivant
Nom du produit                         Boutique · ouvrir dans Shopify
Vue d’ensemble / Déclinaison sélectionnée

Images | Références et déclinaisons | Historique | Informations

[Dans Images]
À vérifier · Approuvées · Rejetées · Publiées · Échecs
Galerie principale ou comparaison d’une image avec sa référence
Actions de l’image : approuver, rejeter, retoucher, régénérer, supprimer

Barre de travail : cible + quantité + action principale
```

Les onglets sont des espaces de travail, pas des étapes obligatoires. Un produit déjà configuré ouvre Images. Un lien « Vérifier » active les images en attente ; « Publier » ouvre la préparation avec les images admissibles. Une référence manquante propose un accès direct à la déclinaison concernée.

Les deux galeries Shopify/générées ont une utilité de comparaison. Pendant une vérification, donner davantage de place à l’image examinée et afficher sa référence à côté ; en consultation générale, conserver l’accès aux deux ensembles. Les références et leur ordre se règlent dans la vue dédiée. L’historique conserve les prompts exacts, erreurs, modèles et liens vers les lots, sans occuper la page de travail courante.

Le groupe et la vue actifs deviennent adressables dans l’URL. Les filtres de retour restent distincts du mode interne de la fiche. Ne pas faire avancer automatiquement vers le produit suivant après une approbation : proposer une commande explicite « Suivant à vérifier ».

Fonctions à conserver : génération au niveau produit/groupe, variantes, confirmation et ordre des références, analyse IA, retouche, approbation/rejet, publication, choix de remplacement, suppression, réorganisation Shopify, historique et navigation dans les résultats.

Sources : [ProductDetailPage.tsx](../../app/features/products/components/ProductDetailPage.tsx), [ProductHeader.tsx](../../app/features/products/components/ProductHeader.tsx), [VisualProductWorkspace.tsx](../../app/features/products/components/VisualProductWorkspace.tsx), [VisualGroupsSection.tsx](../../app/features/products/components/VisualGroupsSection.tsx).

## Génération, vérification et activité

### Lancement

La fenêtre existante fait déjà un calcul utile du nombre d’images, prend en charge les variantes et indique les références à confirmer. Ajouter un résumé de la configuration effective près de « Lancer » : nombre de produits, déclinaisons, types, fournisseur/modèle et exécution immédiate ou différée. S’il existe des surcharges par type, les résumer au lieu d’afficher un unique réglage trompeur. Une estimation de coût ou de durée ne doit apparaître que si elle est fondée ; sinon indiquer son indisponibilité.

L’accès aux réglages depuis ce résumé doit préserver les choix en cours. Le simple affichage des réglages existants est un ajustement UX ; un aperçu de coût fiable ou de nouvelles surcharges par lancement seraient des évolutions fonctionnelles distinctes.

Source : [ImageTypeSelectionDialog.tsx](../../app/features/products/components/ImageTypeSelectionDialog.tsx).

### Liste des générations

La dépense totale et les tokens occupent actuellement le haut de la page avant les vues Historique/Archivés et quatre filtres. Pour reprendre le travail : commencer par « À traiter », puis En cours, Terminées, Archivées ; regrouper les erreurs et les lots ayant des images en attente. Garder les coûts dans une synthèse secondaire avec un périmètre et une période explicites.

« Génération terminée » ne signifie pas « images approuvées et publiées ». Conserver ces axes métier mais mettre une prochaine action claire dans chaque ligne. Sur mobile, remplacer la table de largeur minimale 900 px par des lignes compactes comportant progression, problème et action, comme le fait déjà l’historique des opérations groupées avec ses cartes.

### Vérification d’un lot

La grille de vérification, les filtres avec compteurs et le détail technique replié sont de bonnes bases. Le lot doit conserver sa progression en haut, puis donner la priorité aux images à décider. Une vue de contrôle agrandie devrait permettre d’enchaîner les images avec une référence visible, puis de revenir au lot au même endroit.

Renommer les actions selon leur périmètre : « Approuver les N images de cette vue » et « Préparer la publication des M images approuvées du lot ». La fenêtre de publication doit conserver les options et protections existantes. Le filtre de vérification ne doit pas modifier implicitement le périmètre de publication ; il faut expliquer cette différence.

Une file transversale de vérification couvrant plusieurs lots peut devenir utile ensuite. Elle nécessite une vraie définition des états et requêtes associées ; elle ne doit pas être présentée comme un simple changement de mise en page.

Sources : [JobsPage.tsx](../../app/features/jobs/components/JobsPage.tsx), [JobDetailPage.tsx](../../app/features/jobs/components/JobDetailPage.tsx), [JobStickyPublishBar.tsx](../../app/features/jobs/components/JobStickyPublishBar.tsx), [BulkOperationsPage.tsx](../../app/features/bulk-operations/components/BulkOperationsPage.tsx).

## Imports de catalogues

**Accueil :** mettre les catalogues existants et leur prochaine action en premier lorsqu’ils existent : Reprendre, Valider les tags, Corriger, Exporter ou Préparer l’import. Un bouton « Nouveau catalogue » ouvre le formulaire. Pour un premier utilisateur, conserver le formulaire directement visible.

**Espace catalogue :** conserver Produits, Collections et Menu comme vues des données. Au-dessus, remplacer le texte statique « Source → Tags → Catalogue » par un état réellement calculé : travail en cours, point bloquant, prochaine action. La récupération et l’édition pouvant se chevaucher, éviter un assistant linéaire qui verrouillerait des actions aujourd’hui permises.

**Actions de sortie :** regrouper JSON et CSV dans « Exporter » avec une description de leur contenu. Conserver « Préparer l’import Shopify » distinct et visible. Lorsque l’import est indisponible à cause des tags, afficher la raison et un lien pour les valider au lieu du seul bouton désactivé.

**Préparation de l’import :** source, destination, éléments cochés, données incomplètes et conséquences doivent être lisibles ensemble. Réutiliser les informations existantes sur les créations en brouillon et le menu non affecté au thème avant l’action, pas seulement dans le bilan. Préserver le choix indépendant Produits/Collections/Menu, les corrections manuelles et la reprise des échecs.

**Contexte :** onglet, collection, filtre et fiche inspectée devraient être retrouvables après retour/rechargement. L’inspecteur reste pertinent ici puisqu’il permet réellement de corriger le produit dans la liste.

Contraintes : conserver la pagination Convex, la recherche exacte, le résolveur des valeurs effectives, la langue du contenu, la langue des tags configurée, les identités source et l’isolation des exports/imports. Une amélioration UX ne justifie pas de reconstruire les listes depuis R2 ni de charger tout le catalogue.

Sources : [CatalogHome.tsx](../../app/features/catalog-import/components/CatalogHome.tsx), [CatalogWorkspace.tsx](../../app/features/catalog-import/components/CatalogWorkspace.tsx), [ImportConfirmation.tsx](../../app/features/catalog-import/components/ImportConfirmation.tsx), [contexte catalogue](../catalog-workspace-context.md).

## Flux Google

Le modèle « modification → brouillon → comparaison → publication » est l’un des parcours les plus clairs de l’app. Il mérite d’être conservé et rendu plus visible.

- Ajouter une destination stable « Modifications à publier · N » aux onglets Catalogue, Règles, Historique. Aujourd’hui la prévisualisation utilise une page séparée qui perd ces onglets ; son lien de retour reconstruit un catalogue non filtré en page 1.
- Dans la prévisualisation, rappeler la boutique et « toutes les modifications prêtes et incluses, toutes pages confondues ». L’action de publication ne reçoit pas le filtre de la page ; des filtres Conflits ou Exclues ne doivent pas laisser penser qu’ils limitent ce qui part.
- Conserver le comparatif actuel/proposé et les informations de conflit. Faire ressortir les éléments bloquants sans empêcher le traitement des éléments valides.
- Dans Règles, distinguer « Enregistrer la règle » et « Calculer les propositions ». « Appliquer au catalogue » est moins précis alors que l’opération prépare un brouillon.
- Protéger le brouillon de règle avant de sélectionner une autre règle ou « Nouvelle règle ». Le code remplace actuellement directement `draft` par les valeurs de l’autre sélection.

Sources : [GoogleFeedTabs.tsx](../../app/features/google-feed/components/GoogleFeedTabs.tsx), [GoogleFeedPreviewPage.tsx](../../app/features/google-feed/components/GoogleFeedPreviewPage.tsx), [GoogleFeedRulesPage.tsx](../../app/features/google-feed/components/GoogleFeedRulesPage.tsx).

## SEO

La séparation entre cadrage repliable, versions, éditeur d’arbre, inspecteur, mots-clés et sources est déjà cohérente. Les corrections non enregistrées sont protégées lors de la navigation et du changement de version ; les exports imposent l’enregistrement. Ne pas supprimer ces protections pour uniformiser l’apparence.

Améliorations ciblées : accueil centré sur les projets existants après le premier import ; version, onglet et nœud sélectionnés conservés dans l’URL ; état d’enregistrement et action Enregistrer disponibles pendant le travail dans l’arbre ; accès « Modifier le cadrage » secondaire une fois les résultats disponibles.

Garder les deux décisions « Créer le projet » puis « Lancer l’analyse » si la première sert à vérifier le cadrage avant une opération IA. Rendre cette transition explicite plutôt que fusionner les actions sans tenir compte du coût. Préserver la distinction entre collections fondées sur l’Excel, opportunités hors Excel et sources/limites.

Sources : [SeoHome.tsx](../../app/features/seo/components/SeoHome.tsx), [SeoWorkspace.tsx](../../app/features/seo/components/SeoWorkspace.tsx), [SeoEditor.tsx](../../app/features/seo/components/SeoEditor.tsx), [useSeoEditor.ts](../../app/features/seo/hooks/useSeoEditor.ts).

## Modèles de visuels et réglages

**Modèles :** la page commence par les variables disponibles puis les instructions globales, avant la sélection du modèle à éditer. Mettre la bibliothèque de modèles à gauche et l’éditeur choisi au centre. Déplacer les variables vers une aide d’insertion près du champ et les instructions globales vers une section identifiable « Commun à tous les modèles ». Garder conditions, références, paramètres IA, fond et ordre des modèles.

Afficher un état « Modifications non enregistrées » associé au modèle et protéger la sortie de la page. L’activation d’un preset est immédiate alors que les autres modifications exigent Enregistrer : expliquer cette différence ou harmoniser le mode de sauvegarde. Un aperçu du prompt résolu sur un exemple de produit serait utile, mais c’est une fonctionnalité supplémentaire à spécifier ; aucun appel de génération payant ne doit être implicite.

**Réglages :** distinguer Boutique, Génération par défaut, Fournisseurs et modèles IA, Paramètres avancés. Le bouton Synchroniser et les badges fournisseur/mode présents partout dans l’en-tête devraient vivre au plus près de leur portée. Les liens contextuels doivent ouvrir le bon onglet, actuellement stocké seulement en état local.

Pour toute sauvegarde, annoncer ce qui est enregistré et où cela s’applique : boutique, modèle de visuel ou configuration commune. Ne pas inventer une portée « par boutique » sans vérifier le contrat serveur de chaque paramètre.

Sources : [PromptSettingsPage.tsx](../../app/features/settings/components/PromptSettingsPage.tsx), [PromptTemplateEditor.tsx](../../app/features/settings/components/PromptTemplateEditor.tsx), [SettingsPage.tsx](../../app/features/settings/components/SettingsPage.tsx), [useSettingsPage.ts](../../app/features/settings/hooks/useSettingsPage.ts).

## Documents

Le formulaire à gauche et l’aperçu à droite sont adaptés. L’enjeu principal est la continuité du travail : les informations, choix de langue et adaptations sont stockés dans des états React, puis perdus au démontage/rechargement. Prévoir des brouillons explicitement rattachés à une boutique, une sauvegarde récupérable et une remise à zéro qui annonce sa portée.

Dans l’en-tête : boutique/document/langue et état de complétude. Dans le formulaire : sections regroupées et indicateurs des champs à corriger. Dans l’aperçu : document sélectionné, rendu/HTML et actions Copier/Exporter. Sur mobile, passer entre Saisie et Aperçu plutôt qu’imposer deux longs blocs successifs.

Le bouton « Télécharger les 6 documents » produit actuellement un seul fichier HTML regroupé : l’indiquer dans son libellé ou son aide. La validation avant export est déjà présente et doit rester. Cet audit concerne l’utilisation de l’outil, pas la validité juridique des textes.

Sources : [PolicyGeneratorPage.tsx](../../app/features/policy-generator/components/PolicyGeneratorPage.tsx), [PolicyForm.tsx](../../app/features/policy-generator/components/PolicyForm.tsx), [usePolicyGenerator.ts](../../app/features/policy-generator/hooks/usePolicyGenerator.ts).

## Trois structures de page à partager

| Usage | Structure | Modules concernés |
|---|---|---|
| Choisir et traiter | En-tête court, vues de travail, recherche/filtres, liste, sélection et actions | Produits, Activité, accueils Imports et SEO |
| Examiner un résultat | Cible persistante, galerie/arbre/table principale, inspecteur contextuel, actions liées à la cible | Fiche produit, lot de génération, catalogue, SEO |
| Configurer un contenu | Navigation des objets, éditeur, aperçu, sauvegarde explicite | Modèles de visuels, règles Google, documents |

Partager ces conventions ne signifie pas rendre les écrans identiques. Un inspecteur de correction de catalogue et un aperçu produit n’ont pas la même valeur ; la place qu’ils occupent doit refléter cette différence.

## Ordre d’intervention proposé

1. **Clarté immédiate.** Corriger les intitulés et périmètres ; conserver les actions sur petit écran ; cibler l’arrivée dans la fiche ; signaler les modifications non enregistrées et protéger l’abandon des brouillons de règles/documents. Préserver le comportement métier.
2. **Espace produit.** Réorganiser la fiche en vues, garder le contexte de déclinaison et les filtres de retour, relier l’aperçu à la prochaine action. Vérifier toutes les fonctions existantes sur un produit simple et un produit à déclinaisons.
3. **Travail récurrent.** Faire remonter les reprises sur les accueils, réunir les accès aux historiques sous Activité, intégrer le brouillon à la navigation Google, rendre les sélections d’onglets/versions adressables.
4. **Capacités nouvelles, séparées.** Brouillons persistants de documents, compteurs agrégés supplémentaires, aperçu de prompt résolu et éventuelle file de vérification transversale. Définir leurs contrats, leurs coûts et leur périmètre avant implémentation.

## Scénarios pour qualifier la refonte

- Depuis des produits filtrés, ouvrir « Vérifier », traiter une image, passer au produit suivant et revenir : filtre, page et contexte doivent rester compréhensibles.
- Depuis une déclinaison, lancer une génération : la destination, le nombre d’images et les réglages effectifs sont lisibles avant le lancement ; aucune autre déclinaison n’est incluse implicitement.
- Dans un lot et dans le flux Google, activer un filtre puis publier : l’utilisateur peut nommer les éléments réellement concernés et la boutique cible avant confirmation/exécution.
- Reprendre un catalogue partiel : accéder directement aux fiches en échec, conserver les corrections, choisir indépendamment les éléments de l’import et comprendre la sortie JSON/CSV/Shopify.
- Modifier une règle Google, un modèle de visuel ou un document puis changer d’écran/recharger : retrouver le brouillon ou recevoir une protection explicite adaptée, sans confusion avec une écriture Shopify.
- Dans SEO, retrouver une ancienne version et une collection précise ; préserver les corrections, protections de concurrence, sources et règles d’export.
- À 390 px et au clavier, atteindre la prochaine action sans dépendre d’un survol, conserver le focus après fermeture d’un panneau et accéder aux erreurs.

Mesurer ensuite le taux de réussite, les retours en arrière, le temps jusqu’à la première action utile et les erreurs de périmètre sur ces scénarios. Aucun gain chiffré n’est revendiqué avant cette mesure.

Cet audit ajoute uniquement ce document. Il ne modifie ni l’interface, ni les données, ni les appels serveur. Les validations de compilation de la précédente intégration ne sont pas une preuve d’utilisabilité et n’ont pas été relancées pour cette analyse documentaire.
