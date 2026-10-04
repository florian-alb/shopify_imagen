# Import de catalogue — refonte du 1er octobre 2026

Références : [cadrage](catalog-refonte-attendus.md), [interface et maquette V2](catalog-refonte-interface.md), [architecture courante](catalog-workspace-context.md), [transition](catalog-workspace-migration.md), [qualification](catalog-refonte-qualification.md).

## Parcours

1. Saisir une boutique publique HTTPS et choisir **Tout le catalogue** (défaut) ou **Top N meilleures ventes** (entier positif). Menu et collections sont recensés dans les deux modes. Le classement est global ; il ne représente pas des chiffres de ventes.
2. Contrôler les tags anglais proposés par l’IA. Corriger les champs vides, invalides ou identiques, puis **Valider et collecter**. Aucune proposition n’est validée automatiquement. Les corrections déjà saisies ne sont pas remplacées par une nouvelle proposition.
3. Examiner Produits, Collections et Menu. Une fiche complète nécessite le JSON intégral et une lecture HTML réussie. Les compléments propres au produit restent dans leur langue, sans réécriture SEO. Les collections vides et hors menu restent accessibles.
4. Corriger explicitement titre, tags ou exclusion d’une fiche. Les tags manuels remplacent ses tags hérités ; revenir aux valeurs source supprime ces corrections au prochain enregistrement. Les écritures vérifient la version lue à l’ouverture de l’édition.
5. Ajouter les produits manquants d’une collection si nécessaire. Le catalogue peut dépasser N ; les fiches réussies et les appartenances multiples sont conservées.
6. Générer le JSON, puis le télécharger par lien privé temporaire. Une édition rend le fichier obsolète. Un export partiel exige une acceptation explicite et conserve les états d’échec.
7. **Préparer l’import Shopify** présente la destination, les quantités connues et les effets. Seule la confirmation lance les écritures. Une acceptation supplémentaire est requise pour un catalogue incomplet. Les fiches incomplètes et exclues ne sont pas soumises.

## Shopify

Créations en brouillon ; produits existants retrouvés par identité source stable, avec ajout des tags requis sans remplacement des tags marchands ni changement de statut. Collections automatiques avec une règle par tag, y compris vides. Menu séparé par version du catalogue, sans affectation au thème ni publication. Les liens internes des nouvelles descriptions sont adaptés aux objets effectivement retrouvés ; les destinations source non résolues deviennent du texte sans lien.

Une soumission bulk incertaine conserve son identifiant avant de reprendre. Elle doit être réconciliée avant toute nouvelle création. Les résultats vérifient identité, statut des créations, variantes, images, tags et collections. Les échecs restent visibles par fiche et dans le bilan final.

## Reprise et limites

La décision utilisateur « reprendre là où ça a fail » remplace le redémarrage destructif du cadrage initial. **Reprendre l’étape en échec** conserve son avancement ; **Relancer les produits en échec** conserve toutes les réussites et le JSON déjà reçu. Aucun bouton de remise à zéro destructrice n’est ajouté.

Les pages de liste lisent au plus 50 fiches ou 2 Mo puis appliquent les filtres de sous-chaîne exacte et d’appartenance. Une tranche filtrée vide avec continuation est parcourue automatiquement jusqu’à un résultat ou la fin, avec un curseur distinct à chaque lecture. La recherche ne transforme pas les mots en requête plein texte et ne charge pas le catalogue entier. Ce compromis réduit le schéma à deux tables, mais les anciens benchmarks de l’index de suffixes ne s’y appliquent pas.

Les thèmes publics non couverts, challenges et limites de taille sont des erreurs explicites. Aucun JSON n’est tronqué silencieusement. Une collecte sans rubrique HTML reconnue demande de vérifier la source, sans affirmer l’absence de complément sur tout thème.

## Configuration

Clés serveur existantes : `GEMINI_API_KEY`, `CATALOG_CLASSIFIER_MODEL` facultatif, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CATALOG_R2_BUCKET` privé distinct de `R2_BUCKET`. Identifiants Shopify repris depuis les boutiques possédées par l’utilisateur. Aucun secret `VITE_` ajouté, aucun changement d’environnement distant effectué. Les anciennes variables `CATALOG_BROWSERLESS_URL`, `CATALOG_BROWSERLESS_TOKEN`, `CATALOG_IMPORT_BATCH_SIZE` et `CATALOG_COLLECT_CONCURRENCY` ne sont plus utilisées et ont été retirées du modèle `.env.example`.

L’ancien moteur et ses mesures restent consultables dans [l’archive](catalog-import-historique.md). Les anciennes données dev ont une transition explicite ; elles ne sont jamais importées implicitement dans les deux nouvelles tables.
