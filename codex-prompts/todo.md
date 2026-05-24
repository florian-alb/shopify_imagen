Le projet doit utiliser un dossier /prompts contenant 8 fichiers de prompts séparés.

Structure souhaitée :

/prompts
  closeup.txt
  texture.txt
  situation.txt
  multi-fonction.txt
  passe-tringle.txt
  galon-fronceur-crochets-escargot.txt
  oeillets.txt
  plis-flamands-agrafes-flamandes.txt

Le code ne doit pas hardcoder les prompts dans le TypeScript.
Il doit lire les fichiers .txt depuis le dossier /prompts au moment de l’exécution.

Chaque fichier prompt doit être un template texte réutilisable.
Le code doit pouvoir injecter des variables si nécessaire, par exemple :
{{PRODUCT_TITLE}}
{{PRODUCT_HANDLE}}
{{PRODUCT_COLOR}}
{{IMAGE_TYPE}}
{{FIXATION_TYPE}}

Même si les variables ne sont pas toutes disponibles au début, prévoir une fonction simple de remplacement de variables.

Types d’images à générer

Il y a 8 types d’images possibles :

1. closeup
2. texture
3. situation
4. multi-fonction
5. passe-tringle
6. galon-fronceur-crochets-escargot
7. oeillets
8. plis-flamands-agrafes-flamandes

Les 3 images suivantes doivent être générées pour tous les produits :
- closeup
- texture
- situation

Les 5 images de fixation doivent être générées uniquement si l’option correspondante est présente dans le produit Shopify :
- Multi-fonction
- Passe-tringle
- Galon Fronceur (crochets escargot)
- Œillets
- Plis Flamands (agrafes flamandes)

Détection des options de fixation

Pour chaque produit Shopify, inspecter :
- options produit
- noms d’options
- valeurs de variantes
- titres de variantes
- tags
- metafields si disponibles

Le système doit détecter les fixations de manière robuste, avec normalisation :
- lowercase
- suppression des accents
- remplacement des tirets/underscores par espaces
- trim
- recherche de synonymes

Mapping des fixations

Créer un mapping centralisé dans le code :

Multi-fonction :
- "multi-fonction"
- "multifonction"
- "multi fonction"
- "multi function"
- "multifunction"

Passe-tringle :
- "passe-tringle"
- "passe tringle"
- "rod pocket"
- "pole pocket"

Galon Fronceur (crochets escargot) :
- "galon fronceur"
- "crochets escargot"
- "escargot"
- "gathering tape"
- "heading tape"
- "snail hooks"

Œillets :
- "oeillets"
- "œillets"
- "oeillet"
- "eyelets"
- "grommets"

Plis Flamands (agrafes flamandes) :
- "plis flamands"
- "pli flamand"
- "agrafes flamandes"
- "flemish pleats"
- "flemish hooks"
- "pinch pleats"

Logique de génération

Pour chaque produit :

1. Toujours ajouter à la file de génération :
   - closeup
   - texture
   - situation

2. Inspecter les options du produit.

3. Si une fixation est détectée, ajouter le prompt correspondant à la file :
   - multi-fonction
   - passe-tringle
   - galon-fronceur-crochets-escargot
   - oeillets
   - plis-flamands-agrafes-flamandes

4. Ne jamais générer une image de fixation si l’option n’existe pas sur le produit.

5. Ne jamais générer deux fois le même type d’image pour un même produit.

Exemple :

Produit A possède les options :
- Passe-tringle
- Œillets

Images à générer :
- closeup
- texture
- situation
- passe-tringle
- oeillets

Ne pas générer :
- multi-fonction
- galon-fronceur-crochets-escargot
- plis-flamands-agrafes-flamandes

Nommage des fichiers

Format :

{{product-handle}}_01_situation.jpg
{{product-handle}}_02_closeup.jpg
{{product-handle}}_03_texture.jpg
{{product-handle}}_04_multi-fonction.jpg
{{product-handle}}_05_passe-tringle.jpg
{{product-handle}}_06_galon-fronceur-crochets-escargot.jpg
{{product-handle}}_07_oeillets.jpg
{{product-handle}}_08_plis-flamands-agrafes-flamandes.jpg

Important :
Si certaines fixations ne sont pas disponibles, ne pas créer de trou problématique.
Deux options acceptables :
- garder le numéro fixe par type d’image
- ou utiliser un index séquentiel selon les images réellement générées

Je préfère garder le numéro fixe par type d’image pour faciliter le debug.

Alt texts Shopify

situation :
“{{PRODUCT_TITLE}} - rideau premium en situation dans un intérieur haut de gamme”

closeup :
“{{PRODUCT_TITLE}} - détail premium du rideau et de ses finitions”

texture :
“{{PRODUCT_TITLE}} - texture du tissu et qualité de la matière”

multi-fonction :
“{{PRODUCT_TITLE}} - finition multi-fonction du rideau”

passe-tringle :
“{{PRODUCT_TITLE}} - finition passe-tringle du rideau”

galon-fronceur-crochets-escargot :
“{{PRODUCT_TITLE}} - galon fronceur avec crochets escargot”

oeillets :
“{{PRODUCT_TITLE}} - finition à œillets du rideau”

plis-flamands-agrafes-flamandes :
“{{PRODUCT_TITLE}} - plis flamands avec agrafes flamandes”

State management

state.json doit stocker les images par type :

{
  "productId": "",
  "handle": "",
  "status": "pending | generating | generated | uploaded | failed",
  "availableFixations": [
    "passe-tringle",
    "oeillets"
  ],
  "requestedImageTypes": [
    "situation",
    "closeup",
    "texture",
    "passe-tringle",
    "oeillets"
  ],
  "generatedImages": {
    "situation": "",
    "closeup": "",
    "texture": "",
    "passe-tringle": "",
    "oeillets": ""
  },
  "uploadedImages": {
    "situation": "",
    "closeup": "",
    "texture": "",
    "passe-tringle": "",
    "oeillets": ""
  },
  "error": null,
  "updatedAt": ""
}

Prompt loader

Créer un module :

src/prompts/promptLoader.ts

Fonctions attendues :

loadPrompt(imageType: string): string

renderPrompt(template: string, variables: Record<string, string>): string

getRequiredImageTypes(product): string[]

getAvailableFixations(product): string[]

Comportement attendu :

- loadPrompt lit /prompts/[imageType].txt
- renderPrompt remplace les variables {{VARIABLE}}
- getAvailableFixations détecte les options de fixation disponibles
- getRequiredImageTypes retourne les 3 images obligatoires + les fixations disponibles

Tests à prévoir

Créer des tests simples ou au minimum des fixtures pour vérifier :

Produit avec aucune fixation :
=> closeup, texture, situation

Produit avec Œillets :
=> closeup, texture, situation, oeillets

Produit avec Passe-tringle + Œillets :
=> closeup, texture, situation, passe-tringle, oeillets

Produit avec toutes les fixations :
=> les 8 prompts

Produit avec accents / variations :
- "Œillets"
- "Oeillets"
- "oeillets"
- "Grommets"
doivent tous matcher "oeillets".

MVP mis à jour

Le MVP doit maintenant :
1. Charger les prompts depuis /prompts.
2. Récupérer 1 produit Shopify.
3. Détecter les fixations disponibles.
4. Créer la liste des images à générer.
5. Afficher clairement :
   - produit
   - fixations détectées
   - prompts qui seront utilisés
   - fichiers de sortie attendus
6. En mode dry-run, ne pas ouvrir ChatGPT et ne rien uploader.
7. En mode test, générer uniquement les images nécessaires pour ce produit.