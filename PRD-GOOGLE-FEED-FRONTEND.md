# PRD Frontend — Gestion du flux Google Merchant Center

## Statut du document

- **Statut** : direction UX/UI validée
- **Date** : 4 août 2026
- **Document fonctionnel associé** : [PRD-GOOGLE-FEED.md](./PRD-GOOGLE-FEED.md)
- **Périmètre** : architecture d'information, écrans, interactions, états et exigences frontend
- **Hors périmètre** : schéma Convex détaillé, implémentation des actions Shopify et mapping définitif des metafields

## 1. Rôle de ce document

Ce document complète le PRD fonctionnel de la gestion du flux Google. Il décrit l'expérience frontend attendue afin que les deux documents puissent être fournis ensemble à un agent chargé de générer la fonctionnalité.

En cas d'ambiguïté :

- le PRD fonctionnel définit les règles métier et les responsabilités produit/variante ;
- ce PRD définit la présentation, les parcours, les interactions et les états de l'interface ;
- l'interface existante du projet reste la référence visuelle et technique.

## 2. Résumé de l'expérience

Une nouvelle section **Flux Google** doit permettre au marchand de gérer environ 150 produits et 1 500 variantes depuis une surface opérationnelle unique.

La boucle principale est :

1. consulter le catalogue complet ;
2. compléter manuellement des attributs ou exécuter les règles de la boutique ;
3. repérer les valeurs manquantes, incohérentes ou conflictuelles ;
4. prévisualiser les différences avec Shopify ;
5. publier une sélection de changements ;
6. consulter le résultat et relancer uniquement les erreurs.

Le catalogue complet est affiché par défaut, sans filtre implicite sur les anomalies.

## 3. Contexte d'utilisation

Le marchand travaille principalement sur un écran d'ordinateur, dans une interface de gestion, avec un objectif de rapidité et de fiabilité. Il peut effectuer des corrections ponctuelles ou traiter une partie importante du catalogue en une seule session.

Le mobile reste supporté pour consulter le catalogue, examiner un problème et effectuer une correction ponctuelle. Il n'a pas vocation à reproduire une feuille de calcul de 1 500 variantes en miniature.

## 4. Direction visuelle

### 4.1 Références

- **Application actuelle** : structure, composants, navigation et densité visuelle à préserver.
- **Shopify Admin** : affordances familières et confiance opérationnelle.
- **Airtable** : édition en ligne et manipulation de données denses.
- **Linear** : hiérarchie des états, raccourcis d'action et retours concis.

### 4.2 Stratégie

- Interface claire et majoritairement neutre.
- Accent orange existant réservé aux actions principales, à la sélection active et aux changements en attente.
- Vert, ambre et rouge réservés aux états sémantiques.
- Geist et échelle typographique compacte existante.
- Séparateurs fins, rayons modérés et absence d'ombres décoratives.
- Tables et listes structurantes préférées aux grilles de cartes.
- Aucun hero, grande métrique, gradient, glassmorphism ou animation décorative.

Le thème sombre existant doit continuer à fonctionner grâce aux tokens du projet, mais le thème clair est la référence de conception pour cette surface.

### 4.3 Mouvement

- Transitions de 150 à 200 ms pour l'ouverture des variantes, les changements d'état et les panneaux.
- Aucun mouvement ne doit retarder l'accès aux données.
- Respect de `prefers-reduced-motion`.

## 5. Intégration dans l'application

### 5.1 Navigation principale

Ajouter une entrée **Flux Google** dans la navigation latérale, au même niveau que Produits, Générations et Bulk operations.

L'entrée utilise une icône Lucide cohérente avec la navigation actuelle. Elle est visible pour toute boutique connectée, même si son diagnostic est bloqué.

### 5.2 Routes recommandées

- `/google-feed` : catalogue ;
- `/google-feed/rules` : règles ;
- `/google-feed/history` : historique ;
- `/google-feed/preview` : prévisualisation avant publication.

Le diagnostic est intégré au module plutôt que traité comme une destination principale. Son détail peut être ouvert depuis l'en-tête.

### 5.3 Navigation interne

Sous l'en-tête de page, utiliser trois onglets persistants :

- **Catalogue** ;
- **Règles** ;
- **Historique**.

L'état actif doit être porté par l'URL. Le retour navigateur, le partage d'URL et le rafraîchissement doivent préserver l'écran courant.

## 6. En-tête commun du module

L'en-tête reprend le composant et le rythme visuel des pages actuelles.

Contenu attendu :

- titre : **Flux Google** ;
- contexte : `150 produits · 1 500 variantes` lorsque les données sont disponibles ;
- courte description : « Attributs Google, règles d'attribution et publication Shopify. » ;
- action secondaire : **Synchroniser** ;
- action principale contextuelle : **Prévisualiser** lorsqu'il existe des changements.

Une barre de diagnostic compacte apparaît sous l'en-tête :

> Google & YouTube détecté · 3 attributs valides · Vérifié il y a 4 min · Voir le diagnostic

Cette barre n'est pas une carte. Elle utilise une ligne délimitée et un état sémantique discret.

## 7. Écran Catalogue

### 7.1 Objectif

Afficher l'ensemble du catalogue et permettre l'édition rapide des trois attributs sans perdre la relation entre un produit et ses variantes.

### 7.2 Barre de recherche et filtres

Le premier niveau comprend :

- contrôle segmenté : **Tous**, **Incomplets**, **Conflits**, **Modifiés** ;
- **Tous** sélectionné par défaut ;
- recherche par titre, handle ou SKU ;
- bouton **Filtres**.

Les filtres détaillés comprennent au minimum :

- collection ;
- type de produit ;
- statut Shopify ;
- Google Product Category ;
- Gender ;
- Age group ;
- origine de la valeur ;
- état de validation.

Les filtres, la recherche, la page et la taille de page doivent être reflétés dans les paramètres d'URL.

### 7.3 Structure du tableau

Le tableau est hiérarchique. Il affiche environ 20 à 50 produits par page et ne rend les lignes de variantes que pour les produits dépliés.

Colonnes de la ligne produit :

1. sélection et contrôle de déploiement ;
2. produit : miniature, titre, handle ou SKU principal, nombre de variantes ;
3. Google Product Category ;
4. Gender ;
5. résumé des Age groups ;
6. état ;
7. actions.

La colonne Produit reste lisible et peut devenir sticky lors d'un défilement horizontal. Les en-têtes restent sticky lors du défilement vertical à l'intérieur d'une longue page.

### 7.4 Ligne produit repliée

La ligne produit affiche les valeurs fonctionnellement communes :

- Google Product Category ;
- Gender ;
- résumé des Age groups présents parmi les variantes.

Exemples de résumé Age group :

- `adult · 6` et `kids · 4` ;
- `7/10 renseignées` avec `3 manquantes` ;
- `Conflit` si des règles concurrentes produisent des valeurs différentes.

Une incohérence de Gender entre variantes doit être visible depuis la ligne repliée.

### 7.5 Produit déplié

Les variantes s'affichent directement sous leur produit, sans carte imbriquée et sans modale.

Colonnes de variante :

- sélection ;
- titre de variante ;
- SKU ;
- options utiles, notamment taille ou pointure ;
- Age group ;
- origine de la valeur ;
- état ou conflit.

Les variantes reprennent l'alignement du tableau parent et utilisent un fond légèrement distinct pour matérialiser la hiérarchie.

### 7.6 Édition en ligne

Les cellules éditables utilisent les composants existants du projet :

- combobox recherchable et chargée progressivement pour Google Product Category ;
- select compact pour Gender ;
- select compact pour Age group.

Comportements :

- la modification est enregistrée comme brouillon local ou serveur, mais n'est pas immédiatement publiée vers Shopify ;
- une cellule modifiée reçoit un indicateur orange discret et un fond légèrement teinté ;
- la valeur Shopify actuelle reste consultable ;
- l'origine de la proposition est affichée : **Manuel**, nom de règle ou **Shopify** ;
- l'utilisateur peut annuler une modification non publiée ;
- la navigation clavier entre cellules doit rester possible.

Une modification de Gender sur la ligne produit informe clairement qu'elle concernera toutes les variantes.

### 7.7 Sélection et actions groupées

Une barre d'action sticky apparaît en bas lorsque des éléments sont sélectionnés.

Elle affiche la portée réelle :

> 12 produits · 118 variantes concernées

Actions pour une sélection de produits :

- définir la catégorie Google ;
- définir Gender ;
- appliquer les règles ;
- prévisualiser.

Actions pour une sélection de variantes :

- définir Age group ;
- appliquer une règle compatible ;
- retirer une proposition.

La barre doit empêcher les actions incompatibles avec la granularité de la sélection et expliquer pourquoi elles sont désactivées.

## 8. Écran Règles

### 8.1 Structure maître–détail

Sur grand écran :

- liste compacte des règles dans un panneau gauche ;
- éditeur de la règle active dans la zone principale ;
- aperçu des correspondances dans la partie basse ou dans un panneau secondaire intégré.

Sur écran plus étroit, la liste et l'éditeur deviennent deux étapes successives.

### 8.2 Liste des règles

Chaque entrée affiche :

- priorité ;
- nom ;
- attribut cible ;
- résumé de la condition ;
- nombre de produits ou variantes correspondants ;
- statut actif ou inactif ;
- indication de conflit éventuel.

Actions : créer, dupliquer, désactiver, réordonner et supprimer avec confirmation.

### 8.3 Éditeur de règle

L'éditeur doit former une phrase métier lisible :

> Si **Collection** contient **Enfants**  
> ET si **Pointure** est comprise entre **20** et **27**  
> alors définir **Age group** sur **toddler**.

Une règle contient visuellement :

- nom et statut ;
- cible ;
- groupe de conditions ET/OU ;
- action ;
- politique d'écrasement ;
- priorité ;
- aperçu.

Les conditions sont ajoutées en ligne. Ne pas utiliser une succession de modales.

### 8.4 Aperçu de règle

L'aperçu affiche en continu ou sur demande :

- nombre de correspondances ;
- quelques exemples réels ;
- valeurs actuelles et proposées ;
- conflits avec des règles de priorité différente ;
- données impossibles à interpréter.

L'enregistrement d'une règle ne publie rien vers Shopify. La distinction entre **Enregistrer la règle** et **Appliquer au catalogue** doit être explicite.

## 9. Écran Prévisualisation

### 9.1 Principe

La prévisualisation est une page complète. Une modale serait trop petite et trop risquée pour plusieurs centaines de modifications.

### 9.2 Résumé

Le haut de page affiche une phrase opérationnelle, pas une grille de grandes métriques :

> 284 modifications prêtes · 7 conflits · 3 valeurs invalides

Les filtres permettent d'afficher :

- toutes les propositions ;
- prêtes à publier ;
- conflits ;
- invalides ;
- exclues.

### 9.3 Tableau de comparaison

Colonnes :

- produit ou variante ;
- attribut ;
- valeur Shopify ;
- valeur proposée ;
- origine ;
- état ;
- inclusion dans la publication.

L'utilisateur peut :

- exclure une ligne ;
- corriger une valeur ;
- résoudre un conflit ;
- revenir au catalogue sans perdre le brouillon ;
- publier uniquement les lignes valides et incluses.

Le bouton principal contient le nombre réel : **Publier 284 modifications**.

## 10. Écran Historique

L'écran reprend la structure de Bulk operations afin de conserver la cohérence de l'application.

Colonnes principales :

- date ;
- origine : manuel, règles ou synchronisation ;
- périmètre ;
- réussites ;
- ignorées ;
- erreurs ;
- statut ;
- action **Voir**.

Le détail d'une exécution présente :

- anciennes et nouvelles valeurs ;
- règle ou action à l'origine du changement ;
- message d'erreur Shopify ;
- action de relance ciblée sur les erreurs.

## 11. Diagnostic

### 11.1 État prêt

La barre compacte confirme :

- application ou configuration détectée ;
- trois attributs valides ;
- lecture et écriture disponibles ;
- date de dernière vérification.

### 11.2 État partiellement prêt

Le catalogue reste consultable pour les attributs valides. Les contrôles incompatibles sont désactivés avec une explication précise.

### 11.3 État bloqué

La page affiche une liste structurée des vérifications :

- Google Product Category ;
- Gender ;
- Age group.

Chaque ligne montre le propriétaire attendu, l'état détecté et le problème. L'action principale est **Revérifier**. Aucune écriture n'est disponible.

Éviter l'écran d'erreur générique et les messages techniques sans traduction métier.

## 12. États transversaux

Chaque écran doit prévoir :

- chargement par skeleton adapté à sa structure ;
- absence de données avec une action pédagogique ;
- erreur de chargement avec possibilité de réessayer ;
- données obsolètes après une synchronisation distante ;
- changements en attente ;
- succès de publication ;
- publication partielle ;
- perte de connexion ;
- permissions insuffisantes ;
- changement de boutique avec brouillon non publié.

Un changement de boutique doit toujours réinitialiser le contexte visuel du module et empêcher le mélange de données entre boutiques.

## 13. Microcopy de référence

### Actions

- Synchroniser
- Prévisualiser
- Publier 284 modifications
- Appliquer les règles
- Revérifier
- Annuler les modifications
- Relancer les erreurs

### Valeurs et états

- Non renseigné
- Modifié
- Proposition manuelle
- Proposé par « Nom de la règle »
- Incohérence entre variantes
- Conflit entre règles
- Valeur Shopify actuelle
- Prêt à publier
- Exclu de la publication

Les libellés techniques `gender`, `age_group` et `google_product_category` peuvent apparaître dans le diagnostic, mais les écrans métier utilisent prioritairement **Genre**, **Tranche d'âge** et **Catégorie Google**.

## 14. Responsive

### Bureau

- Tableau hiérarchique complet.
- Navigation latérale existante.
- Éditeur de règles maître–détail.
- Barre d'action sticky.

### Tablette

- Colonnes secondaires masquées ou accessibles dans le détail.
- Colonne produit sticky.
- Éditeur de règles en deux zones empilées si nécessaire.

### Mobile

- Produits présentés sous forme de lignes accordéon structurées.
- Attributs empilés avec libellés visibles.
- Variantes accessibles à l'intérieur du produit.
- Filtres dans une feuille dédiée.
- Actions groupées dans une barre fixe adaptée au pouce.
- Correction ponctuelle complète, sans tentative de reproduire la table desktop.

## 15. Accessibilité

- Contraste WCAG AA pour le texte et les contrôles.
- Focus visible sur toutes les cellules et actions éditables.
- Libellés accessibles pour les selects et cases à cocher.
- En-têtes de tableau correctement associés aux cellules.
- État déplié annoncé par `aria-expanded`.
- Erreurs reliées au contrôle concerné et annoncées aux technologies d'assistance.
- Les couleurs ne sont jamais le seul moyen d'indiquer un état.
- Cibles tactiles d'au moins 44 px sur mobile.
- Navigation clavier cohérente dans les tableaux et l'éditeur de règles.

## 16. Contraintes techniques frontend

La fonctionnalité doit s'intégrer à la stack existante :

- React 19 ;
- TanStack Start et TanStack Router ;
- Convex pour les données réactives et brouillons ;
- Tailwind CSS 4 ;
- composants shadcn/Radix existants ;
- Lucide React ;
- tokens de `app/styles.css` ;
- shell et composants de page existants.

Réutiliser avant d'étendre :

- `AppShell` et la navigation existante ;
- `PageHeader` et `pageContentClass` ;
- `StateBadge`, `EmptyState`, `BusyIcon` et `NumberedPaginator` ;
- les composants Button, Table, Checkbox, Select, Popover, Tooltip et Progress ;
- les conventions de filtres déjà utilisées sur la page Produits.

Éviter une nouvelle bibliothèque de tableau si les besoins peuvent être couverts avec les primitives existantes. Si la complexité impose une abstraction de grille, celle-ci doit préserver l'accessibilité et le rendu serveur de l'application.

## 17. Performance frontend

Le volume cible est d'environ 150 produits et 1 500 variantes.

- Paginer les produits.
- Charger ou rendre les variantes à la demande lors du déploiement d'un produit.
- Ne pas monter simultanément 1 500 combobox lourdes.
- Différer le chargement de la taxonomie Google dans les contrôles de catégorie.
- Débouncer la recherche.
- Conserver les brouillons sans rerendre tout le tableau.
- Utiliser des mises à jour optimistes uniquement lorsque le retour arrière est sûr.
- Présenter une progression pour les synchronisations, évaluations de règles et publications longues.

## 18. Composants fonctionnels recommandés

Les noms restent indicatifs, mais le découpage attendu comprend :

- `GoogleFeedPageHeader` ;
- `GoogleFeedDiagnosticBar` ;
- `GoogleFeedTabs` ;
- `GoogleFeedFilters` ;
- `GoogleFeedCatalogTable` ;
- `GoogleFeedProductRow` ;
- `GoogleFeedVariantRow` ;
- `GoogleAttributeCell` ;
- `GoogleCategoryCombobox` ;
- `GoogleFeedBulkBar` ;
- `RulesWorkspace` ;
- `RuleBuilder` ;
- `RuleMatchesPreview` ;
- `GoogleFeedChangesPreview` ;
- `GoogleFeedHistoryTable`.

Les composants métier doivent rester séparés des primitives UI génériques.

## 19. Critères d'acceptation frontend

La première version frontend est acceptée lorsque :

1. Flux Google est accessible depuis la navigation principale.
2. Le catalogue complet est affiché par défaut.
3. Les lignes produit peuvent être dépliées pour afficher leurs variantes.
4. Catégorie Google et Gender sont modifiables depuis la ligne produit.
5. Age group est modifiable depuis chaque ligne variante.
6. Les valeurs actuelles, proposées et leur origine sont distinguables.
7. La sélection groupée indique précisément le nombre de produits et variantes concernés.
8. Les filtres et la pagination sont conservés dans l'URL.
9. L'écran Règles permet de lire une règle comme une phrase métier et d'en prévisualiser les correspondances.
10. La prévisualisation montre les différences avant toute publication.
11. Une publication partielle distingue les réussites des erreurs relançables.
12. Les états prêt, partiel et bloqué du diagnostic possèdent chacun une interface explicite.
13. Le changement de boutique ne mélange jamais les données ni les brouillons.
14. Le parcours principal est utilisable au clavier et sur mobile pour les corrections ponctuelles.
15. L'ensemble réutilise le langage visuel et les composants existants de l'application.

## 20. Points à fournir au moment de l'implémentation

Les éléments suivants seront lus depuis le PRD fonctionnel, le backend ou la boutique et ne doivent pas être inventés par le frontend :

- namespace, clé, type et propriétaire des metafields ;
- disponibilité réelle de Google & YouTube ;
- table exacte de correspondance des pointures et groupes d'âge ;
- identifiants de la taxonomie Google ;
- règles enregistrées pour chaque boutique ;
- permissions et erreurs renvoyées par Shopify.
