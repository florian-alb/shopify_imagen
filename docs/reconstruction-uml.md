# Schémas UML — documentation de reconstruction

**Ajout du 11 octobre 2026.** Cet index complète la [spécification fonctionnelle](specification-reconstruction.md), établie à partir du code local. Chaque lien de fonctionnalité ouvre le schéma dans son contexte ; chaque lien SVG ouvre une image autonome.

**80 schémas : 62 séquences, 9 diagrammes d’états, 9 diagrammes de classes.**

- **Séquence** : acteurs, commandes, lectures/écritures, branches et reprises.
- **États** : cycle de vie et transitions autorisées.
- **Classes** : données, relations ou dépendances de composants stéréotypés.

La portée est explicite : **75 schémas du fonctionnement actuel**, **1 de compatibilité historique**, **4 propositions de reconstruction**. Les diagrammes synthétisent les règles décrites dans le texte ; ils ne remplacent pas les validateurs complets de l’[annexe technique](reconstruction-annexe-technique.md) ni les réserves de qualification.

Les SVG sont rendus avec Mermaid 11.12.0 et ne nécessitent aucun script pour être consultés. La source Mermaid de chaque image est disponible sous « Source Mermaid modifiable » dans la spécification. Les anciens diagrammes de flux du chapitre architecture sont conservés et ne sont pas comptés parmi ces schémas UML.

## Index par module

- [3. Authentification, droits et boutiques](#uml-module-3)
- [4. Intégration Shopify et synchronisation](#uml-module-4)
- [5. Produits, visuels, prompts et traitements d'images](#uml-module-5)
- [6. Collecte, édition, export et import de catalogues](#uml-module-6)
- [7. Google Shopping, politiques et interface transversale](#uml-module-7)
- [8. Modèle de données, architecture et exploitation actuelles](#uml-module-8)
- [9. Contrats métier et critères de recette](#uml-module-9)
- [10. Proposition de reconstruction avec FastAPI ou Node + React](#uml-module-10)
- [11. Migration, décisions et points restant à qualifier](#uml-module-11)

<a id="uml-module-3"></a>

## 3. Authentification, droits et boutiques

| Fonctionnalité et schéma | Type | Portée | Image |
| --- | --- | --- | --- |
| [Connexion et contrôle d’accès](specification-reconstruction.md#uml-auth-session) | Séquence | Fonctionnement actuel | [SVG](uml/uml-auth-session.svg) |
| [Approbation des comptes](specification-reconstruction.md#uml-auth-approval) | États | Fonctionnement actuel | [SVG](uml/uml-auth-approval.svg) |
| [Boutique active et ownership actuel](specification-reconstruction.md#uml-auth-shop-scope) | Classes | Fonctionnement actuel | [SVG](uml/uml-auth-shop-scope.svg) |
| [Connexion ou mise à jour d’une boutique](specification-reconstruction.md#uml-shop-connect) | Séquence | Fonctionnement actuel | [SVG](uml/uml-shop-connect.svg) |
| [Assistant de connexion Shopify](specification-reconstruction.md#uml-shop-wizard) | États | Fonctionnement actuel | [SVG](uml/uml-shop-wizard.svg) |
| [Vérification et renouvellement des autorisations Shopify](specification-reconstruction.md#uml-shop-authorization-check) | Séquence | Fonctionnement actuel | [SVG](uml/uml-shop-authorization-check.svg) |
| [Réglages par boutique et paramètres relus](specification-reconstruction.md#uml-settings-write) | Séquence | Fonctionnement actuel | [SVG](uml/uml-settings-write.svg) |

<a id="uml-module-4"></a>

## 4. Intégration Shopify et synchronisation

| Fonctionnalité et schéma | Type | Portée | Image |
| --- | --- | --- | --- |
| [Autorisation OAuth et sauvegarde du token](specification-reconstruction.md#uml-shop-oauth) | Séquence | Fonctionnement actuel | [SVG](uml/uml-shop-oauth.svg) |
| [Synchronisation paginée des produits et variantes](specification-reconstruction.md#uml-shop-sync) | Séquence | Fonctionnement actuel | [SVG](uml/uml-shop-sync.svg) |
| [Sources de vérité et copies de travail](specification-reconstruction.md#uml-truth-authorities) | Classes | Fonctionnement actuel | [SVG](uml/uml-truth-authorities.svg) |

<a id="uml-module-5"></a>

## 5. Produits, visuels, prompts et traitements d'images

| Fonctionnalité et schéma | Type | Portée | Image |
| --- | --- | --- | --- |
| [Catalogue produit : filtres, pagination et sélection](specification-reconstruction.md#uml-image-catalogue) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-catalogue.svg) |
| [Détail produit : réorganisation de la galerie](specification-reconstruction.md#uml-image-detail-reorder) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-detail-reorder.svg) |
| [Groupes visuels : configuration et relations](specification-reconstruction.md#uml-image-group-config) | Classes | Fonctionnement actuel | [SVG](uml/uml-image-group-config.svg) |
| [Références : affectation, confirmation et recadrage](specification-reconstruction.md#uml-image-reference-assignment) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-reference-assignment.svg) |
| [Planifier première variante ou toutes les variantes](specification-reconstruction.md#uml-image-variant-planning) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-variant-planning.svg) |
| [Bibliothèque de prompts et construction du texte](specification-reconstruction.md#uml-image-prompt-library) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-prompt-library.svg) |
| [Prompts conditionnels : évaluation de la branche](specification-reconstruction.md#uml-image-conditional-prompt) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-conditional-prompt.svg) |
| [Mannequins : upload validé et référence adaptée](specification-reconstruction.md#uml-image-human-reference) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-human-reference.svg) |
| [Fournisseurs : paramètres capturés et paramètres relus](specification-reconstruction.md#uml-image-provider-settings) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-provider-settings.svg) |
| [Analyse vibe : cache produit et erreur non bloquante](specification-reconstruction.md#uml-image-vibe) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-vibe.svg) |
| [Détourage, composition du fond et stockage final](specification-reconstruction.md#uml-image-background) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-background.svg) |
| [Génération realtime : file séquentielle et reprises limitées](specification-reconstruction.md#uml-image-realtime) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-realtime.svg) |
| [OpenAI Batch durable : checkpoints et ingestion progressive](specification-reconstruction.md#uml-image-openai-durable) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-openai-durable.svg) |
| [OpenAI Batch : réponse perdue et réconciliation](specification-reconstruction.md#uml-image-openai-uncertainty) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-openai-uncertainty.svg) |
| [Cycle de vie du job et reprise technique](specification-reconstruction.md#uml-image-technical-states) | États | Fonctionnement actuel | [SVG](uml/uml-image-technical-states.svg) |
| [Cycle technique d’une image générée](specification-reconstruction.md#uml-image-states) | États | Fonctionnement actuel | [SVG](uml/uml-image-states.svg) |
| [Review : décision locale et résumés matérialisés](specification-reconstruction.md#uml-image-review) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-review.svg) |
| [Régénération d'un slot et retry d'un job](specification-reconstruction.md#uml-image-regeneration-retry) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-regeneration-retry.svg) |
| [Historique, purge rejetés et suppression partout](specification-reconstruction.md#uml-image-history-retention) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-history-retention.svg) |
| [Retouche Canvas : copie ou écrasement](specification-reconstruction.md#uml-image-retouch) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-retouch.svg) |
| [Publier et associer les images aux variantes](specification-reconstruction.md#uml-image-publication-rules) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-publication-rules.svg) |
| [Publication de job : snapshot, réservation et suivi](specification-reconstruction.md#uml-image-publication-background) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-publication-background.svg) |
| [Publication : intention, reçu et média retrouvé](specification-reconstruction.md#uml-image-publication-receipts) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-publication-receipts.svg) |
| [Familles historiques : destination par groupe](specification-reconstruction.md#uml-image-historical-families) | Séquence | Compatibilité historique | [SVG](uml/uml-image-historical-families.svg) |
| [Miroir bulk : préparer, vérifier puis publier](specification-reconstruction.md#uml-image-bulk-mirror) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-bulk-mirror.svg) |
| [Miroir bulk : restauration conditionnelle](specification-reconstruction.md#uml-image-bulk-mirror-rollback) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-bulk-mirror-rollback.svg) |
| [Permutation bulk et restauration de l'ordre](specification-reconstruction.md#uml-image-bulk-reorder-restore) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-bulk-reorder-restore.svg) |
| [Historique bulk : vue commune et suivi persistant](specification-reconstruction.md#uml-image-bulk-history) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-bulk-history.svg) |
| [Coûts : estimations par image et limites du total](specification-reconstruction.md#uml-image-cost-observability) | Séquence | Fonctionnement actuel | [SVG](uml/uml-image-cost-observability.svg) |

<a id="uml-module-6"></a>

## 6. Collecte, édition, export et import de catalogues

| Fonctionnalité et schéma | Type | Portée | Image |
| --- | --- | --- | --- |
| [création et périmètre de collecte](specification-reconstruction.md#uml-catalogue-creation) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-creation.svg) |
| [suivi de l’espace et confirmations de sortie](specification-reconstruction.md#uml-catalogue-confirmations) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-confirmations.svg) |
| [propositions IA et validation des tags](specification-reconstruction.md#uml-catalogue-tags) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-tags.svg) |
| [pagination des correspondances et inspecteur](specification-reconstruction.md#uml-catalogue-liste-inspecteur) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-liste-inspecteur.svg) |
| [collections, menu et ajout hors Top N](specification-reconstruction.md#uml-catalogue-collections-menu) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-collections-menu.svg) |
| [découverte, rang global et identités distinctes](specification-reconstruction.md#uml-catalogue-decouverte) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-decouverte.svg) |
| [collecte JSON et HTML avec reprises ciblées](specification-reconstruction.md#uml-catalogue-collecte) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-collecte.svg) |
| [édition, version et valeurs effectives](specification-reconstruction.md#uml-catalogue-corrections) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-corrections.svg) |
| [les deux tables et leurs documents embarqués](specification-reconstruction.md#uml-catalogue-modele) | Classes | Fonctionnement actuel | [SVG](uml/uml-catalogue-modele.svg) |
| [cycle de vie du catalogue](specification-reconstruction.md#uml-catalogue-etats) | États | Fonctionnement actuel | [SVG](uml/uml-catalogue-etats.svg) |
| [cycle de collecte d’une fiche](specification-reconstruction.md#uml-catalogue-fiche-etats) | États | Fonctionnement actuel | [SVG](uml/uml-catalogue-fiche-etats.svg) |
| [bail, protection des écritures et réveil](specification-reconstruction.md#uml-catalogue-bail) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-bail.svg) |
| [transport public protégé et backoff](specification-reconstruction.md#uml-catalogue-reseau) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-reseau.svg) |
| [export figé, multipart et téléchargement privé](specification-reconstruction.md#uml-catalogue-export) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-export.svg) |
| [import, produits existants et soumission incertaine](specification-reconstruction.md#uml-catalogue-import) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-import.svg) |
| [preuve Shopify, liens et menu séparé](specification-reconstruction.md#uml-catalogue-verification-menu) | Séquence | Fonctionnement actuel | [SVG](uml/uml-catalogue-verification-menu.svg) |

<a id="uml-module-7"></a>

## 7. Google Shopping, politiques et interface transversale

| Fonctionnalité et schéma | Type | Portée | Image |
| --- | --- | --- | --- |
| [Navigation, boutique active et préférence de thème](specification-reconstruction.md#uml-secondary-navigation) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-navigation.svg) |
| [Diagnostic des définitions puis synchronisation Google](specification-reconstruction.md#uml-secondary-google-diagnostic-sync) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-google-diagnostic-sync.svg) |
| [Catalogue, sélection multi-page et éditions manuelles](specification-reconstruction.md#uml-secondary-google-catalog-selection) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-google-catalog-selection.svg) |
| [Recherche et sélection dans la taxonomie Google](specification-reconstruction.md#uml-secondary-extra-google-taxonomy) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-extra-google-taxonomy.svg) |
| [Évaluation des règles, priorité et protection manuelle](specification-reconstruction.md#uml-secondary-google-rules) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-google-rules.svg) |
| [Créer, modifier, dupliquer et supprimer une règle Google](specification-reconstruction.md#uml-secondary-extra-google-rules-management) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-extra-google-rules-management.svg) |
| [Inclure, corriger ou retirer une proposition](specification-reconstruction.md#uml-secondary-google-preview) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-google-preview.svg) |
| [Publication des metafields avec digest et relecture](specification-reconstruction.md#uml-secondary-google-publication) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-google-publication.svg) |
| [Historique Google et relance ciblée des erreurs](specification-reconstruction.md#uml-secondary-google-history-retry) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-google-history-retry.svg) |
| [Modèle des six entités du flux Google](specification-reconstruction.md#uml-secondary-google-model) | Classes | Fonctionnement actuel | [SVG](uml/uml-secondary-google-model.svg) |
| [Changement de boutique entre lectures d'une action Google](specification-reconstruction.md#uml-secondary-google-shop-isolation) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-google-shop-isolation.svg) |
| [Historique unifié et dialogues des opérations bulk](specification-reconstruction.md#uml-secondary-bulk-history) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-bulk-history.svg) |
| [Formulaire, profils produits et overrides par langue](specification-reconstruction.md#uml-secondary-policy-form-languages) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-policy-form-languages.svg) |
| [Validation des saisies et autorisation d'export](specification-reconstruction.md#uml-secondary-policy-validation) | États | Fonctionnement actuel | [SVG](uml/uml-secondary-policy-validation.svg) |
| [Génération déterministe des six documents HTML](specification-reconstruction.md#uml-secondary-policy-html-generation) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-policy-html-generation.svg) |
| [Aperçu, copie et export HTML avec état volatil](specification-reconstruction.md#uml-secondary-policy-preview-export) | Séquence | Fonctionnement actuel | [SVG](uml/uml-secondary-policy-preview-export.svg) |
| [Cycle de la visionneuse et navigation circulaire](specification-reconstruction.md#uml-secondary-lightbox) | États | Fonctionnement actuel | [SVG](uml/uml-secondary-lightbox.svg) |

<a id="uml-module-8"></a>

## 8. Modèle de données, architecture et exploitation actuelles

| Fonctionnalité et schéma | Type | Portée | Image |
| --- | --- | --- | --- |
| [Relations du cœur produit, image et publication](specification-reconstruction.md#uml-data-core) | Classes | Fonctionnement actuel | [SVG](uml/uml-data-core.svg) |
| [Dépendances de l’architecture actuelle](specification-reconstruction.md#uml-runtime-architecture) | Classes | Fonctionnement actuel | [SVG](uml/uml-runtime-architecture.svg) |
| [Assets publics, exports privés et liens signés](specification-reconstruction.md#uml-storage-access) | Séquence | Fonctionnement actuel | [SVG](uml/uml-storage-access.svg) |
| [Réveil et reprise d’un travail interrompu](specification-reconstruction.md#uml-scheduler-recovery) | Séquence | Fonctionnement actuel | [SVG](uml/uml-scheduler-recovery.svg) |

<a id="uml-module-9"></a>

## 9. Contrats métier et critères de recette

| Fonctionnalité et schéma | Type | Portée | Image |
| --- | --- | --- | --- |
| [Contrat cible d’une écriture externe fiable](specification-reconstruction.md#uml-target-external-intent) | États | Proposition de reconstruction | [SVG](uml/uml-target-external-intent.svg) |

<a id="uml-module-10"></a>

## 10. Proposition de reconstruction avec FastAPI ou Node + React

| Fonctionnalité et schéma | Type | Portée | Image |
| --- | --- | --- | --- |
| [Découpage proposé en domaines ou microservices](specification-reconstruction.md#uml-target-services) | Classes | Proposition de reconstruction | [SVG](uml/uml-target-services.svg) |
| [Enveloppe proposée des opérations et effets](specification-reconstruction.md#uml-target-operation) | Classes | Proposition de reconstruction | [SVG](uml/uml-target-operation.svg) |

<a id="uml-module-11"></a>

## 11. Migration, décisions et points restant à qualifier

| Fonctionnalité et schéma | Type | Portée | Image |
| --- | --- | --- | --- |
| [Bascule proposée et reprise des identités](specification-reconstruction.md#uml-target-migration) | Séquence | Proposition de reconstruction | [SVG](uml/uml-target-migration.svg) |

## Modifier ou réutiliser un schéma

1. Ouvrir la fonctionnalité dans la spécification et développer sa source Mermaid.
2. Modifier le code du diagramme en conservant sa portée et les invariants métier.
3. Régénérer le SVG correspondant dans `docs/uml/` et vérifier sa lisibilité ainsi que sa concordance avec le texte.

Les sources utilisent les syntaxes Mermaid `sequenceDiagram`, `stateDiagram-v2` et `classDiagram`. Les images peuvent être réutilisées dans le brief de refonte, une documentation d’API ou un document exporté.
