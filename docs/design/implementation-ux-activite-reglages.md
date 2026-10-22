# UX — générations, opérations groupées et réglages

## Plan avant modification

1. Générations : extraire les responsabilités de la page, proposer des vues de travail fondées sur les filtres serveur existants, donner une prochaine action à chaque lot et une liste utilisable sur mobile. Déplacer les coûts dans une synthèse secondaire dont la portée est explicite.
2. Lot : conserver les contrôles de génération, vérification, retouche et publication ; transmettre la vue attendue et le contexte de retour depuis la liste, clarifier le périmètre avant publication.
3. Opérations groupées : conserver la pagination par curseur et les dialogues métier ; harmoniser les lignes et cartes, distinguer préparation, publication, reprise et restauration, rendre le filtre de type adressable sans filtrer seulement une page de résultats.
4. Réglages : rendre les onglets adressables, rapprocher la synchronisation de la boutique active, présenter les boutiques dans une liste lisible et déplacer l’ajout dans un assistant dédié. Conserver domaine, nom, clés, filtre catalogue, instructions de configuration, copies et vérification/autorisation Shopify.
5. Tester les transitions et décisions de prochaine action ; vérifier les vrais composants dans la simulation locale sur ordinateur/mobile ; exécuter TypeScript, lint, tests, contrat Convex et build.

## Contraintes

- Réutiliser les appels et protections métier existants. Aucun déploiement, changement de données de production, connexion réelle de boutique ou traitement Shopify/IA pendant la validation.
- Ne pas inventer un agrégat « À traiter » en filtrant uniquement la page courante, ni des compteurs globaux à partir de celle-ci.
- Ne pas persister les clés de boutique dans l’URL ou le stockage du navigateur. La fermeture de l’assistant peut conserver le brouillon en mémoire, jusqu’au démontage/rechargement.
- Préserver les changements préexistants et ne pas ajouter de dépendance.

## Réalisation

- `/jobs` : vues Toutes, À vérifier, En cours, Terminées, En échec et Archivées ; les combinaisons avancées restent disponibles. Chaque lot propose Vérifier, Examiner, Suivre ou Voir les images selon son état. Le nombre affiché désigne la page courante, jamais tout l’historique.
- Liste responsive sans tableau à largeur minimale ; coûts de boutique dans un volet secondaire chargé à son ouverture, avec leur portée explicite. Pagination, filtres produit/fournisseur/mode/statut/vérification, archivage et suppression restent reliés aux appels existants.
- `/jobs/$jobId` : filtre d’images dans l’URL, retour aux filtres et à la page d’origine. Les cartes produit et la barre d’actions précisent le périmètre « images visibles », « produit » ou « lot ». Confirmation avec destination et exclusion des images non admissibles, sans modification de la logique de publication. Barre mobile compacte, détails techniques et contrôles de traitement conservés.
- `/bulk-operations` : historique responsive, phases préparation/publication/restauration distinctes, prochaine action adaptée. Le filtre de type est dans l’URL et repart au premier curseur. La pagination serveur et les dialogues de comparaison, publication, reprise, restauration, annulation et archivage réutilisent les hooks existants.
- `/settings` : rubriques dans l’URL, liste de boutiques avec boutique active et contrôle d’accès explicites, synchronisation à côté de la boutique concernée. Les formulaires de réglages restent montés entre rubriques.
- Ajout d’une boutique dans un dialogue en quatre étapes, validation du domaine, raccourci pour les clés déjà disponibles, informations de configuration copiables, filtre catalogue en option avancée et erreurs en ligne. Les actions restent visibles pendant le défilement. Le brouillon reste en mémoire à la fermeture ; il est effacé explicitement ou après sauvegarde. Aucun secret dans l’URL ni stockage navigateur ajouté.
- Le succès distingue l’enregistrement/activation de la boutique de la vérification de ses autorisations. Un domaine déjà enregistré annonce la mise à jour de ses clés. Les instructions utilisent le [Dev Dashboard documenté par Shopify](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard) ; elles remplacent les anciennes illustrations d’administration.

## Validation — 22 octobre 2026

- `npm run typecheck` : réussi.
- `npm test` : 79 fichiers, 604 tests réussis. Dix nouveaux tests couvrent les vues, URL, contexte de retour et phases/actions des opérations. Une exécution simultanée au build a dépassé le délai de 5 s dans un test de publication Convex ; la suite complète relancée seule passe sans modifier les délais ni ce test.
- `npm run lint` : 0 erreur, 67 avertissements préexistants.
- `npm run build` : réussi après le dernier ajustement visuel.
- `npm run check:convex-contract` : 114 références frontend validées.
- TypeScript séparé de la simulation locale (configuration temporaire incluant `scripts/design_ui_check.tsx` et ses fixtures) : réussi.
- `git diff --check` : réussi. Aucun changement des fichiers Convex, dépendances ou variables d’environnement.

Contrôles manuels avec les composants et hooks réels, sur un client Convex simulé :

- Boutique : domaine invalide bloqué ; parcours des quatre étapes ; pied du dialogue accessible sur une fenêtre basse et à 390 px ; fermeture/reprise avec champs conservés ; erreur simulée puis nouvelle sauvegarde réussie ; activation et vérification d’accès simulées ; retour du focus au bouton d’ajout.
- Réglages : changement de rubrique et conservation d’un champ modèle non enregistré ; correspondance du paramètre `tab`.
- Générations : vue À vérifier, lien vers les seules images en attente, confirmation du périmètre de publication de tout le lot, annulation et retour à la même liste filtrée ; volet de coûts et sélecteur mobile.
- Opérations : ouverture des aperçus, passage à la confirmation de remplacement sans la valider, résultat de restauration partielle avec reprise disponible ; deuxième page puis filtre Miroirs ramenant au premier curseur ; listes et lot à 390 px.

Captures : `output/ux-reglages-boutiques.png`, `output/ux-ajout-boutique.png`, `output/ux-generations.png`, `output/ux-operations-groupees.png`. Simulation hors des routes de production : `scripts/activity_settings_fixture.ts`, avec données fictives, identifiants masqués dans son journal et aucune requête métier externe.

Ces contrôles ne constituent pas une connexion OAuth réelle ni un parcours authentifié complet sur Shopify/Convex. Aucun enregistrement de boutique réelle, traitement payant, remplacement de média ou déploiement n’a été exécuté. Les compteurs de la simulation sont illustratifs. Les panneaux de réglages des modèles et options avancées gardent leurs composants existants ; la refonte de cette étape porte sur la navigation, les boutiques et leur connexion.

La version compilée finale a été relancée avec `npx vite preview --port 3000 --host 127.0.0.1`. L’ouverture de `/settings` redirige vers `/login?redirect=%2Fsettings` sur cette origine sans session. La page de connexion répond ; la navigation authentifiée de production n’est pas revendiquée comme vérifiée.
