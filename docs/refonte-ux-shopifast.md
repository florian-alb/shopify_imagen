# Plan de refonte UX inspiree de Shopifast

Date d'audit: 22 juin 2026  
Reference analysee: `https://app.shopifast.io/dashboard/stores/jh74mtc553xc4a14qsa43669jd86mjse/products`

Objectif: refondre l'app en reprenant tres fortement les patterns UX de Shopifast: dashboard sombre, sidebar dense, listes en tables, filtres inline, pages detail en deux colonnes avec rail d'actions. La copie doit porter sur la structure UX, les comportements et la densite, pas sur les assets proprietaires, le logo, ni les textes de marque Shopifast.

Contrainte forte: utiliser les composants shadcn/ui. Ne pas creer de primitives UI maison. Les seuls fichiers sous `app/components/ui/` doivent venir de la CLI shadcn ou rester des composants shadcn deja generes. Les compositions metier peuvent rester dans les routes ou dans des composants applicatifs fins, mais elles doivent assembler des primitives shadcn.

## 1. Audit Shopifast

### Shell global

- Theme sombre par defaut, fond brun/noir tres legerement chaud.
- Sidebar fixe desktop, largeur autour de 256px, avec:
  - marque en haut;
  - groupe "Boutiques";
  - carte boutique active avec nom, nombre de boutiques, bouton changer et bouton parametres;
  - navigation par groupes: `Arborescence`, `Collections`, `Produits`, `Articles`, puis `Operations > Generations`;
  - carte promotionnelle en bas;
  - menu utilisateur en footer.
- Contenu principal dans un panneau sombre arrondi, avec bordure subtile.
- Header de page compact:
  - bouton collapse sidebar;
  - breadcrumb;
  - badge/pill "Cles API utilisateur";
  - credit counter;
  - toggle theme.
- Typographie dense: Inter, titres 24px/32px environ, texte de table 14px.
- Tokens visuels observes:
  - fond body proche `oklch(0.175 0.008 35)`;
  - fond header/table/panneaux proche `oklch(0.23 0.008 35)`;
  - bordures `oklch(1 0 0 / 10%)`;
  - texte principal `oklch(0.985 0.002 247.839)`;
  - texte secondaire `oklch(0.707 0.022 261.325)`;
  - accent action jaune/olive proche `oklch(0.8605 0.1733 91.96)`.

### Listes Produits et Collections

- La liste est une vraie table, pas une grille de cards.
- En-tete:
  - titre avec compteur: `Produits (235)`, `Collections (55)`;
  - sous-titre boutique + domaine Shopify;
  - bouton sync icon-only proche du titre;
  - CTA principal a droite: `Ajouter Produit` ou `Ajouter Collection`.
- Barre de controle:
  - tabs de statut: `Tous`, `Actif`, `Brouillon`, `Archive`;
  - bouton recherche/filtre compact;
  - bouton tri compact.
- Mode recherche:
  - remplace la barre de tabs par un champ de recherche pleine largeur;
  - garde la table stable;
  - ajoute des dropdowns compacts: collection, statut, modifications;
  - bouton `Annuler` pour sortir du mode recherche.
- Table:
  - checkbox de selection en premiere colonne;
  - mini image produit carree;
  - statut en badge vert/bleu;
  - SKU/handle tronque en monospace ou quasi monospace;
  - collections en badges compacts avec `+N`;
  - lignes hautes d'environ 64px;
  - hover et selection discrets.

### Page creation/detail produit

- Page dediee, pas une modale.
- Header:
  - breadcrumb;
  - titre produit;
  - badge statut sous le titre;
  - handle sous le titre;
  - boutons precedent/suivant a droite.
- Layout:
  - colonne principale large pour contenu produit, description, images, SEO;
  - rail droit sticky pour `Actions` puis `Informations`;
  - cards sobres avec bordure fine.
- Actions:
  - bouton `Generer` en accent;
  - actions secondaires desactivees quand rien n'a change;
  - etat explicite: "Derniere execution terminee".
- Sections:
  - contenu produit;
  - images produit;
  - metachamps repliables;
  - generation SEO automatique;
  - compteurs de caracteres.

### Arborescence

- Ecran outil pleine largeur dans une grande card.
- Toolbar en haut: nouvelle niche, nouvelle categorie, nouvelle collection, import menu, zoom.
- Canvas/board avec colonnes et cards imbriquees.
- Barre sticky en bas de la card: etat `Enregistre, non publie`, `Retablir`, `Enregistrer`, `Publier sur Shopify`.

### Generations

- Table dense:
  - statut en badge;
  - cible;
  - barre de progression;
  - badge succes/echec;
  - date de demarrage.
- Les echecs ont une action `Relancer les echecs`.

### Empty states

- Les pages vides utilisent une grande card pleine largeur, icone centrale, titre court, texte court.
- Exemple: `Articles (0)` avec `Aucun article`.

## 2. Cible pour notre app

Notre app doit devenir un "Image Studio" sombre et operationnel, aligne sur le rythme Shopifast:

- langue UI: francais par defaut, car le contexte boutique est francophone;
- shell sombre par defaut;
- sidebar multi-boutique preservee et mise au format Shopifast;
- tables denses pour produits et jobs;
- actions principales dans un rail droit sur les pages detail;
- filtres de liste inline et non plus cartes de filtres volumineuses;
- tous les statuts visibles sous forme de badges compacts;
- zero composant UI primitif ecrit a la main.

## 3. Composants shadcn

Deja presents dans le repo:

- `accordion`
- `alert`
- `alert-dialog`
- `badge`
- `breadcrumb`
- `button`
- `card`
- `checkbox`
- `dialog`
- `field`
- `input`
- `label`
- `pagination`
- `progress`
- `scroll-area`
- `select`
- `separator`
- `sheet`
- `sidebar`
- `skeleton`
- `sonner`
- `tabs`
- `textarea`
- `tooltip`

Ajouter via shadcn CLI:

```bash
npx shadcn@latest add @shadcn/table @shadcn/dropdown-menu @shadcn/command @shadcn/popover @shadcn/radio-group @shadcn/avatar @shadcn/button-group @shadcn/collapsible
```

Usage attendu:

- `Table`: produits, jobs, prompts, boutiques, settings techniques.
- `DropdownMenu`: tri, filtres compacts, menu utilisateur, actions ligne.
- `Command`: recherche boutique/produit si besoin dans les menus longs.
- `Popover`: filtres avances sans page dediee.
- `RadioGroup`: filtres exclusifs comme statut/tri.
- `Avatar`: footer utilisateur.
- `ButtonGroup`: precedent/suivant, groupe zoom, actions compactes.
- `Collapsible`: sections sidebar, metadonnees, filtres secondaires.

## 4. Mapping route par route

### `app/routes/__root.tsx`

Refonte du shell:

- passer `Sidebar` en mode sombre permanent;
- remplacer le select boutique par une carte boutique active type Shopifast:
  - nom boutique;
  - domaine ou nombre de boutiques;
  - bouton changer;
  - bouton parametres;
- grouper la nav:
  - `Boutique`: Produits;
  - `Operations`: Jobs;
  - `Configuration`: Prompts, Settings;
- ajouter topbar commune:
  - `SidebarTrigger`;
  - breadcrumb route;
  - badge provider/API;
  - compteur cout/credits si donnees disponibles;
  - theme toggle ou placeholder si non prioritaire;
- remplacer le bottom nav mobile par un `Sheet` sidebar ou une version compacte inspiree Shopifast.

### `app/components/page.tsx`

Transformer ce fichier en compositions shadcn, sans primitives maison:

- `PageHeader` devient compatible Shopifast:
  - titre + compteur;
  - sous-titre boutique/domaine;
  - action principale a droite;
  - bouton sync icon-only pres du titre;
- `StateBadge` garde la logique metier mais mappe vers `Badge`;
- `EmptyState` devient une card pleine largeur avec icone centrale;
- `NumberedPaginator` reste shadcn `Pagination`, mais visuellement plus compact.

### `app/routes/products/index.tsx`

Remplacer la grille de `ProductRow` cards par une table dense:

- columns:
  - selection;
  - Produit: image, titre, handle;
  - Action;
  - Generation;
  - Review;
  - Publication;
  - Images;
  - Shopify;
- top controls:
  - tabs rapides: `Tous`, `A traiter`, `A verifier`, `Pret`, `Publie`;
  - bouton recherche/filtre qui active un mode recherche inline;
  - dropdowns `collection`, `type`, `generation`, `review`, `publication`, `statut Shopify`;
  - tri `creation`, `titre`, `images generees`, `action`;
- selection:
  - checkbox header;
  - barre sticky basse uniquement quand selection active;
  - CTA `Generer` en accent.

### `app/routes/products/$productId.tsx`

Recomposer en page detail a deux colonnes:

- header:
  - breadcrumb;
  - titre produit;
  - badges action/generation/review/publication;
  - handle;
  - boutons precedent/suivant;
- colonne gauche:
  - images Shopify;
  - images generees par template;
  - etats review;
  - accordions pour details produit et historique;
- rail droit sticky:
  - card `Actions`: Generer, Pousser sur Shopify, Synchroniser, Annuler selection;
  - card `Informations`: SKU/handle, boutique active, nombre images Shopify, cout dernier job, dernier sync;
  - card `Publication`: options replace/reorder;
- dialogs existants conserves mais declenches depuis ce rail.

### `app/routes/jobs/index.tsx`

Renommer visuellement en `Generations`:

- table `STATUT / CIBLE / EN COURS / DEMARREE / ACTIONS`;
- barre de progression verte dans la cellule `EN COURS`;
- badges `x succes`, `x echecs`;
- action `Relancer les echecs`;
- filtres sous forme de dropdowns compacts dans la barre de controle.

### `app/routes/jobs/$jobId.tsx`

Transformer en page detail operationnelle:

- header avec statut et cible;
- rail droit `Actions` pour relancer, annuler, ouvrir produit;
- table ou grille dense des images/taches;
- lightbox conservee via `Dialog`;
- review avec badges et boutons compacts shadcn.

### `app/routes/settings/index.tsx`

Conserver le backend multi-boutique actuel, mais remettre l'UX au format Shopifast:

- section boutiques en liste/table dense;
- onboarding Shopify dans une page/card outil, pas dans un hero marketing;
- settings techniques en table `Parametre / Valeur / Etat / Action`;
- actions de sauvegarde compactes, etats `Active`, `Env`, `Boutique active`.

### `app/routes/settings/prompts.tsx`

Reprendre le principe d'un outil de configuration:

- tabs/ordre conserves, mais dans une card sombre;
- prompt editor en layout deux colonnes:
  - liste/templates a gauche;
  - contenu et variables a droite;
- actions `Seed`, `New template`, `Save`, `Reset` en `DropdownMenu` ou rail droit selon densite.

## 5. Tokens design a appliquer

Priorite: obtenir le rendu Shopifast avant toute personnalisation de marque.

- Mode sombre par defaut sur `html` ou root app.
- Surface app: fond chaud tres sombre.
- Sidebar: fond encore plus sombre, sans shadow.
- Main panel: rayon 14px, bordure `border-border`, fond `background/card`.
- Cards: rayon 8px, border fine, pas de shadow lourde.
- Tables:
  - header 40px;
  - row 64px;
  - texte 14px;
  - thumbnails 44-48px;
  - badges 18-24px.
- Accent:
  - CTA principal jaune/olive;
  - succes vert;
  - warning jaune;
  - danger rouge;
  - neutral bleu/gris pour collections et meta.
- Numeriques et handles: `font-mono` ou `tabular-nums`.
- Hover/active:
  - background leger `white/5`;
  - bordure accent seulement sur focus/selection;
  - transitions 150-200ms.

## 6. Ordre d'execution

1. Installer les composants shadcn manquants.
2. Ajuster `app/styles.css`:
   - tokens sombres;
   - theme par defaut;
   - helpers table/image uniquement si absents des primitives shadcn.
3. Refaire le shell `__root.tsx`.
4. Refaire `PageHeader`, `EmptyState`, `StateBadge`, pagination.
5. Refaire `products/index.tsx` en table dense.
6. Refaire `products/$productId.tsx` avec rail droit sticky.
7. Refaire `jobs/index.tsx` puis `jobs/$jobId.tsx`.
8. Refaire `settings/index.tsx` et `settings/prompts.tsx`.
9. Verifier mobile:
   - sidebar accessible;
   - table scroll horizontal propre;
   - actions sticky non chevauchantes.
10. Validation:
   - `npm run typecheck`;
   - `npm run build`;
   - verification visuelle desktop + mobile dans le navigateur;
   - test manuel multi-boutique: changement boutique, listing produits, detail produit, lancement generation, settings.

## 7. Points de vigilance

- Ne pas perdre le support multi-boutique recent: garder `api.shops.list`, `api.shops.setActive`, `storeId` et la logique `shopScope`.
- Ne pas exposer les secrets Shopify ou Convex dans des variables `VITE_`.
- Ne pas reintroduire l'ancien `review-ui` comme surface principale.
- Ne pas deplacer les mutations/actions Convex pendant la refonte visuelle sauf necessite.
- Ne pas copier les assets Shopifast.
- Ne pas convertir les tables en cards sur desktop; les cards ne servent qu'aux details, empty states et rails d'action.
- Garder les composants UI generes par shadcn comme source unique des primitives.
