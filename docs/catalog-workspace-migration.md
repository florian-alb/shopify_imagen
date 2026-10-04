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

## Production et retour arrière

La production n’a pas reçu cette refonte ni ce nettoyage. Toute transition future exige un nouvel inventaire, une décision explicite sur ses données et un déploiement adapté ; **ne pas pousser aveuglément ce retrait de schéma en production**. L’autorisation dev de cette session n’est pas réutilisable pour la production.

La suppression dev demandée est irréversible via l’application et aucun dump n’a été conservé. Un retour au code historique ne rétablit pas ces données. Le code et la documentation du moteur remplacé restent dans Git et les [instructions historiques](catalog-workspace-migration-historique.md) ; leurs scripts ne sont plus présents dans la refonte.

Les rapports historiques de performance ont été conservés mais ne qualifient pas le nouveau modèle. Voir [qualification de la refonte](catalog-refonte-qualification.md).
