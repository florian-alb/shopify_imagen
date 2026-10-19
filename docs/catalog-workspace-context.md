# Catalogue — contexte d’implémentation courant

Mis à jour le 19 octobre 2026. Cette refonte remplace l’ancien moteur, ses tables de tâches/index et ses fichiers R2 intermédiaires. Voir [transition](catalog-workspace-migration.md) et [qualification](catalog-refonte-qualification.md). L’[ancien contexte](catalog-workspace-context-historique.md) est historique.

## Frontières

- `app/features/catalog-import/components/CatalogHome.tsx` : source, mode, historique.
- `CatalogWorkspace.tsx` : validation des tags, liste paginée, inspecteur, collections/menu, confirmations et résultats.
- `convex/catalogues.ts` : API authentifiée, ownership, écritures transactionnelles, coordination interne.
- `convex/catalogueActions.ts` : découverte, collecte et export en actions Node courtes.
- `convex/catalogue/` : modèle effectif, schéma, extracteurs purs, réseau protégé, proposition IA, stockage et adaptation Shopify.
- Cron `catalogues.resume` : réveille uniquement les travaux actifs dont le bail a expiré.

Les composants UI partagés, l’authentification, les boutiques et le client Shopify partagé sont réutilisés. `use-catalog-query.ts` reste présent parce que l’authentification l’utilise pour invalider son cache ; le nouveau catalogue utilise les abonnements Convex natifs. Ne pas ajouter d’effet dépendant de l’identité des proxies `api.*`.

Les choix de langue utilisent `app/components/ui/language-select.tsx` (Select shadcn, drapeaux, sélection au clavier), commun au catalogue, au SEO et aux politiques. `app/lib/languages.ts` centralise libellés, drapeaux et ordre d’affichage ; chaque module conserve son sous-ensemble de langues pris en charge. `TagLanguageSelect` fournit uniquement le libellé et les options propres aux tags.

La liste utilise `usePaginatedQuery` et le contrat paginé Convex natif (lignes JSON légères, curseurs et métadonnées de découpage). Les filtres exacts s’appliquent à des lectures bornées à 50 lignes/2 Mo. Une page affichée contient jusqu’à **25 correspondances**, assemblées en poursuivant les lots même lorsqu’ils contiennent déjà quelques résultats. Une correspondance supplémentaire permet de savoir si Suivant doit être actif. Le chargement s’arrête à cette borne ou à la fin ; les lots restent réactifs et sont réinitialisés lors d’un changement de filtre/tri. Ne pas confondre une page de lecture avec une page de résultats filtrés, ni arrêter le parcours au premier lot non vide.

## Deux tables métier

`catalogues` contient propriétaire, origine, mode/N, menu et collections sérialisés, tags validés, avertissements, compteurs, version, génération, travail courant et bail. `produits` contient identité source, handle/URL, appartenances, groupe de traitement, rang, sélection, état, JSON source intact en chaîne, données normalisées/compléments HTML et corrections séparées.

Des lignes URL seules recensent les appartenances des produits hors Top N : elles ne déclenchent aucun téléchargement de fiche. Les alias d’un même identifiant source deviennent de petites références non sélectionnées vers la fiche canonique. Ils ne comptent jamais deux fois dans les collections ou la liste.

Indexes : propriétaire/état/origine pour catalogue ; catalogue+handle/identité/rang/titre/état/groupe pour produit. Pas de table d’index de suffixes, tâche, checkpoint, rapport, snapshot ou lot métier supplémentaire.

## Découverte et collecte

Menu HTML filtré aux collections et parents nécessaires ; sitemaps produits/collections ; classement `/collections/all?sort_by=best-selling` paginé et dédupliqué ; listes publiques de toutes les collections pour les appartenances. Les anomalies sont visibles : page répétée, classement indisponible/incomplet, collection du menu absente du sitemap, membres inconnus.

Le lecteur HTML du menu est partagé dans `convex/catalogue/navigation.ts`. `extractMenu(html, origin)` conserve le contrat Shopify du catalogue ; le mode explicite `{ navigationOnly: true }`, utilisé par le SEO, accepte aussi les autres plateformes et les URL localisées, sans créer de catalogue ni collecter de produits. Ce mode conserve ordre/parents/enfants et fournit un état `structured`/`partial`/`unavailable`. `structured` signifie qu’un arbre HTML a été reconnu, pas que des sous-menus JavaScript absents du HTML ont été vérifiés. Il ne faut pas remplacer la projection catalogue `collectionMenu` par une liste de liens SEO. Les tests couvrent les menus Shopify, localisés, desktop/mobile et les flyouts Shopware en `div`.

Les tags IA restent non validés. Après validation explicite, les collections sont traitées successivement, puis le groupe technique Sans collection. Une fiche partagée est collectée une seule fois. JSON et HTML sont systématiques, avec trois tentatives bornées et conservation des réussites. En cas de retry HTML, le JSON intact déjà reçu n’est pas retéléchargé.

Le réseau HTTPS valide DNS/IP et redirections, bloque les adresses privées, borne réponse et timeout. Un bail sérialise les actions par domaine. Les lectures JSON/HTML d’une fiche sont parallèles (deux requêtes), sous un budget maximal de quatre ; backoff et Retry-After sont persistés. Un 403 bloque explicitement. Le découpage technique reste invisible dans les unités métier collection.

## Cohérence

Toute écriture d’un worker vérifie catalogue + génération + jeton de bail. Les rejeux de découverte, de rang et de rapprochement des alias ne doublonnent pas les fiches. Les corrections utilisateur vérifient une version attendue ; les tags manuels remplacent les tags hérités dans le résolveur `effective`, commun à la lecture, l’export et Shopify.

La langue des tags (`catalogues.tagLanguage`, optionnelle pour les catalogues existants, anglais par défaut) se choisit à la création et reste modifiable pendant découverte/collecte et après. Elle guide les propositions IA et figure dans le JSON final ; elle ne traduit ni les tags existants automatiquement, ni le contenu source. L’action explicite « Reproposer tous les tags par IA » remplace les valeurs affichées dans le brouillon, avec validation avant application. Les tags acceptent les lettres Unicode minuscules et leurs accents, chiffres, espaces simples et tirets, jusqu’à 100 caractères ; la normalisation NFC précède la détection des doublons.

Les tags disposent d’une révision dédiée `tagVersion` (zéro par défaut) : les écritures d’avancement ne rendent plus leurs brouillons périmés. Les modifications de tags restent protégées contre les éditions concurrentes. `saveTags` permet de sauvegarder pendant découverte/collecte sans relancer le worker. Les checkpoints de ces workers reprennent les tags/corrections courants ; une proposition automatique produite dans une ancienne langue est abandonnée puis rejouée. `Collection.appliedTag` conserve le dernier tag validé pendant une modification enregistrée en brouillon. Après validation sans collecte, les produits héritent immédiatement du nouveau tag dans lecture, export et import via `effective`, sans réécriture de toutes les fiches ; les overrides propres aux produits restent prioritaires. Les tags et leur langue sont figés pendant tout travail d’export/import, y compris bloqué.

L’import fige le catalogue, y compris après une soumission incertaine. La même boutique ne peut recevoir deux imports actifs ou bloqués en attente de réconciliation. L’export fige également la version pendant sa génération. Les données proposées sont contrôlées avec `getConvexSize`, marge à 900 000 octets ; un dépassement conserve les anciennes données disponibles et signale l’échec, sans tronquer la source.

## Stockage et import

Une seule clé finale : `catalogues/<id>/catalogue.json`. Le multipart R2 reprend via identifiant/ETags et curseur stockés dans le document catalogue ; aucune clé intermédiaire. Une partie rejouée remplace le même numéro. Une fin dont la réponse est perdue se reconnaît par le token de métadonnées. Une nouvelle génération récupère les uploads orphelins de cette seule clé. Le lien de téléchargement expire après cinq minutes ; aucun R2 public ni secret client.

Shopify reçoit des champs inscriptibles, pas tous les champs source. Le JSONL temporaire destiné au bulk est envoyé directement au staged upload Shopify. L’identité `imagen_catalog/source_id` utilise une définition `id` unique ; le même triplet namespace/key/value apparaît dans customId et metafields, sans `type` dans productSet. Ne jamais changer cette convention : elle retrouve aussi les anciens objets Shopify.

Le bulk est réconcilié par son token de mutation puis par identités source ; aucune resoumission aveugle après perte réseau. Les objets existants gardent leurs autres tags, contenu et statut. Les créations restent DRAFT. Les collections vides subsistent ; le parent structurel du menu utilise HTTP `#`. Les appartenances et médias sont contrôlés avant le bilan. L’export ne sert pas d’entrée de liste ni de source éditable.

## Vérification

`npm test`, `npm run typecheck`, `npx tsc --noEmit -p convex/tsconfig.json`, `npm run check:convex-contract`, `npm run build`. Le banc UI isolé se lance avec `npx vite --config scripts/vite.catalogue-ui.config.ts`, puis `/scripts/catalogue_ui_check.html` sur le port 3002. Il utilise les vrais composants avec un client en mémoire ; il ne constitue pas un E2E authentifié.

Cible autorisée dans cette session : **dev curious-greyhound-437 seulement**. Production youthful-bandicoot-479 et import Shopify réel requièrent une autorisation nouvelle et précise.
