# Mise en place UX — fiche produit et vérification/publication

## Plan avant modification

1. Séparer les paramètres de liste (retour et précédent/suivant) des paramètres de travail (vue, filtre d’images, déclinaison, préparation de publication). Valider les URL et tester les transitions.
2. Organiser la fiche en Images, Références et déclinaisons, Historique et Informations. Conserver les hooks métier et les dialogues de génération, retouche, suppression et publication. Garder les formulaires montés lors d’un changement d’onglet.
3. Relier les actions de la liste et de l’aperçu à la tâche attendue ; maintenir leur accès sur mobile. Ajouter les vues En cours et À reprendre.
4. Expliciter le périmètre de vérification et de publication. Corriger la sélection globale depuis une déclinaison et empêcher qu’un lien de groupe invalide se transforme en action sur tout le produit.
5. Vérifier les états avec/sans groupes, le retour aux résultats, le clavier/mobile et les dialogues avec un client local simulé. Exécuter les tests pertinents, TypeScript, lint, contrat Convex et build.

## Contraintes

- Aucun changement de backend, déploiement, génération payante ou écriture Shopify pour la validation.
- Réutiliser les règles d’admissibilité existantes, y compris la republication d’images déjà envoyées et les règles du prompt n° 1.
- Conserver les modifications préexistantes du dépôt, dont les suppressions `.serena/`.
- Les fonctionnalités nouvelles de l’audit (brouillons persistants, compteurs agrégés et file de vérification transversale) ne font pas partie de cette réorganisation du parcours produit.

## Réalisation

- La fiche propose quatre vues : Images, Références et déclinaisons, Historique, Informations. Les formulaires restent montés quand on change d’onglet. Les informations communes restent accessibles lorsqu’une déclinaison est sélectionnée.
- Les actions Vérifier, Publier, Suivre et Examiner de la liste et de l’aperçu ouvrent leur vue dédiée. La préparation de publication est un dialogue, jamais une écriture déclenchée par un lien.
- La vue, le filtre d’images et le groupe sont portés par l’URL. Précédent/suivant conserve les filtres de liste et de travail, sans transmettre le groupe propre au produit ni rouvrir une publication. Le retour aux résultats conserve les filtres de liste.
- L’approbation groupée ne concerne que les images en attente et admissibles de la vue. La publication réintersecte les IDs sélectionnés avec les images encore admissibles du périmètre au moment du clic. « Tout sélectionner » dans une déclinaison ne sélectionne plus les autres déclinaisons.
- Les nouvelles images prêtes sont distinguées des images déjà publiées. La republication reste disponible, avec une sélection explicite des images déjà envoyées. Les options de remplacement de galerie/variantes et la contrainte du prompt n° 1 sont conservées.
- Le produit, la déclinaison et la boutique de destination sont rappelés dans la confirmation. Un groupe invalide bloque les actions jusqu’au retour explicite à la vue d’ensemble. La fermeture du dialogue rend le focus au titre du produit.
- Les actions de liste restent visibles sur mobile ; les onglets sont plus courts, les filtres passent en sélecteurs et la barre de publication reste dans le flux sur petit écran pour ne pas masquer les images.
- Génération, variantes, références, réordonnancement Shopify, retouche, zoom, suppression et historique réutilisent les composants et hooks existants. Les libellés des états et actions d’image sont harmonisés en français. Les actions des lots précisent « dans cette vue » ou « du lot » selon leur portée.

## Vérification — 22 octobre 2026

- `npm run typecheck` : réussi.
- `npm test` : 76 fichiers, 594 tests réussis, dont 8 nouveaux tests couvrant les URL et les périmètres de vérification/publication.
- `npm run build` : réussi après les derniers ajustements.
- `npm run lint` : 0 erreur, 67 avertissements préexistants.
- `npm run check:convex-contract` : 114 références frontend validées.
- `git diff --check` : réussi.
- TypeScript séparé des deux fichiers de simulation (`scripts/design_ui_check.tsx`, `scripts/product_workspace_fixture.ts`) : réussi.

Contrôles manuels sur les vrais composants avec un client Convex simulé : accès direct Vérifier/Publier ; approbation des deux images en attente de Sable ; sélection globale puis publication simulée des trois seules images Sable ; contrôle des arguments enregistrés ; republication ouverte avec zéro sélection ; navigation clavier entre les onglets ; présence des références et informations ; produit suivant sans groupe ; retour à la liste filtrée ; lien de groupe invalide ; fermeture avec focus sur le titre ; liste, fiche, galerie et confirmation à 390 px.

Les dialogues de génération, retouche et suppression s’ouvrent. Aucun traitement payant, suppression, réordonnancement ou enregistrement de retouche réel n’a été exécuté. Le client de simulation ne prépare pas la source de retouche et affiche son refus explicite. Ces contrôles ne constituent pas un parcours authentifié de bout en bout sur Convex/Shopify. Les états agrégés des produits de simulation sont fixes et ne reflètent pas les mutations simulées d’images.

Captures : `output/ux-fiche-produit.png`, `output/ux-publication-produit.png`, `output/ux-fiche-produit-mobile.png`. La simulation est hors des routes de production et n’effectue aucune requête métier externe.

L’application compilée a été relancée avec `npx vite preview --port 3000 --host 127.0.0.1`. L’accès à `/products` redirige correctement vers la connexion sur cette nouvelle origine locale ; la fiche réelle reste à vérifier dans une session authentifiée.
