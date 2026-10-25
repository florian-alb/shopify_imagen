# Image Studio — proposition de refonte

22 octobre 2026 · Proposition de design, sans modification des écrans de production.

## Direction

Faire d’Image Studio un atelier de travail calme : l’objet traité occupe le centre, sa prochaine action est évidente, ses détails restent à portée de main. L’inspiration Apple porte sur la hiérarchie, la continuité et la qualité du retour d’interaction. Le produit conserve son nom et ses fonctions.

La direction recommandée associe une typographie système, des gris légèrement chauds, un accent bleu, des surfaces pleines pour le contenu et une profondeur réservée aux éléments flottants. Une variante cuivre permet de conserver la famille de couleur actuelle. Ne pas transformer les tables en grandes cartes décoratives : l’application doit rester efficace sur des catalogues importants.

## Périmètre et niveau de preuve

- Audit du shell, des styles, des primitives et des composants des modules Produits, Générations, Opérations groupées, Catalogue, SEO, Flux Google, Prompts, Politiques et Réglages.
- Lecture du contexte métier `docs/catalog-workspace-context.md`, notamment pagination, tags, corrections et isolation des exports/imports.
- Inspection d’une capture locale existante : `output/catalogue-tags/produit-tags-synchronises.png`. Elle montre un banc de démonstration, pas une session de production.
- Serveurs locaux démarrés ; l’inspection du navigateur a rencontré des délais d’attente. Aucun parcours authentifié complet, audit de contraste mesuré de l’application ou test utilisateur n’a été effectué.
- Les constats ci-dessous viennent du code, sauf mention explicite. Les bénéfices attendus sont des hypothèses de design à valider.
- La maquette utilise des données et aperçus textiles d’illustration. Elle n’appelle aucun service ; ses changements restent locaux.
- La syntaxe JavaScript de la maquette a été vérifiée avec `vm.Script` et le fragment a été accepté par le générateur d’aperçu du skill visualize. L’ouverture directe de cet aperçu a été refusée par la politique URL du navigateur (protocole `file:` interdit). Le rendu responsive et les interactions n’ont donc pas été validés dans un navigateur ; ils restent à vérifier avant intégration.
- Le contrôle statique ESLint `no-undef` du script de la maquette passe également. Aucun fichier applicatif n’a été modifié ; les tests et la compilation de l’application n’ont pas été relancés pour cette proposition documentaire.

## Diagnostic

| Constat vérifiable | Conséquence probable | Recommandation |
| --- | --- | --- |
| Huit entrées dans un seul groupe de navigation, dont « Bulk operations », « Generations » et « Générateur de politiques » (`app/components/app-shell/navigation.tsx`). | Les outils de fréquence et de portée différentes paraissent équivalents. | Regrouper par usage et harmoniser les noms en français. |
| La barre supérieure affiche constamment « Cles API serveur » et « Cout suivi par job » (`DesktopTopbar.tsx`). | L’espace prioritaire rappelle des détails techniques sans aider l’action courante. | Déplacer la configuration vers Réglages et les coûts vers Générations. |
| La table Produits affiche neuf colonnes, une largeur minimale de 980 px et des miniatures de 48 px (`ProductsTable.tsx`, `ProductTableRow.tsx`). | Lecture dense et défilement horizontal probable sur des écrans courants. | Quatre colonnes métier : Produit, Visuels, Prochaine action, action contextuelle ; sélection séparée. |
| Les états Action, Génération, Review et Publication sont affichés ensemble ; plusieurs badges peuvent s’ajouter dans Images et Shopify. | Beaucoup d’éléments colorés rivalisent sans indiquer la priorité. | Afficher l’action synthétique existante `primaryAction`, puis les états indépendants dans l’inspecteur. Ne pas supprimer ces états du modèle. |
| Les six filtres avancés sont toujours visibles ; le bouton « Filtres » n’a pas de gestionnaire dans `ProductsFilters.tsx:67`. | Contrôle sans effet et forte occupation verticale. | Recherche + vues de travail visibles ; un panneau de filtres réellement fonctionnel et des critères actifs supprimables. |
| Les actions de sélection se répètent en haut et en bas. La classe `sticky-actions` apparaît dans deux composants mais n’a pas de définition trouvée dans `app/`. | Le caractère persistant attendu n’est pas assuré par ce code ; hiérarchie ambiguë. | Une seule barre de sélection, réellement ancrée, avec espace réservé pour ne pas masquer les dernières lignes. |
| `styles.css` déclare Outfit et Geist à différents endroits, fixe des rayons différents selon le thème et annule toutes les ombres en fin de fichier. | Les règles du système sont difficiles à lire et la profondeur manque de rôles explicites. | Un seul jeu de tokens sémantiques ; même géométrie clair/sombre ; ombres réservées aux surfaces élevées. La police effectivement calculée reste à vérifier dans le navigateur. |
| Certaines erreurs et réservations utilisent `text-red-200` ou `text-amber-200` hors variante sombre (`ProductTableRow.tsx`). | Risque de contraste faible en thème clair, à mesurer. | Couleurs de statut sémantiques avec valeurs distinctes clair/sombre. |
| Les boutons courants mesurent 28 ou 32 px ; la réduction de mouvement n’apparaît explicitement que dans le contrôle segmenté lors de la recherche effectuée. | Les usages tactiles et préférences d’accessibilité ne sont pas traités uniformément. | Cibles tactiles de 44 px et variantes globales de mouvement, transparence et contraste. |
| Le catalogue et le SEO proposent déjà une liste/arborescence avec inspecteur. | Une base cohérente existe pour le reste du produit. | Généraliser ce principe sans uniformiser artificiellement tous les contenus. |

À conserver : composants Radix/shadcn accessibles, états métier distincts, navigation précédent/suivant, thèmes clair/sombre, pagination, aperçu avant publication, gestion des brouillons et confirmations d’import.

## Architecture de navigation

Le sélecteur de boutique reste en haut de la barre latérale et conserve un libellé visible. L’action qui écrit sur Shopify rappelle aussi sa boutique cible. Les compteurs ne sont affichés que s’ils sont disponibles et réellement utiles ; pas de total obtenu en chargeant toutes les lignes.

| Groupe | Entrée | Route conservée | Rôle |
| --- | --- | --- | --- |
| Studio | Produits | `/products` | Choisir les produits et leur prochaine action. |
| Studio | Générations | `/jobs` | Suivre les traitements, vérifier les résultats et consulter les coûts. |
| Studio | Opérations groupées | `/bulk-operations` | Suivre réorganisation et transformations d’images. |
| Catalogue | Imports | `/catalog-import` | Préparer et éditer les catalogues sources. |
| Visibilité | Flux Google | `/google-feed` | Corriger les attributs, prévisualiser et publier. |
| Visibilité | Arborescence SEO | `/seo` | Construire les collections à partir des mots-clés. |
| Configuration | Modèles d’images | `/settings/prompts` | Gérer les prompts et leurs exemples. |
| Configuration | Documents légaux | `/policy-generator` | Préparer et exporter les documents de la boutique. |
| Configuration | Réglages | `/settings` | Boutiques, génération, modèles et paramètres avancés. |

Les groupes restent ouverts sur ordinateur. Sur mobile, la navigation se replie derrière un bouton « Navigation » explicitement nommé. Les liens profonds et leurs paramètres restent valides. Produits reste la destination initiale ; aucun tableau de bord supplémentaire n’est nécessaire.

## Système visuel

Ces valeurs sont une proposition de départ, à contrôler sur les vrais écrans.

| Élément | Clair | Sombre | Usage |
| --- | --- | --- | --- |
| Fond de travail | `#F5F5F7` | `#171719` | Cadre général. |
| Surface de contenu | `#FFFFFF` | `#222225` | Tables, formulaires, inspecteurs. |
| Surface secondaire | `#EEEEF0` | `#2D2D31` | Sélection neutre, champs groupés. |
| Texte principal | `#202124` | `#F3F3F5` | Titres et données. |
| Texte secondaire | `#65656D` | `#A9A9B2` | Aides, métadonnées ; jamais indispensable seul. |
| Accent | `#0066CC` | `#73B6FF` | Action principale, sélection, focus. |
| Séparateur | `#E5E5EA` | `#3B3B40` | Limites utiles. |

- Police : `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. Corps 14 px/1,5 sur ordinateur ; champs 16 px sur mobile ; titres 28–32 px/1,15 avec approche légèrement négative ; labels secondaires 12 px minimum.
- Chiffres tabulaires uniquement pour les compteurs, prix et colonnes numériques. Ne pas les imposer à tout le texte.
- Espacement sur une échelle 4/8/12/16/24/32. Marges de page 24–32 px sur ordinateur, 16 px sur mobile.
- Boutons 36 px sur ordinateur, cible de 44 px au tactile. Rayons 8–10 px pour les contrôles, 12–16 px pour les panneaux et fenêtres. Même géométrie dans les deux thèmes.
- Une seule action pleine par zone de travail. Les secondaires sont neutres ; une icône seule reçoit un nom accessible et une aide.
- Couleur réservée aux actions et aux états qui demandent une décision. « Annulé » reste neutre, « Échec » rouge, « En cours » bleu, « À vérifier » ambre, « Prêt » vert. Toujours accompagner la couleur de texte ou d’un symbole.
- Contenu sur surfaces pleines. Translucidité modérée sur la barre de sélection, une barre d’outils flottante ou un panneau superposé ; éviter l’empilement de surfaces transparentes.
- L’inspecteur de bureau appartient à la mise en page, sans voile sombre. Une confirmation qui bloque réellement le travail utilise une fenêtre modale avec voile et gestion du focus.

## Refonte écran par écran

### Produits

En-tête compact : titre, nombre de résultats disponible et Synchroniser. Sous l’en-tête : recherche, vues Tous / À générer / À vérifier / Prêts / Publiés, puis Filtres. Le compteur d’erreurs reste visible même quand un état synthétique est affiché.

La vue liste est la vue initiale, avec miniature 56–64 px et titre lisible sur deux lignes. L’action de chaque ligne dépend de son état. La vue mosaïque est une option ultérieure utile à la comparaison visuelle, pas un prérequis à la première livraison.

Un clic sur le titre ouvre le détail rapide ; un lien explicite ouvre l’espace de travail complet. La sélection multiple révèle une barre unique : « 6 produits sélectionnés », « Générer des visuels », « Autres actions ». Ne pas afficher une commande primaire désactivée sans expliquer comment l’activer.

### Fiche produit, vérification et retouche

Garder une page dédiée pour le travail approfondi : aperçu dominant, miniatures des visuels, choix de déclinaison et inspecteur de 320 px environ. Sur une image, regrouper statut, consigne et actions à proximité. Les informations Shopify et l’historique passent dans des sections secondaires accessibles.

L’approbation d’une image reste distincte de sa publication. Une publication propose un récapitulatif avec boutique cible, images retenues et comportement d’ajout/remplacement. La retouche conserve le canvas, ses raccourcis, son historique et sa barre d’outils ; le redesign porte sur le cadre et la hiérarchie. Une comparaison source/résultat peut constituer un lot fonctionnel séparé.

### Générations et opérations groupées

Mettre d’abord les opérations actives et celles en erreur, puis l’historique. Chaque ligne montre cible, progression vérifiable, résultat, date et coût disponible. Les dépenses cumulées passent dans une synthèse compacte ou une section « Coûts » ; les tokens restent dans les détails techniques.

Réutiliser la même présentation des tâches dans les opérations groupées, tout en conservant leurs routes et leurs états propres. Ne pas inventer un pourcentage pour une phase qui ne fournit qu’un état.

### Imports de catalogue

Créer un parcours lisible « Source → Tags → Catalogue → Export ou import ». Le parcours reflète les états réels ; il ne force pas une progression linéaire quand les tags peuvent encore être édités.

Conserver la liste paginée et l’inspecteur déjà présents. Clarifier la différence entre données source, corrections manuelles et valeurs effectives. L’indication « Correction enregistrée » reste attachée au champ. Les collections et le menu sont des vues du catalogue, les exports des actions.

Une seule entrée Exporter ouvre JSON / CSV Shopify avec leurs différences. « Préparer l’import Shopify » reste l’action principale finale. Produits, Collections et Menu restent sélectionnables indépendamment dans la confirmation. Les états bloqués, conflits de version, collectes partielles et tags non validés gardent leurs explications.

### Flux Google

Même en-tête, barre de recherche et table que le catalogue. Conserver les vues Catalogue / Règles / Aperçu / Historique. Les erreurs de configuration n’occupent un bandeau prioritaire que lorsqu’une intervention est nécessaire. L’aperçu présente clairement avant/après et la portée des changements avant publication.

### Arborescence SEO

Conserver l’organisation déjà pertinente : arbre à gauche, détail à droite. Donner plus de place au nom des collections et à leur mot-clé principal. Distinguer visuellement les données mesurées et les suggestions ; maintenir les opportunités sans Excel dans une vue séparée, avec leurs limites.

Pour créer un projet : fichier, marché/langue, sources, action principale. Les réglages de correspondance avancés restent un niveau plus bas. Les nouveaux raccourcis clavier ou le déplacement par glisser-déposer seraient des ajouts fonctionnels à traiter séparément.

### Modèles d’images

Liste de modèles à gauche et éditeur à droite. Nom, usage, version active et exemple dominent ; variables et paramètres techniques sont des aides contextuelles. Employer « Modèles d’images » dans la navigation et conserver le mot « prompt » dans l’éditeur où il est précis.

### Documents légaux

Formulaire en sections à gauche, aperçu typographique stable à droite. Sélecteur de langue partagé, navigation entre documents et export près de l’aperçu. Distinguer validation des champs, prévisualisation et export, sans changer les règles métier ni prétendre à une validation juridique.

### Réglages et connexion

Réglages en groupes cohérents : Boutiques, Génération, Modèles, Avancé. Afficher les statuts de connexion et les erreurs près des champs concernés. La connexion reprend la même police, les mêmes contrôles et des messages d’attente courts, en français.

## Interaction et accessibilité

- Retour visuel dès l’appui, sans attendre la réponse réseau. Les succès ne sont annoncés qu’après confirmation de l’opération.
- Panneaux réversibles : même trajectoire à l’ouverture et à la fermeture, animation à partir de la position courante, aucune période où les commandes sont bloquées par la transition.
- Ressorts amortis sans rebond par défaut, réponse visée 0,3–0,4 s. Réserver les rebonds aux gestes avec momentum ; ne pas ajouter de mouvement aux grandes tables à chaque mise à jour.
- Animations courantes sur `transform` et `opacity`. Le flou reste statique par défaut pour éviter son coût sur de grandes surfaces ; toute animation de matériau doit être mesurée avant adoption.
- `prefers-reduced-motion` : passage immédiat ou fondu court. `prefers-reduced-transparency` : surfaces pleines. `prefers-contrast` : séparation plus explicite et contraste renforcé.
- Navigation au clavier, focus visible, retour du focus à l’élément d’origine, noms accessibles des contrôles, annonces des résultats via une zone de statut.
- Sur mobile, remplacer l’inspecteur latéral par une vue de détail avec retour à la liste ; préserver filtres, page et sélection. Ne pas compresser trois colonnes de travail.
- États à concevoir : chargement, première utilisation, aucun résultat filtré, déconnexion, erreur, succès partiel, tâche longue, contenu trop long, sélection périmée et écriture concurrente.

## Mise en œuvre proposée

1. **Fondations et shell** : simplifier `app/styles.css`, harmoniser Button/Input/Badge, PageHeader, navigation et barre supérieure. Conserver les primitives accessibles.
2. **Parcours Produits** : alléger la table, rendre Filtres opérationnel, unifier la sélection et créer l’inspecteur. Réutiliser `primaryAction` ; maintenir les détails métier existants.
3. **Travail sur les images** : fiche produit, vérification, retouche et publication. C’est l’écran pilote pour valider le niveau de finition et la continuité.
4. **Autres espaces** : appliquer les modèles liste/inspecteur, formulaire/aperçu et historique aux imports, au flux Google, au SEO et aux documents.
5. **Finition** : sombre, tactile, clavier, mouvements réduits, textes français, contenus longs et états d’erreur.

Créer les compositions partagées dans `app/components/layout/` et `app/components/shared/` seulement après deux usages réels. Ne pas ajouter de logique métier aux primitives `ui/`. Ne pas ajouter de dépendance d’animation en première étape : les interactions simples peuvent utiliser les API existantes ; une bibliothèque serait une décision distincte.

Le catalogue reste édité dans Convex, avec lectures bornées, résolveur effectif, corrections manuelles, identité source et isolation des snapshots conservés. Aucun redesign ne doit reconstruire les listes depuis R2 ni mettre en dépendance d’effet l’identité des proxies `api.*`. Les changements visuels ne justifient aucune migration.

## Critères de validation avant intégration

- Comprendre en quelques secondes quelle image ou quel produit demande une action ; vérifier par des tâches observées, pas par un score inventé.
- Parcourir sélection → génération → vérification → publication avec le contexte boutique toujours identifiable.
- Tester 1440, 1024, 768 et 390 px, puis 320 px et zoom à 200 %. Pas de contenu essentiel coupé ni d’action masquée par une barre flottante.
- Mesurer les contrastes réels : 4,5:1 pour texte courant et 3:1 pour grands textes et éléments non textuels pertinents.
- Vérifier focus, navigation clavier, lecteurs d’écran, mouvements réduits, transparence réduite, thème sombre et longues traductions.
- Vérifier l’absence de requêtes ou abonnements supplémentaires déclenchés par les animations et le changement d’inspecteur.
- Après intégration : tests pertinents, `npm run typecheck`, `npm run lint`, `npm run build`, et `npm run check:convex-contract` si l’intégration frontend/backend change. Les vérifications locales ne remplacent pas un parcours authentifié.

## Référence de travail

[Skill apple-design](/Users/florian/.agents/skills/apple-design/SKILL.md), fourni pour cette demande : hiérarchie, feedback immédiat, continuité spatiale, retenue et accessibilité. Cette proposition adapte ces principes à un outil métier sur le web.

## État au 22 octobre 2026

La direction visuelle est maintenant intégrée au frontend existant. Voir [le compte rendu d’intégration](integration-interface.md) pour le périmètre livré, les commandes exécutées et les limites de validation. Le prototype initial reste une référence de direction ; les écrans intégrés conservent les parcours métier réels.
