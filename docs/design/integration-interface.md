# Intégration de l’interface — 22 octobre 2026

## Plan

1. Unifier les tokens, les contrôles, les surfaces et le shell ; regrouper les liens sans changer les routes.
2. Intégrer la liste Produits simplifiée, les filtres dépliables, l’aperçu rapide et la barre de sélection ; conserver tous les accès aux fonctions existantes.
3. Harmoniser les vues métier (images, générations, imports, SEO, flux Google, modèles, documents et réglages) en conservant leurs formulaires, confirmations et appels serveur.
4. Vérifier TypeScript, lint, tests, contrat Convex et build, puis examiner les vrais composants dans le navigateur avec les bancs isolés existants et un banc du shell/produits.

## Contraintes

- Aucun changement de schéma, de fonction Convex ou de configuration externe.
- Pas de migration, de publication Shopify ou de génération payante pour vérifier le design.
- Pas de nouvelle dépendance de production.
- Les captures et bancs isolés ne constituent pas un test authentifié de bout en bout.
- Les suppressions préexistantes de `.serena/` ne font pas partie de cette intégration.

## Résultat intégré

- Système visuel partagé : typographie système, palette neutre avec accent bleu, surfaces, bordures, espacement, contrôles et badges sémantiques. Thèmes clair/sombre et préférences de mouvement, transparence et contraste prises en compte.
- Navigation par espaces, sélecteur de boutique compact, fil d’Ariane des imports et du SEO, réglages accessibles directement, déconnexion explicite. Les routes existantes sont conservées.
- Produits : recherche, cinq filtres rapides, six filtres avancés dépliables, table adaptative à la largeur disponible et aperçu sans requête supplémentaire. L’aperçu contient les informations détaillées retirées de la table et garde l’accès à la fiche complète et à la génération. Échap ferme l’aperçu et restaure le focus.
- Une barre de sélection regroupe génération, réorganisation et miroir ; sélection entre pages et effacement explicite. Les dialogues, prévisualisations de variantes et appels métier existants sont réutilisés.
- Fiches produit, historique des générations, import de catalogue, inspecteur catalogue, SEO et réglages harmonisés. Flux Google, opérations groupées et documents héritent des primitives communes ; leurs parcours métier restent en place.
- Les inspecteurs défilent indépendamment sur bureau et deviennent des panneaux dans le flux sur mobile. La table produit se masque pendant l’aperçu mobile et revient à sa fermeture.
- Les boutons de thème mobile et bureau synchronisent leur état. Un seul repère `main` demeure par page métier.

## Validation réalisée

- `npm run typecheck` : succès.
- `npm test` : 74 fichiers, **586 tests réussis**.
- `npm run lint` : zéro erreur ; **67 avertissements préexistants**, identiques à la mesure avant modification.
- `npm run check:convex-contract` : succès, 114 références frontend.
- `npm run build` : succès.
- `git diff --check` : succès.
- Vérification TypeScript séparée du nouveau banc local : succès.
- Navigateur, vrais composants et hooks avec client en mémoire : choix des types d’image et des variantes (le compteur passe de 2 à 9), dialogue de réorganisation, filtres avancés, effacement des filtres, sélection conservée entre deux pages et effacement de sélection, aperçu et restauration du focus par Échap, thèmes clair/sombre.
- Vue de 390 px : liste adaptée, aperçu, neuf liens du menu mobile, navigation vers Imports. Les libellés des filtres rapides restent lisibles dans un défilement horizontal.
- Imports/SEO : formulaires visibles ; espace catalogue existant : liste, inspecteur et formulaire de correction accessibles.

Banc du shell et des produits : `npx vite --config scripts/vite.catalogue-ui.config.ts`, puis `/scripts/design_ui_check.html`. Vue mobile : `/scripts/design_mobile_ui_check.html`. Ces fichiers sont hors des routes de production et n’envoient aucune mutation/action à Convex ou Shopify. Le banc catalogue existant conserve sa simulation indépendante.

Captures : `output/refonte-interface-produits.png` et `output/refonte-interface-sombre.png` (données fictives, vignettes absentes dans ce banc).

## Limite de validation

Les composants ont été vérifiés avec des données locales ; cela ne constitue pas un parcours authentifié de bout en bout. Le navigateur intégré a échoué à charger la session complète, avec une erreur de chargement du module client en mode Vite et un délai dépassé sur la version compilée. Les serveurs locaux démarrent correctement. La génération payante, les écritures Shopify et la publication en production n’ont pas été déclenchées.
