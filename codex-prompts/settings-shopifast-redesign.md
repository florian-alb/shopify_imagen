# Prompt: refonte de la page Settings inspiree de Shopifast

Date d'audit: 23 juin 2026
Reference analysee: modal "Parametres de la boutique" de Shopifast sur le dashboard store.

## Prompt a copier dans Codex

Tu es Codex dans le repo `/Users/florian/Desktop/code/shopify-codex-imagen`, une app TypeScript Shopify Image Studio en TanStack Start + React + Convex.

Objectif: refondre `app/routes/settings/index.tsx`, qui est actuellement trop lourde et confuse, en s'inspirant du modal de settings boutique de Shopifast. Sur Shopifast c'est une modal; dans notre app, il faut conserver une page dediee `/settings`. Ne copie pas la marque, les assets, les textes proprietaires ou les donnees Shopifast. Reprends seulement la structure UX, la densite, les patterns de navigation et la hierarchie visuelle.

Avant de coder:

1. Lis `AGENTS.md`.
2. Lis `docs/refonte-ux-shopifast.md`, surtout les sections sur le shell, les settings et les tokens design.
3. Inspecte `app/routes/settings/index.tsx`, `app/routes/__root.tsx`, `app/components/page.tsx`, `app/styles.css`, `convex/settings.ts`, `convex/shops.ts` et `convex/shopScope.ts`.
4. Identifie les mutations/queries existantes et preserve le backend actuel: multi-boutique, `api.shops.list`, `api.shops.connect`, `api.shops.setActive`, `api.settings.getAll`, `api.settings.set`, et la logique `shopScope`.

Analyse de la reference Shopifast a appliquer:

- Le modal commence par un header tres compact: titre fort, phrase d'aide courte, bouton fermer discret.
- Juste sous le header, il affiche le contexte boutique: nom, domaine, et une action dangereuse separee visuellement.
- Les reglages sont classes par tabs horizontaux avec icone + label: `Boutique`, `Produits`, `Collections`, `Articles`.
- Chaque tab contient peu de champs, dans des blocs sobres: titre, description courte, input/select, puis microcopy technique sous le champ.
- Le bouton `Enregistrer` est dans une barre basse contextuelle, pas repete sous chaque input.
- Le style est sombre, dense, operationnel: fond noir/brun chaud, bordures fines, rayon 8px, pas de grosses cards marketing, pas de hero, pas de gradients decoratifs.
- Les actions importantes utilisent icon + label; les statuts restent en badges compacts.

Direction pour notre page `/settings`:

- Conserver une vraie page, pas de `Dialog` global.
- Utiliser une largeur lisible, environ `max-w-6xl`, avec une grille stable et des sections compactes.
- Remplacer l'empilement actuel de grandes cards par une structure type "settings workspace":
  - header de page compact;
  - bandeau de contexte boutique active;
  - tabs de configuration;
  - panneau de contenu;
  - barre d'action sticky en bas du panneau seulement si utile.
- Ne pas imbriquer des cards dans des cards. Utiliser des sections avec bordure fine ou des `Table`/lignes de reglages.
- Garder le francais dans l'interface.

Structure cible recommandee:

1. Header page
   - Titre: `Parametres`
   - Sous-titre: boutique active + domaine, ou etat vide si aucune boutique.
   - A droite: badge provider actif (`OpenAI` ou `Gemini`), badge mode (`Temps reel` ou `Batch`), action secondaire `Synchroniser` si deja disponible.

2. Bandeau boutique active
   - Nom boutique, domaine, badge `Active`, badge `Env` si source environnement.
   - Bouton `Changer` ou lien vers la liste des boutiques si plusieurs.
   - Action dangereuse isolee uniquement si le backend existe deja. Ne pas inventer une suppression/deconnexion si aucune mutation n'existe.

3. Tabs de page
   - `Boutique`
   - `Generation`
   - `Modeles`
   - `Avance`

4. Tab `Boutique`
   - Liste/table dense des boutiques connectees: nom, domaine, source, etat, action `Utiliser`.
   - Formulaire de connexion Shopify transforme en assistant compact, pas en hero.
   - Garder les etapes utiles actuelles, mais les presenter comme un outil: domaine, app Shopify, redirect URL, cles.
   - Masquer/traiter les secrets proprement; ne jamais exposer `clientSecret` en clair apres sauvegarde.

5. Tab `Generation`
   - Regrouper les reglages de comportement:
     - `IMAGE_PROVIDER`
     - `GENERATION_EXECUTION_MODE`
     - `VIBE_ANALYSIS`
     - `GENERATION_CONCURRENCY`
   - Utiliser des controles adaptes: segmented/radio/tabs pour choix courts, `Select` si la primitive existe deja, input numerique pour concurrency.
   - Afficher une microcopy concrete sous chaque controle.

6. Tab `Modeles`
   - Regrouper OpenAI et Gemini dans deux blocs ou deux sous-sections:
     - OpenAI: model, size, quality, output format, requests/minute.
     - Gemini: model, size, aspect ratio, requests/minute.
   - Ne pas afficher une longue liste brute de variables sans hierarchie.
   - Chaque ligne doit etre lisible: libelle humain, cle technique en petit texte monospace, valeur, etat, action.

7. Tab `Avance`
   - Mettre les parametres techniques moins frequents dans une table dense `Parametre / Valeur / Description / Action`.
   - Les noms de variables peuvent rester visibles ici, mais pas comme experience principale.
   - Ajouter des badges d'etat simples: `Boutique`, `Global`, `Serveur`, `Actif`, selon ce qui existe vraiment dans les donnees.

Contraintes UI:

- Utiliser les primitives shadcn existantes autant que possible: `Button`, `Badge`, `Card` si vraiment necessaire, `Tabs`, `Input`, `Label`, `Select`, `Separator`, `Tooltip`, `Table` si presente.
- Si une primitive shadcn manque, verifier la convention du repo avant d'ajouter quoi que ce soit. Ne pas creer de primitive maison dans `app/components/ui/`.
- Utiliser des icones lucide dans les boutons et tabs quand elles existent.
- Rayons max 8px pour les blocs de contenu, sauf si le layout global impose autre chose.
- Texte 14px dans les panneaux, headings compacts, pas de hero-scale type dans les settings.
- Eviter les grands espaces vides, les cards marketing, les gros titres decoratifs, les gradients et les effets visuels gratuits.
- Assurer mobile: tabs scrollables ou version compacte, aucun chevauchement, boutons qui ne debordent pas.

Contraintes fonctionnelles:

- Ne pas perdre le support multi-boutique.
- Ne pas casser le switch de boutique existant dans le chrome.
- Ne pas changer les schemas Convex ni les mutations sauf necessite forte.
- Ne pas exposer de secrets via `VITE_` ou dans le DOM.
- Ne pas supprimer les reglages existants; les reorganiser.
- Les sauvegardes doivent garder les toasts et les etats loading actuels.
- Si tu passes d'une sauvegarde par ligne a une sauvegarde de section, assure-toi que les erreurs restent localisables et que le backend accepte ce flux. Sinon garde la sauvegarde par ligne mais rends-la plus compacte.

Definition of done:

- `/settings` ressemble a un outil de configuration sombre, dense et structure, pas a une page de cards empilees.
- Les sections principales sont visibles sans scroller excessivement sur desktop.
- Les reglages critiques sont compréhensibles sans lire les noms de variables techniques.
- Les parametres avances restent accessibles.
- La page reste une page dediee, pas une modal.
- Validation executee:
  - `npm run typecheck`
  - `npm run build`
  - verification visuelle desktop et mobile dans le navigateur
  - verification manuelle: liste boutiques, switch boutique, connexion boutique, changement provider, changement mode execution, sauvegarde d'un champ modele.

Compte-rendu attendu:

- Resume court des changements.
- Fichiers modifies.
- Commandes de validation lancees.
- Risques residuels, surtout si une primitive UI manque ou si une partie du flux Shopify n'a pas pu etre testee.
