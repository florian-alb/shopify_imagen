# Qualification de la refonte catalogue

## Marchés et langues du sitemap — 29 octobre 2026

- Lecture publique réelle du sitemap `https://revedeveilleuse.com/sitemap.xml` : sept préfixes (`principal`, `en-gb`, `de-de`, `it-it`, `nl-nl`, `es-es`, `pl-pl`). Le sitemap produits allemand conserve ses handles traduits, par exemple `/de-de/products/birnen-nachtlicht`. Aucune collecte complète de cette boutique n’est revendiquée.
- Détection authentifiée des segments du même domaine, sélection de tous les marchés/langues ou d’un marché/langue, puis création atomique d’un catalogue par combinaison. Top N appliqué par catalogue ; URL localisées conservées, confinement des sitemaps, menus, appartenances, classements et pagination. Les catalogues historiques restent intacts et portent la mention « Marchés et langues non segmentés ». Aucun backfill, identité Shopify conservée.
- **752 tests réussis, 94 fichiers**, avec `npm test -- --maxWorkers=2`. Nouveaux cas : sept segments, multilinguisme d’un marché, langue partagée entre marchés, préfixes invalides/domaine étranger, normalisation, menu localisé et exclusion ; parcours simulé de deux catalogues partageant les identités Shopify jusqu’à leur Top N, collecte et export JSON distincts ; authentification, ownership et sélection vide/doublonnée. Le premier passage global lancé en parallèle du build a rencontré un timeout de 5 s dans `jobImagePublishing` ; les 14 tests du fichier passent seuls, puis la suite complète passe avec deux workers. Aucun changement de ce module.
- `npm run typecheck`, `npx tsc --noEmit -p convex/tsconfig.json`, `npm run check:convex-contract` (**116 références**) et `npm run lint` réussis ; lint : zéro erreur, 66 avertissements préexistants hors périmètre. Build réussi avec l’avertissement existant de taille de chunks.
- Banc navigateur avec vrais composants et client Convex en mémoire : principal, Tous les marchés/Toutes les langues, Canada multilingue, Canada français, même langue sur deux marchés, création simple et multiple et libellé de l’historique contrôlés. Mobile : viewport et document de **375 px**, sans débordement horizontal. Console sans warning/error lors du contrôle. [Capture ordinateur](../output/catalogue-marches.png), [capture mobile](../output/catalogue-marches-mobile.png). Ce banc ne constitue pas un E2E authentifié ; la fixture contient cinq segments synthétiques, dont le Canada, qui ne proviennent pas de la boutique réelle.
- `npx convex dev --once --typecheck enable` accepté sur **dev `curious-greyhound-437`**. Aucune écriture sur la production, aucun import Shopify réel ; le déploiement frontend/backend en production reste une opération distincte à autoriser.

## Export/import avec compléments HTML manquants — 26 octobre 2026

- La collecte HTML incomplète ne rend plus un produit inéligible au CSV ou à Shopify lorsque ses données JSON validées contiennent une identité source et des variantes. La description JSON est conservée et les compléments HTML restent facultatifs. La règle partagée s’applique aussi aux anciennes lignes `failed`/`pending`, sans migration ni recollecte. Les exclusions, alias, garde-fous Shopify et snapshots restent actifs. Le bilan Shopify compte ces importations et conserve le diagnostic de collecte sur la fiche.
- Avant correction, **six échecs ciblés** reproduisent le blocage dans le CSV, la requête d’export et le worker Shopify. Après correction : **709 tests réussis, 88 fichiers**, avec `npm test -- --maxWorkers=2`. La première suite complète lancée avec les autres validations a échoué sur trois cas de génération/publication d’images (deux timeouts de 5 s et un comptage d’appels après timeout) ; ces cas passent lors de la relance avec concurrence réduite. Réseau, IA, R2 et Shopify simulés.
- `npm run typecheck`, `npx tsc --noEmit -p convex/tsconfig.json`, `npm run check:convex-contract` (**112 références**), `npm run build`, `npm run lint` et `git diff --check` réussis. Lint : zéro erreur, 67 avertissements existants hors du périmètre. Le build conserve son avertissement de taille de chunks.
- Banc navigateur avec vrais composants et client Convex en mémoire : « Importable · compléments manquants » dans la liste, erreur HTML et explication non bloquante dans la fiche, confirmations CSV/Shopify cohérentes. Le CSV téléchargé puis relu avec Python contient **61 colonnes et quatre produits en brouillon**, dont le produit au HTML en échec avec sa description JSON ; zéro fiche ignorée. Aucun warning/error console observé. [Capture simulée](../output/catalogue-json-importable.png).
- Backend accepté par `npx convex dev --once --typecheck enable` sur **dev `curious-greyhound-437`**. Aucune modification de production, aucun import Shopify réel et aucun E2E authentifié revendiqué. Le frontend reste à déployer avec le backend en production, après autorisation de cette opération.

## Enregistrement des tags après changement de révision — 26 octobre 2026

- Production examinée en lecture seule : la requête `4d559ebafdb3e65d` échoue dans `catalogues:saveTags` avec « Le catalogue a changé. Rechargez les tags. ». Cinq refus de ce type sont présents dans la fenêtre de journaux consultée. Les arguments ne sont pas journalisés : aucun catalogue précis n’est attribué à ces cinq requêtes. Le frontend conservait la révision du début d’édition même après de nouvelles propositions automatiques. L’exception `Error` ne transportait pas de message applicatif vers le client de production.
- Le brouillon conserve désormais une base par champ, fusionne les saisies avec les données courantes et envoie la révision courante. Les propositions automatiques non validées ne font plus perdre les saisies ; une édition enregistrée/validée concurrente sur le même champ est refusée. Les champs et collections non modifiés gardent leurs données courantes. `ConvexError` et `errorMessage` rendent les conflits, verrous et validations de tags lisibles. La vérification transactionnelle de révision reste active ; aucune migration ni modification de schéma.
- Régression du message reproduite avant correction : le test attend un payload applicatif `data`, absent de l’exception initiale. Après correction : **702 tests réussis, 88 fichiers**, dont huit cas de fusion/conflit du brouillon et deux cas Convex supplémentaires (payload de conflit sans écriture ; brouillon commencé avant les propositions puis enregistré avec la révision courante). Réseau, IA, R2 et Shopify simulés.
- Typage app/Convex, contrat de **112 références frontend**, ESLint ciblé, build et `git diff --check` réussis. Le build garde son avertissement de taille de chunks.
- Banc navigateur `?scenario=tag-refresh` avec les vrais composants et un client Convex en mémoire : modification `bird` → `chouettes`, arrivée de propositions `oiseaux` / `peluches` / `nouveautés`, enregistrement réussi avec `chouettes` conservé et les autres propositions à jour. Une modification concurrente enregistrée `rapaces` pendant une saisie `hiboux` est refusée par « Les tags de « Vögel » ont été modifiés ailleurs. » ; `hiboux` reste dans le brouillon. Aucun warning/error console pendant l’enregistrement réussi. [Capture](../output/catalogue-tags-revision-saved.png). Ce banc n’est pas un E2E authentifié.
- Aucun déploiement frontend/Convex, aucune écriture de production ni import Shopify réel. Les modifications Google Feed indépendantes du workspace sont conservées.

## 503 source et reprise visible — 26 octobre 2026

- Diagnostic en lecture seule sur **prod `youthful-bandicoot-479`**, catalogue `q97bbave4ynjykg561zmr50k3h8h1jaf` (`le-mocassin-chic.com`, Top 130). Les warnings `catalogue.worker.retry` montrent un HTTP 503 sur `sitemap_products_1.xml?from=10393332154714&to=10769889591642`, avec une reprise différée d’environ 150 secondes. Premier état lu : `sourceCount=499`, `total=0`, `phase=sitemap`, `offset=500`, tentative 1, aucun bail. Le compteur de fiches complètes masquait donc la progression de découverte. Sans écriture opérateur, une seconde lecture confirme `sourceCount=595`, `total=130`, `phase=members`, index de collection 5 ; les 503 restent intermittents. Les lectures publiques locales du sitemap racine et du sitemap produits avec les en-têtes du collecteur réussissent en HTTP 200 ; cela ne prouve pas leur disponibilité depuis l’infrastructure Convex. L’origine exacte des limitations côté source n’est pas établie. Le sitemap est encore relu pour chaque lot borné de découverte ; aucune optimisation de ce chemin n’est revendiquée.
- `CatalogWorkStatus.tsx` distingue produits repérés, attente automatique, tentative active et blocage ; il affiche l’heure de reprise et propose « Relancer » pendant une attente en échec sans bail actif. `catalogues.retry` conserve le checkpoint, `retryAt`, `sourceDelay` et les données, incrémente la génération et refuse les travaux sains ou sous bail actif. Les erreurs HTTP du lecteur incluent désormais l’URL. Aucun changement de schéma ni migration.
- **692 tests réussis, 87 fichiers** ; les **75 tests ciblés** du catalogue, du réseau et de l’import Shopify passent. Nouveaux cas : 503 pendant la découverte, conservation des liens déjà lus, délai Retry-After de 150 s, authentification/ownership, ancienne génération sans requête réseau, bail actif refusé et worker périmé empêché d’écrire, arrêt après trois essais pour 503 / immédiatement pour 403 et délai conservé après blocage. Réseau, IA, R2 et Shopify sont simulés.
- `npm run typecheck`, `npx tsc --noEmit -p convex/tsconfig.json`, `npm run check:convex-contract` (**112 références**), `npm run build`, ESLint ciblé et `git diff --check` réussis. Lint global : zéro erreur, avertissements existants hors du périmètre après retrait de l’import inutilisé dans le test. Le build conserve son avertissement de taille de chunks.
- Banc navigateur avec les vrais composants et un client Convex en mémoire : 499 produits repérés malgré une liste encore vide, heure de reprise et bouton visibles ; clic sur Relancer conservant avancement/heure et effaçant l’erreur ; travail actif sans bouton ; état bloqué avec bouton. Aucun warning/error console observé. Captures : [attente et bouton](../output/catalogue-source-waiting.png), [après relance](../output/catalogue-source-relaunched.png). Ces contrôles ne constituent pas un E2E authentifié.
- Aucun déploiement frontend/Convex, aucune écriture de production, aucune relance du catalogue réel et aucun import Shopify pendant cette intervention. Le workspace contient des changements Google Feed indépendants ; ils n’ont pas été modifiés ni déployés avec cette correction.

## Confirmations d’import et d’export épurées — 25 octobre 2026

- Import : boutique, éléments sélectionnables et accord partiel conservés. Volume des collections actives et nombre de fiches incomplètes affichés ; brouillon des nouveaux produits et menu non affecté au thème indiqués uniquement quand cochés, avec descriptions accessibles. JSON : compteur de fiches complètes, inclusion des données incomplètes/erreurs, avertissements source et collections non vérifiées conservés. CSV : périmètre, omissions et limites utiles ; bouton « Générer le CSV » sans formule d’acceptation longue.
- `npm test -- app/features/catalog-import/lib/csv-export.test.ts convex/catalogue/catalogue.test.ts` : **43 tests réussis, 2 fichiers**. `npm run typecheck`, ESLint ciblé sur les trois composants, `npm run check:convex-contract` (**114 références**), `npm run build` et `git diff --check` réussis. Avertissement de taille de bundle inchangé.
- Banc UI en mémoire : destination choisie mais import bloqué sans accord partiel, activation après accord, refus d’une sélection vide, descriptions liées aux choix, absence d’accord partiel sur catalogue complet. Export JSON partiel simulé jusqu’au bouton de téléchargement ; CSV partiel généré avec 3 produits / 1 fiche ignorée, puis CSV complet généré automatiquement avec 4 produits / 0 ignorée. Aucun import Shopify réel ni export R2 réel.
- Les trois confirmations sont contrôlées sur ordinateur et mobile (page et viewport de 390 px, fenêtres et boutons visibles). Captures : `output/catalogue-confirmation-{import,json,csv}.png` et variantes `-mobile.png`. Ces données simulées ne constituent pas un E2E authentifié.

## Collection vide Montessori et diagnostic du worker — 25 octobre 2026

- Incident identifié en lecture seule sur **prod `youthful-bandicoot-479`** : catalogue `q9793dr89ygmxzyfawghdrsma58gzen7`, 167 produits recensés, phase `members` bloquée après trois tentatives sur la 30e collection, `montessori-toys-by-category`. Les 29 collections précédentes sont complètes. La page publique exacte avec `?sort_by=best-selling`, inspectée dans le navigateur, indique « This collection is empty » et ne contient aucun lien produit dans `main` ; cette formulation manquait au lecteur.
- Fixture HTML réduite issue de cette page : collection vide conservée sans grille et liens du header exclus. Les gardes continuent de refuser une page sans indication de vide ou un message de panier vide. Les erreurs d’extraction incluent désormais l’URL. Le worker émet les erreurs interceptées en warning pendant les retries puis en error lors du blocage, avec leur contexte ; l’exécution Convex demeure réussie puisque l’erreur métier est persistée, donc le filtre des seules exécutions échouées ne suffit pas.
- Régression reproduite avant correction : **4 échecs, 48 réussites** sur les deux fichiers ciblés. Après correction : **52 tests réussis** ; découverte, collection vide et export JSON avec réseau/R2 simulés ; reprise par la mutation authentifiée simulée depuis le dernier point bloqué, nouvelle génération et absence de relecture des collections précédentes. Suite complète : **664 tests réussis, 83 fichiers**. Typages app/Convex, ESLint ciblé, build et `git diff --check` réussis ; avertissement habituel de taille de bundle au build.
- `npx convex dev --once --typecheck enable` : fonctions acceptées sur **dev `curious-greyhound-437`** à 22:23 heure de Paris. Aucun changement de schéma ou de contrat frontend/backend.
- Aucun déploiement ni reprise de catalogue en production effectués dans cette qualification, aucun import Shopify réel et aucun E2E authentifié. La lecture de l’état de production et la visite du site source ne prouvent pas un export réel après correctif.

## Épuration des vues Produits, Collections et Menu — 25 octobre 2026

- En-tête commun sans réglage de langue ni gestion des tags en double. Exports et import conservés. Bilan d’import repliable, compteurs de réussite/échec visibles ; détails de création, existants, fiches non importées, collections et menu conservés. Relances de fiches limitées à Produits, erreurs globales et avancement toujours visibles.
- Tableaux sans panneau décoratif, compteur de pagination raccourci et textes redondants retirés de l’inspecteur. Collections : états courts et accès « Tags et exclusions » dans la barre de filtres. Menu : arborescence sans cartes, collections actives hors menu dans une section dépliable. Les composants Collections, Menu et bilan sont extraits du composant principal ; aucun changement du backend.
- `npm test -- app/features/catalog-import/lib convex/catalogue/catalogue.test.ts` : **46 tests réussis, 3 fichiers**. `npm run typecheck`, ESLint ciblé, `npm run check:convex-contract` (**114 références**), `npm run build` et `git diff --check` : réussis. Le build conserve son avertissement de taille de bundle.
- Banc UI en mémoire : ouverture/fermeture du bilan, accès à la fiche en échec et à son erreur, filtre des collections vides, confirmation d’ajout de produits, accès à l’éditeur de tags, exclusion enregistrée puis affichée dans Collections et absente des collections hors menu, navigation du menu vers les deux produits attendus, fenêtre de préparation d’import avec sélection et accord partiel vérifiés.
- Les trois vues sont contrôlées sur ordinateur et mobile. Aucun débordement horizontal de la page (largeurs mesurées de 375/375 px ou 390/390 px) ; le tableau des collections garde son propre défilement. Captures : `output/catalogue-{produits,collections,menu}-epure.png` et variantes `-mobile.png`. Données simulées uniquement : aucun import Shopify réel ni E2E authentifié.

## Décomposition des tags IA — 25 octobre 2026

- La génération propose le type de produit, les qualificatifs puis le genre uniquement s’il est explicite, en tags séparés et normalisés dans la langue choisie. Les concepts composés restent entiers ; les collections partagent le même vocabulaire et une sélection éditoriale peut conserver un seul tag. La réponse structurée du fournisseur est adaptée au contrat public existant `{ key, tag }` (liste séparée par virgules), sans migration ni modification du résolveur effectif ou des règles Shopify.
- **659 tests réussis, 83 fichiers**, dont 21 nouveaux cas de génération : adaptation des tableaux, concepts composés, NFC/casse/espaces/déduplication, termes partagés, limites par tag, clés absentes/inconnues/répétées, listes invalides et réponse interrompue. `npm run typecheck`, `npx tsc --noEmit -p convex/tsconfig.json`, `npm run check:convex-contract` (**114 références**), ESLint ciblé, `npm run build` et `git diff --check` réussis. Le build conserve l’avertissement existant sur la taille de certains chunks.
- Essai direct de **Gemini réel**, depuis le code local sur dix intitulés synthétiques : `Mocassins noirs femme` → `mocassins, noir, femme` ; `Tables basses rondes` → `table basse, rond` ; `Sacs à main bleu marine` → `sac à main, bleu marine` ; `Robes longues` → `robe, long`, sans genre ajouté ; `Nouveautés` → `nouveautés`. Les autres cas couvrent beige, daim, été et style italien. Cette vérification porte sur cet échantillon français, sans garantir toutes les langues ni tous les catalogues.
- `npx convex dev --once --typecheck enable` : fonctions prêtes sur **dev `curious-greyhound-437`**. Banc UI en mémoire : saisie puis enregistrement d’une liste à deux tags et affichage dans deux badges distincts contrôlés ([capture](../output/catalogue-tags-generation-ia.png)). Ce contrôle d’interface n’appelle pas Gemini et ne constitue pas un parcours authentifié de génération ; aucun catalogue existant régénéré, déploiement de production ou import Shopify réel.

## Épuration de l’éditeur de tags — 25 octobre 2026

- Suppression des trois paragraphes de mode d’emploi et du parcours décoratif. Titre, retour aux collections, langue et reproposition regroupés dans l’en-tête. Les bilans et commandes d’export/import sont masqués pendant l’édition ; erreurs et travaux actifs restent visibles. Les boutons d’enregistrement sont conservés.
- Les commandes groupées apparaissent après sélection. Banc UI en mémoire : sélection, exclusion/réactivation groupée, restauration des tags et disparition des commandes après désélection vérifiées. Rendu contrôlé sur ordinateur et mobile ; largeur de page et de viewport égales à 375 px sur mobile, avec défilement horizontal limité au tableau.
- `npm run typecheck`, ESLint ciblé sur les trois composants, les cinq tests de `collection-tag-input.test.ts`, `npm run build` et `git diff --check` : réussis. Le build conserve son avertissement de taille de bundle. Captures : `output/catalogue-tags-epure.png` et `output/catalogue-tags-epure-mobile.png`.
- Aucune modification backend ni import Shopify réel ; ce contrôle visuel ne constitue pas un E2E authentifié.

## Retrait des statuts sous les badges — 25 octobre 2026

- Les libellés « Validé » et « À valider » sont retirés de l’éditeur ; seules les erreurs s’affichent sous les badges, avec une description accessible reliée à la saisie.
- `npm run typecheck`, ESLint ciblé sur les deux composants, les cinq tests de `collection-tag-input.test.ts`, `npm run build` et `git diff --check` : réussis.
- Banc UI isolé : absence des statuts sur les trois lignes, erreur visible et application bloquée après suppression du dernier tag, puis restauration par annulation vérifiées. Capture : `output/catalogue-tags-sans-statut.png`. Aucun E2E authentifié pour ce changement d’affichage.

## Saisie dans les badges sur une ligne — 25 octobre 2026

- Correction de la première présentation : suppression du champ permanent sous les badges. La ligne contient maintenant les badges Secondary et le bouton + ; la saisie apparaît dans le badge ajouté ou à la place du texte du badge édité.
- Banc UI isolé : clic sur un tag avec focus/sélection de son texte dans le badge, remplacement de `bird` par `mocassins` confirmé uniquement par un clic ailleurs, clic sur + avec focus automatique dans le nouveau badge, saisie de `femme` confirmée à la perte du focus. Les deux badges et + restent sur une seule ligne.
- Collage de `cuir, été`, retour du focus sur +, suppression avec × et enregistrement via le bouton existant contrôlés. Capture : `output/catalogue-tags-ligne.png`.
- `npm test` : **638 tests réussis, 82 fichiers** ; `npm run typecheck`, ESLint ciblé, `npm run check:convex-contract` (**114 références**), `npm run build` et `git diff --check` réussis. Aucune modification du backend ni import Shopify réel ; le banc UI reste un client en mémoire, sans E2E authentifié.

## Édition par badges — 25 octobre 2026

- `npm test` : **638 tests réussis, 82 fichiers** lors du passage final. Cinq nouveaux tests couvrent l’ajout de tags contenant des espaces, Unicode NFC, le remplacement d’un seul tag sans altérer ses voisins, le collage de listes séparées par virgules/retours à la ligne, la suppression du dernier tag et la conservation des valeurs invalides/doublons/dépassements pour la validation existante.
- Le premier passage global lancé en même temps que le build a rencontré quatre échecs dans les tests Shopify `jobImagePublishing` et `variantPublication`, dont deux timeouts. Ces deux fichiers ont ensuite passé seuls (**27 tests**) puis la suite complète a passé sans build simultané. Aucun de ces tests ni leur code de publication n’a été modifié pour cette évolution.
- `npm run typecheck`, ESLint ciblé, `npm run check:convex-contract` (**114 références**) et `npm run build` : réussis. Aucun changement de contrat, de schéma ou de backend pour les badges.
- Banc UI isolé : édition au clic, confirmation par Entrée, ajout par virgule, collage de `cuir, été` en deux badges, suppression par × et enregistrement direct d’un tag encore saisi sans Entrée vérifiés. La suppression du dernier tag bloque l’application ; un nouvel ajout, l’annulation et l’exclusion/réactivation des collections conservent le comportement attendu. Capture : `output/catalogue-tags-badges.png`.
- Les boutons d’enregistrement sont conservés. Les contrôles navigateur utilisent le client en mémoire : ils ne constituent pas un E2E authentifié ni un import Shopify réel.

## Collections ignorées — 25 octobre 2026

- `npm test` : **633 tests réussis, 81 fichiers**. Tests Convex avec utilisateurs simulés : exclusion/réactivation groupée, refus d’une réactivation sans tag valide, absence de proposition IA pour les collections ignorées, conservation des 4 produits du scénario même avec toutes les collections ignorées, absence de tags hérités et d’associations effectives, filtre Sans collection, maintien des tags manuels, snapshots JSON/CSV et conservation des appartenances source. Les exclusions sont protégées contre les autres propriétaires, les révisions concurrentes, les workers périmés et les verrous d’export/import.
- Worker Shopify simulé : imports complets, collections seules et menu seul avec toutes les collections ignorées ; aucun accès aux collections ni au menu, aucun tag issu des collections ignorées, produit sélectionné conservé et importé quand demandé. Tests du menu : parent ignoré conservé comme groupe avec enfant actif, feuilles ignorées et groupes devenus vides retirés.
- `npm run typecheck`, `npx tsc --noEmit -p convex/tsconfig.json`, `npm run check:convex-contract` (**114 références**), ESLint ciblé et `npm run build` : réussis.
- `npx convex dev --once` : fonctions prêtes sur **dev `curious-greyhound-437`**. Aucun déploiement de production.
- Banc UI isolé dans le navigateur : exclusion et réactivation individuelles/groupées, enregistrement, filtres avec compteurs, sélection remise à zéro au changement de filtre, restauration des tags et fiche conservée affichée Sans collection et sans tag vérifiés. Capture : `output/catalogue-collections-ignorees.png`.
- Aucun import Shopify réel ni E2E authentifié. L’exclusion ne prouve pas un nettoyage des anciennes collections Shopify : aucun objet existant n’est supprimé par cette fonctionnalité.

## Tags multiples — 25 octobre 2026

- `npm test` : **627 tests réussis, 81 fichiers**. Les tests couvrent la saisie séparée par virgules, Unicode NFC, limites de 60 tags / 100 caractères par tag, valeurs vides et doublons ; les mutations avec utilisateurs simulés acceptent les tags partagés, refusent les combinaisons identiques dans un autre ordre et conservent brouillons, overrides et verrous.
- Les mêmes tags effectifs sont vérifiés dans la liste, la fiche, le CSV et le JSON. Le worker Shopify simulé construit plusieurs règles ET et des tags produit distincts, conserve l’identité lors d’un changement d’ordre et détecte une appartenance manquante quand tous les tags sont présents. Un override ne contenant qu’un des tags n’exige pas cette appartenance.
- `npm run typecheck`, `npx tsc --noEmit -p convex/tsconfig.json`, `npm run check:convex-contract` (**114 références**), ESLint ciblé sur les fichiers modifiés et `npm run build` : réussis. La mutation `collectionCreate` est validée contre le schéma Admin GraphQL **2026-04** par l’outil Shopify.
- `npx convex dev --once` : fonctions prêtes sur **dev `curious-greyhound-437`**. Aucun déploiement de production ni import Shopify réel.
- Banc UI isolé : saisie de `mocassins, femme` et `mocassins, homme`, validation avec tag partagé, refus de `femme, mocassins` comme combinaison identique, enregistrement, affichage des deux listes et héritage dédupliqué sur une fiche contrôlés dans le navigateur. Ce client en mémoire ne constitue pas un E2E authentifié. Capture locale : `output/catalogue-tags-multiples.png`.

Les résultats ci-dessous décrivent les qualifications antérieures et leurs limites.

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
