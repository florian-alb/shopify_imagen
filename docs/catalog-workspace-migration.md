# Transition de l’ancien import de catalogue

Décision du 1er octobre 2026 : après les propositions de conservation et de dump, l’utilisateur a demandé **« supprime tout »**. Le périmètre appliqué est l’ancien module catalogue et ses données **dev curious-greyhound-437**. Cette décision ne vaut pas autorisation de suppression en production, des objets Shopify, des boutiques/authentifications ou des autres features. Aucun dump n’a été créé, conformément au refus exprimé.

## Procédure appliquée

1. Inspection du diff avant modification ; travaux partagés et preuves historiques conservés. Retrait du moteur catalogue et de ses anciens scripts ; réutilisation uniquement des utilitaires d’extraction/réseau pertinents et des composants partagés.
2. Vérification des fichiers d’environnement, URL et absence de clé prioritaire. Premier déploiement additif des tables `catalogues` et `produits`, avec définitions temporaires des anciennes tables.
3. Inventaire des anciennes opérations dev, toutes terminales/inactives. Lecture des seules références R2 des opérations et espaces de production pour protéger les racines partagées. Aucun chevauchement observé.
4. Suppression paginée des objets R2 strictement sous les racines des opérations dev inventoriées. Suppression par lots, puis remplacement explicitement limité aux tables restantes par un tableau JSON vide. Aucun `--replace-all`. Les outils temporaires refusent toute URL de déploiement différente de `https://curious-greyhound-437.convex.cloud` et toute racine protégée.
5. Vérification du vide, puis retrait du schéma et des fonctions temporaires de nettoyage. Le rapport de qualification conserve les comptes réellement supprimés, sans dump de contenu.

Les anciennes opérations ne sont pas converties, rejouées ou affichées dans le nouvel historique. Un ancien lien présente un retour vers la liste. Les objets Shopify issus des anciens imports ne sont pas supprimés : leur identité stable reste compatible avec le nouveau moteur.

## Reprise des nouveaux catalogues

La demande « reprendre là où ça a fail » remplace « Tout recommencer ». Une relance conserve les réussites, corrections et JSON intacts. Une soumission Shopify incertaine reste verrouillée jusqu’à réconciliation. Une opération partielle peut être exportée après acceptation, tout en conservant le point de reprise de sa collecte.

Ajout du 21 octobre 2026 : l’export CSV Shopify ne nécessite aucune migration de données ni modification du stockage R2. Il lit les deux tables courantes par pages authentifiées, refuse tout travail actif ou bloqué et vérifie version/génération entre les pages. L’export JSON reste le chemin de sauvegarde complet, y compris pour les erreurs et les informations absentes ; le CSV contient seulement les fiches complètes non exclues.

Le choix des éléments à envoyer vers Shopify est également additif : `selection` reste optionnel dans les arguments et le travail JSON ; son absence signifie Produits + Collections + Menu. Aucun backfill ni changement de schéma n’est nécessaire. Les anciens travaux incertains restent verrouillés et reprennent avec leur sélection initiale.

## Production et retour arrière

Les exclusions de collection du 25 octobre 2026 ajoutent uniquement le booléen optionnel `Collection.ignored` au JSON de structure et aux éléments de `saveTags.values`. Aucune table, migration ni réécriture des produits n’est requise ; les catalogues existants gardent toutes leurs collections actives. Le JSON final distingue désormais les appartenances effectives (`collections`) des appartenances de découverte (`sourceCollections`). Un rollback vers une version qui ignore ce booléen réactiverait les collections lors des lectures/imports : revoir les exclusions avant ce rollback. La fonctionnalité n’efface aucun objet Shopify déjà importé.

Ajout du 25 octobre 2026 : les tags multiples utilisent les champs JSON existants `Collection.tag` et `appliedTag`, sous forme de valeurs séparées par des virgules. Aucun backfill ni changement de schéma/API n’est requis ; les anciens tags simples et leurs identités Shopify restent compatibles. Un retour au code antérieur après enregistrement de listes multiples les interpréterait comme un seul tag : réexaminer ces listes et les règles des collections cibles avant ce rollback, avec l’autorisation correspondant aux éventuelles écritures Shopify. Aucun import Shopify réel n’a été effectué pour qualifier cette évolution.

La production n’a pas reçu cette refonte ni ce nettoyage. Toute transition future exige un nouvel inventaire, une décision explicite sur ses données et un déploiement adapté ; **ne pas pousser aveuglément ce retrait de schéma en production**. L’autorisation dev de cette session n’est pas réutilisable pour la production.

La suppression dev demandée est irréversible via l’application et aucun dump n’a été conservé. Un retour au code historique ne rétablit pas ces données. Le code et la documentation du moteur remplacé restent dans Git et les [instructions historiques](catalog-workspace-migration-historique.md) ; leurs scripts ne sont plus présents dans la refonte.

Les rapports historiques de performance ont été conservés mais ne qualifient pas le nouveau modèle. Voir [qualification de la refonte](catalog-refonte-qualification.md).
