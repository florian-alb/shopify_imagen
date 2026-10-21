# Qualification de la refonte catalogue

1er octobre 2026. Cible : **dev `curious-greyhound-437`**. Frontend local, backend Convex déployé. Aucun déploiement frontend de production ni import Shopify réel.

## Contrôles automatisés

- `npm test` : **245 tests réussis, 42 fichiers**. Les tests de l’ancien moteur ont été retirés avec son code ; 37 tests ciblent le nouveau catalogue, le réseau et Shopify simulé.
- `npm run typecheck` et contrôle TypeScript Convex : réussis.
- `npm run check:convex-contract` : **102 références frontend**, contrat valide. Le contrôle couvre désormais aussi `usePaginatedQuery`.
- ESLint des nouveaux composants, du backend catalogue et du banc UI : zéro erreur ou avertissement.
- `npm run build` : réussi. Avertissement existant sur la taille du chunk commun de l’application ; ce n’est pas une mesure de performance catalogue.
- `git diff --check` : réussi.

Les tests traversent les fonctions Convex avec utilisateurs simulés : isolation des propriétaires, contrôle des versions et générations, validation explicite des tags, détection des collisions, globalité et pagination du Top N, déduplication des URL/identités, compensation d’un alias par le produit distinct suivant, collections vides/hors menu, ajout au-delà de N, conservation des réussites et du JSON après échec HTML, trois tentatives puis relance ciblée, refus de classement indisponible, acceptation du caractère partiel, corrections manuelles, invalidation d’export et recherche exacte avec continuation.

L’export est testé sur plusieurs parties et actions, dont une réponse finale perdue après écriture. Le transport simulé refuse de réutiliser un upload terminé : le worker doit reconnaître son token final. Le JSON reconstruit est valide, sans doublons et sans perte de champs inconnus. Les fixtures HTML/JSON historiques vérifient variantes, images, Pflege, Produktdetails, Hinweise Zur Verwendung et nettoyage du HTML. La langue est conservée lorsqu’un attribut source la fournit ; elle n’est pas inventée lorsque cet attribut manque.

Les six tests Shopify simulent : créations DRAFT par bulk, produits existants et tags marchands préservés, réponse de soumission perdue réconciliée sans deuxième soumission, soumission non réconciliée maintenue verrouillée, médias échoués non déclarés réussis, refus d’une fiche sans HTML. Les 16 documents GraphQL utilisés ont été validés contre le schéma via l’outil Shopify, sans exécution des mutations. Cela ne remplace pas un import réel de bout en bout ni la qualification des limites d’une boutique destination.

Le dernier contrôle de reprise vérifie aussi qu’un JSON syntaxiquement valide mais incomplet est retéléchargé, tout en conservant le statut réussi du complément HTML. Le test ciblé, le typage et le lint ont été rejoués après ce correctif.

## Navigateur

Banc isolé sur `http://127.0.0.1:3002/scripts/catalogue_ui_check.html`, exécutant les vrais composants avec un client Convex en mémoire. Aucun appel Shopify ou backend depuis ce banc.

Contrôles effectués : catalogue complet sélectionné par défaut ; Top N et refus de zéro ; ouverture de fiche ; description et compléments HTML ; correction de titre et tags ; collection vide conservée ; badge hors menu ; accès à la correction/validation des tags après collecte ; collision bloquant la validation ; confirmation d’import inactive jusqu’au choix de destination et à l’acceptation du caractère partiel ; fiche pleine largeur à 390 pixels ; Échap et retour du focus à la ligne ; rendu clair et sombre. La liste n’a pas de débordement horizontal de page à 390 pixels, les onglets peuvent défiler dans leur propre zone.

Captures de données **simulées**, sans valeur de résultat de collecte :

- [Desktop](../output/catalog-refonte-ui-desktop.png).
- [Sombre](../output/catalog-refonte-ui-dark.png).
- [Mobile](../output/catalog-refonte-ui-mobile.png).

La véritable route locale répond et demande une connexion. Aucune session authentifiée n’étant disponible dans le navigateur utilisé, **aucun E2E authentifié n’est revendiqué**. Les tests Convex et la qualification R2 utilisent une identité de test/CLI, pas une connexion navigateur. Aucune modification des comptes ou des permissions d’authentification.

## Régression de pagination corrigée après signalement

Correctif déployé sur **dev `curious-greyhound-437`** le 1er octobre à 11:24. Le contrat paginé a été vérifié en lecture seule sur le catalogue existant. [Capture du banc isolé, page 26–40](../output/catalog-refonte-pagination.png).

Le filtre de collection renvoyait uniquement les correspondances d’un lot technique (25 produits du classement global) et l’interface ne poursuivait que les lots vides. Un lot contenant un seul produit pouvait donc devenir une page entière. Le contrôle en lecture seule du catalogue dev confirme 964 produits et 40 sélectionnés dans `capybara-kuscheltier`.

Le client assemble désormais les lots réactifs jusqu’à 25 correspondances et une correspondance de prélecture, ou la fin du catalogue. Les données existantes ne nécessitent aucune migration ou nouvelle collecte. Le test Convex couvre 40 produits dispersés, sans doublon et dans l’ordre. Le banc navigateur `?scenario=pagination` reproduit 964 produits : première page 25, deuxième 15, Suivant désactivé à la fin, retour à la première page, recherche d’un produit de fin de catalogue depuis la deuxième page et filtre d’état vide. Ces contrôles navigateur utilisent des données simulées.

## Langue et édition des tags — 19 octobre 2026

Le choix de langue est disponible avant lancement et modifiable pendant/après la découverte. Anglais reste le défaut des catalogues existants. Les accents et autres alphabets sont acceptés ; les doublons sont détectés après normalisation NFC. L’application des tags aux produits est séparée du lancement de la collecte. Un brouillon conserve les derniers tags appliqués et les tags manuels propres aux fiches restent prioritaires.

- Suite complète : **546 tests réussis, 71 fichiers**. Cinq nouveaux tests Convex couvrent la langue initiale et en cours de travail, les propositions IA après validation, la propagation liste/fiche/export, les brouillons, les overrides, les collisions Unicode, les écritures concurrentes, la fusion des checkpoints et les résultats IA dans une ancienne langue. IA, réseau, R2 et Shopify sont simulés dans ces tests.
- Typage app/Convex, contrat **114 références frontend**, lint ciblé, build et `git diff --check` réussis. Avertissement existant sur les gros chunks du build.
- Backend accepté avec `npx convex dev --once --typecheck enable` sur **dev `curious-greyhound-437`**. Le déploiement global a repris les fichiers SEO préexistants du workspace ; aucun import Shopify réel ni écriture de production.
- Banc navigateur isolé : français sélectionné dans le formulaire de départ puis conservé dans l’étape Tags ; reproposition simulée en français ; correction `oiseaux-été`, validation sans collecte, tag visible dans la collection puis dans une fiche membre ; console sans erreur ni avertissement.
- Captures simulées : [éditeur de tags](../output/catalogue-tags/tags-francais.png), [fiche avec les tags synchronisés](../output/catalogue-tags/produit-tags-synchronises.png).

Cette qualification ne prouve pas un parcours navigateur authentifié, la qualité linguistique d’une réponse Gemini réelle, un nouvel export R2 réel ou un import Shopify réel. Les limites historiques ci-dessous restent applicables.

Le sélecteur de langue est désormais le composant UI partagé `LanguageSelect`, réutilisé pour le catalogue, le SEO et les politiques. Les libellés, drapeaux et l’ordre sont centralisés ; les langues prises en charge restent propres à chaque module. Contrôle sur les bancs catalogue/SEO : drapeaux et coche visibles, choix conservé, sélection au clavier par libellé, console sans erreur ni avertissement. [Capture du catalogue simulé](../output/shared-language-select/catalogue.png). Suite complète de 546 tests, contrôles de typage/lint/build et contrat frontend réussis ; cette modification est uniquement frontend.

## Collecte des thèmes sans h1 — 20 octobre 2026

Diagnostic en lecture seule sur **production `youthful-bandicoot-479`**, catalogue `le-mocassin-chic.com` de 595 fiches. Les douze échecs échantillonnés possèdent leur JSON complet et signalent tous « Page HTML sans titre produit : thème à vérifier. ». La lecture publique d’une fiche confirme l’absence de `h1`, malgré des métadonnées produit valides. Cela ne constitue pas un inventaire exhaustif des erreurs du catalogue.

Le lecteur accepte désormais les métadonnées Open Graph `product` lorsque leur titre correspond au JSON source et que leur URL correspond à la fiche demandée, origine comprise. Les pages génériques, mauvais titres, autres produits/domaines, URL invalides et titres seuls restent refusés. Une opération interne de reprise incrémente la génération avant de relancer les échecs ; elle refuse les générations périmées et les travaux de découverte/export/import, y compris bloqués.

- **561 tests réussis, 72 fichiers**, dont la collecte/reprise sans `h1`, la conservation du JSON et des réussites, les écritures d’un ancien worker refusées et les snapshots d’import/export protégés. Réseau, IA, R2 et Shopify restent simulés dans la suite.
- JSON et HTML publics réels de `mocassin-daim-homme-marron`, analysés localement avec le lecteur corrigé : identité `10395579973978`, JSON/HTML complets, **11 variantes, 8 images, 3 rubriques complémentaires**, aucune erreur ni avertissement. Cette preuve porte sur une fiche, pas sur les 595.
- Typage app/Convex, contrat de **114 références frontend**, lint ciblé, build et contrôle du diff réussis. Avertissement existant de taille des chunks.
- Backend final accepté par `npx convex dev --once --typecheck enable` sur **dev `curious-greyhound-437`**. Aucune migration de schéma, nouvelle collecte métier dev, écriture de production ou import Shopify réel pendant cette qualification. Le déploiement production et la reprise du catalogue restent à autoriser et à vérifier. Aucun parcours navigateur authentifié revendiqué.

## Export réel Convex → R2

Une fixture synthétique dédiée à l’export a été créée sur le dev avec une fiche et un complément HTML. La mutation publique d’export a été appelée avec l’identité CLI de son propriétaire. Une vérification serveur a téléchargé le fichier final et listé le préfixe :

| Contrôle | Résultat |
| --- | --- |
| Version du format | 2 |
| Fiches dans le JSON | 1 |
| Objets sous le préfixe catalogue | **1** |
| Champ JSON inconnu conservé | Oui |
| Complément HTML conservé | Pflege |
| Fixture et objet R2 retirés après contrôle | Oui |

Le test a utilisé le stockage privé réel, sans source publique réelle, IA, création Shopify ou modification des données métier partagées. Il ne qualifie pas un export de plusieurs milliers de fiches en réseau ; le multipart volumineux est couvert par simulation.

## Retrait de l’ancien moteur

[Rapport de nettoyage](../output/catalog-refonte-retirement.json), [décision et procédure](catalog-workspace-migration.md).

Les dix racines d’opérations dev inventoriées sont nettoyées. **16 034 suppressions d’objets R2 sont confirmées**, incluant les sous-racines d’import supprimées avec leur parent. Les références d’opérations et d’espaces de production ont été lues uniquement pour protéger leurs racines ; aucun chevauchement constaté, aucune écriture de production.

Les dix anciennes tables ont été vérifiées vides après retrait. Les deux nouvelles tables sont également vides après suppression de la fixture de qualification. Le rapport conserve les nombres confirmés par appels, dont **299 664 entrées restantes** de `catalogPostings` supprimées par remplacement explicite de cette seule table par `[]`, puis les cinq autres tables restantes de la même manière. Les tableaux et fonctions temporaires de nettoyage ont ensuite été retirés du code.

Deux réponses MCP perdues ont conduit à vérifier l’état et continuer avec la CLI. Les compteurs d’appels ne sont donc pas présentés comme un inventaire exhaustif avant suppression ; la preuve finale est le contrôle du vide. L’audit de 21 pages récentes des fonctions planifiées n’a trouvé aucun ancien job en attente à annuler ; il n’est pas exhaustif de l’historique système. Les anciennes opérations étaient inactives à l’inventaire, leurs points d’entrée et crons ont été retirés. L’historique système Convex partagé n’a pas été purgé.

## Export CSV Shopify — 21 octobre 2026

- **576 tests réussis, 74 fichiers**, dont 15 nouveaux cas CSV : les 61 en-têtes du modèle fourni, variantes/images supplémentaires, lecture indépendante avec ExcelJS, HTML/accents/guillemets/retours à la ligne, codes-barres, grammes entiers, exclusions, ownership, authentification, confirmation partielle, version/génération, pagination, annulation et découpage par octets UTF-8 sans séparer un produit.
- `npm run typecheck`, `npx tsc --noEmit -p convex/tsconfig.json`, `npm run check:convex-contract` et `npm run build` réussis. `npm run lint` : zéro erreur, 67 avertissements préexistants hors des fichiers modifiés. Le build conserve son avertissement sur la taille de certains chunks.
- `npx convex dev --once` : fonctions prêtes sur **dev curious-greyhound-437**. Aucune migration de schéma ni écriture en production.
- Navigateur isolé avec les vrais composants : confirmation d’export partiel, génération de trois produits et une fiche ignorée, lien de téléchargement CSV effectif. Le fichier téléchargé a été relu avec Python `csv` : 61 colonnes, trois produits, handles présents, statut `draft`, 2 604 octets. Après reprise simulée de la fiche en échec, un nouvel export complet donne quatre produits et zéro fiche ignorée sans confirmation partielle. Aucun message console de niveau erreur observé.

Cette preuve navigateur utilise le client Convex en mémoire du banc UI. Elle ne constitue pas un parcours authentifié sur le déploiement réel ni une validation de l’importeur Shopify ; aucun import Shopify réel n’a été lancé. Le découpage volumineux et les changements concurrents sont qualifiés par tests, pas par une exportation réseau de plusieurs milliers de produits.

## Choix des éléments Shopify — 21 octobre 2026

- **586 tests réussis, 74 fichiers**. Dix nouveaux cas couvrent les sept combinaisons non vides, la sélection vide refusée, l’ownership, la persistance du choix lors d’une soumission incertaine/reprise et l’arrêt sans création quand un menu demandé sans collections ne trouve pas sa destination. La préparation peut ensuite être relancée avec Collections cochées. Un import successif à la même version revérifie les appartenances sans recréer les produits. Les tests utilisent des permissions adaptées à chaque combinaison et vérifient l’absence d’appels aux mutations non sélectionnées. Les anciens tests sans `selection` conservent l’import complet.
- `npm run typecheck`, `npx tsc --noEmit -p convex/tsconfig.json`, `npm run check:convex-contract` et `npm run build` réussis. Lint : zéro erreur, 67 avertissements existants hors des fichiers modifiés ; avertissement de taille des chunks conservé.
- Banc navigateur isolé : trois cases accessibles cochées par défaut, choix Produits seul, résumé mis à jour, sélection vide bloquée, confirmation vers la boutique fictive et bilan sans annonce de collections/menu. Aucun message console de niveau erreur observé. Le banc utilise un client Convex en mémoire et n’exécute aucun import Shopify réel.
- `npx convex dev --once` réussi sur **dev curious-greyhound-437**, y compris le contrôle des imports successifs. Aucune migration de schéma ni modification de production.

Ces contrôles ne constituent pas un import réel ou un E2E authentifié. Les protections de réconciliation des soumissions incertaines restent actives.

## Limites restant à qualifier

Évolution du 16 octobre 2026 : le lecteur de navigation est partagé avec le module SEO via un mode optionnel de `extractMenu`. Le mode catalogue garde sa garde Shopify et sa projection de collections. Les tests ciblés de navigation, observations SEO et catalogue passent (36 cas), notamment les sous-menus Shopware imbriqués et les doublons desktop/mobile. Le HTML public Small Foot fourni pour le test SEO permet de vérifier 157 nœuds hiérarchiques. Cette preuve d’extraction ne constitue pas une nouvelle collecte catalogue, un import Shopify ou un E2E catalogue authentifié ; les limites ci-dessous restent applicables.

- Pas de nouvelle collecte exhaustive des 964 fiches/115 collections du pilote : les mesures du 29 septembre restent des vérifications préalables, pas des résultats de ce moteur.
- Pas de mesure de performance réseau en grand volume. Deux tables remplacent les anciens index de suffixes ; les filtres exacts parcourent des pages bornées, ce qui peut multiplier les lectures pour une recherche rare.
- Pas de rendu JavaScript distant des thèmes ou de contournement de challenges. Les pages non interprétables sont signalées.
- Pas d’import Shopify réel : ses permissions, médias et limites effectives restent à qualifier lors d’une opération précisément autorisée.
- Production `youthful-bandicoot-479` conservée. Sa transition nécessitera une décision et une autorisation distinctes.
