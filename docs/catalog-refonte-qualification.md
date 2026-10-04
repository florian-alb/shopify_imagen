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

## Limites restant à qualifier

- Pas de nouvelle collecte exhaustive des 964 fiches/115 collections du pilote : les mesures du 29 septembre restent des vérifications préalables, pas des résultats de ce moteur.
- Pas de mesure de performance réseau en grand volume. Deux tables remplacent les anciens index de suffixes ; les filtres exacts parcourent des pages bornées, ce qui peut multiplier les lectures pour une recherche rare.
- Pas de rendu JavaScript distant des thèmes ou de contournement de challenges. Les pages non interprétables sont signalées.
- Pas d’import Shopify réel : ses permissions, médias et limites effectives restent à qualifier lors d’une opération précisément autorisée.
- Production `youthful-bandicoot-479` conservée. Sa transition nécessitera une décision et une autorisation distinctes.
