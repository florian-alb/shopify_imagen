# Archivage et suppression des jobs de génération

La page `/jobs` affiche par défaut les jobs non archivés. La vue **Archivés** est conservée dans l'URL (`archived=true`) et peut être combinée avec les filtres et la pagination existants. Les menus de la liste et du détail permettent d'archiver, de restaurer et de supprimer un job de l'historique.

## Comportement

- L'archivage est réversible. Il ne modifie pas les images, les compteurs, les dépenses ni l'exécution du job. Une génération archivée continue en arrière-plan ; l'interface le signale.
- La suppression de l'historique demande une confirmation. Elle est définitive dans l'interface : le job disparaît des deux vues et son détail public renvoie `null`. Les images restent disponibles sur les produits, les médias Shopify ne sont pas supprimés et les dépenses restent comptabilisées.
- La suppression conserve le document interne qui porte la propriété des images, les coûts et les reçus fournisseur. Elle ne purge pas les images, les références R2 ni les données d'audit. Les opérations existantes de review, publication et relance d'image gardent leurs références. La relance du bulk supprimé et son redémarrage par un ancien worker sont refusés.
- Un job en file ou en cours doit être terminé ou annulé avant suppression. Les images actives, segments actifs, annulations non confirmées, soumissions incertaines et statuts fournisseur inconnus bloquent aussi la suppression. L'archivage reste disponible pour retrouver le job et poursuivre son rapprochement.

## Backend et compatibilité

`jobs:setArchived` et `jobs:remove` exigent un utilisateur approuvé et vérifient le périmètre de la boutique active avant toute modification, y compris lors d'un second appel de suppression. Les jobs internes masqués de relance ne peuvent pas être archivés ou supprimés par ces API.

Les champs optionnels `archivedAt`, `archivedByUserId`, `deletedAt` et `deletedByUserId` conservent la compatibilité avec les anciens jobs, Gemini et les parcours synchrones. Aucun backfill n'est requis. Les compteurs et coûts existants restent conservés ; `isHidden` garde son usage pour les jobs techniques de relance.

La suppression vérifie les images via trois sondes indexées sur `by_job_and_status`, sans charger les prompts de toutes les images. Les segments sont lus via `by_job`, avec un maximum de 1001 lignes ; au-delà de 1000 segments, seule l'archive est proposée par le backend. La liste conserve le parcours indexé par boutique introduit pour corriger le dépassement de 16 MiB. La pagination par offset garde ses limites sur les historiques très profonds.

## Vérifications du 7 octobre 2026

- 423 tests réussis dans 61 fichiers. `convex/tests/jobs/history.test.ts` couvre notamment neuf segments et 900 images sous un budget de lecture de 64 KiB, les doublons d'appel, l'authentification, l'isolation entre boutiques, les jobs actifs, les reçus perdus, les annulations et la conservation des images et des dépenses.
- `npm run typecheck`, `npx tsc --noEmit -p convex/tsconfig.json`, `npm run build`, `npm run check:convex-contract` (105 références) et `npm run lint` réussis. Le lint conserve ses 64 avertissements existants ; le build conserve l'avertissement de taille des chunks.
- Le harness `scripts/job_history_ui_check.tsx` utilise les véritables composants de menu et de confirmation avec des données fictives, sans client Convex. Chrome headless a vérifié à 1440 px et 390 px l'archivage, la restauration, le blocage de suppression d'un job en cours, l'annulation puis la confirmation de suppression. Aucune erreur JavaScript ni débordement horizontal ; les requêtes externes étaient bloquées.
- `npx convex dev --once` a confirmé la version finale des fonctions prête sur `curious-greyhound-437` en développement. Le contrôle préalable en lecture seule a confirmé zéro génération active et aucune génération programmée ; aucune suppression ni archive n'a été exécutée sur des jobs réels pour cette validation.

Ces contrôles ne constituent pas un parcours authentifié sur l'application de production. Aucune génération payante ni modification de production n'a été effectuée.
