# Prompts conditionnels et génération par variante

Chaque type d’image peut activer « Prompt conditionnel ». Le texte existant reste la branche « Si la condition est vraie ». La branche « Sinon » est obligatoire. Une seule condition porte sur le nom du produit, le nom de la variante ou une option Shopify nommée ; les opérateurs sont « est renseigné », « contient » et « est égal à ». Les comparaisons ignorent casse et accents. Une valeur absente sélectionne toujours « Sinon ».

Les variables `{{VARIANT_TITLE}}`, `{{VARIANT_OPTIONS}}` et `{{OPTION_VALUE:Taille}}` utilisent le contexte de la variante choisie. Le nom après `OPTION_VALUE:` peut être celui de toute option ; ses valeurs conservent le texte Shopify original. Le rendu remplace les variables en une seule passe, sans réinterpréter les valeurs insérées. Le prompt maître et les paramètres IA/détourage s’appliquent aux deux branches.

## Planification

Les fenêtres individuelle et en lot présélectionnent « Première variante uniquement ». « Toutes les variantes » prépare une tâche par variante admissible et par type d’image sélectionné. L’ordre est celui du tableau Shopify synchronisé. Un choix explicite de groupes restreint les variantes admissibles.

Un produit déjà séparé utilise sa première variante, même s’il conserve plusieurs tailles. Depuis le produit mère, chaque groupe ayant un membre dans la famille reçoit une image par type. Les références confirmées du groupe sont prioritaires ; sans groupe, les médias associés à la variante précèdent les références du produit. Les contrôles existants de confirmation des groupes restent requis.

`jobs.preview` et `jobs.create` appellent le même préparateur (`convex/jobs/prepare.ts`) puis le même planificateur (`convex/jobs/planning.ts`). Le paramètre optionnel `variantSelection` accepte `first` ou `all`. Son omission conserve le nombre de tâches des anciens appels : une par produit ou groupe explicitement sélectionné.

## Historique, reprises et publication

Les nouveaux champs de prompt et d’image sont optionnels ; aucune migration des données historiques n’est requise. Chaque nouvelle image stocke sa cible, le titre du produit et de la variante, les options originales, la branche choisie et le prompt résolu. Les cartes affichent la variante et la branche.

Une régénération conserve le contexte enregistré et réévalue le template courant. Les images historiques sans contexte utilisent le produit/groupe actuel. Une reprise après erreur réutilise le prompt préparé et ne remplace les tâches concurrentes que pour la même cible et le même type d’image. Les fichiers générés incluent l’identité de l’image dans leur chemin R2, y compris en batch.

La publication normale associe l’image approuvée du prompt n° 1 à sa variante cible. Une association demandée exige exactement une image sélectionnée de ce prompt pour chaque cible. Les variantes supprimées et les groupes incohérents sont rejetés avant l’envoi de médias. Les familles déjà séparées conservent la publication par groupe vers leurs produits existants et l’association de l’image commune à leurs variantes. Les contrôles d’approbation, de boutique et de remplacement sont conservés.

## Validation du 4 octobre 2026

Les tests couvrent conditions, variables, options absentes, première/toutes, groupes sélectionnés, familles séparées avec tailles restantes, comptage en lot, snapshots de régénération, reprises et compatibilité historique. L’action de publication est exercée avec un client Shopify simulé pour vérifier les associations image/variante et les rejets avant envoi ; aucun appel Shopify réel n’est nécessaire.

Le parcours manuel authentifié sur `localhost:3000/settings/prompts` vérifie la conservation du texte à l’activation, les deux branches, les opérateurs et le blocage des champs obligatoires. Le brouillon de validation est annulé. La boutique active ne contenant aucun produit, les fenêtres de génération et la publication n’ont pas été exercées manuellement sur des produits réels. Cette limite ne constitue pas un contrôle complet de bout en bout avec fournisseur d’images ou Shopify.

Le backend est validé sur le développement `curious-greyhound-437`. Aucun déploiement de production ni import/publication Shopify réel ne fait partie de cette validation.

Résultats : `npm test` passe (49 fichiers, 296 tests), `npm run typecheck`, `npx tsc --noEmit -p convex/tsconfig.json`, `npm run check:convex-contract` (103 références frontend), `npm run lint` et `npm run build` passent. Le lint conserve 58 avertissements existants sans erreur ; le build signale toujours certains bundles dépassant 500 kB. `git diff --check` passe également.
