import { expect, test } from "vitest"
import { extractMenu } from "./extract"

const origin = "https://shop.example"
const shopifyMenu = `<script src="https://cdn.shopify.com/theme.js"></script><header><nav><ul>
  <li><details><summary>Jouets</summary><ul>
    <li><a href="/fr/collections/tri">Jeux de tri</a></li>
    <li><a href="/fr/collections/eveil">Éveil</a></li>
  </ul></details></li>
  <li><a href="/fr/collections/mobilier">Mobilier</a></li>
</ul></nav></header>`

test("l’extracteur catalogue conserve sa hiérarchie et ses collections Shopify localisées", () => {
  const result = extractMenu(shopifyMenu, `${origin}/fr`)
  expect(result.menu.map(node => node.title)).toEqual(["Jouets", "Mobilier"])
  expect(result.menu[0].children.map(node => [node.key, node.title])).toEqual([["0.0", "Jeux de tri"], ["0.1", "Éveil"]])
  expect(result.collections.map(collection => collection.key)).toEqual(["tri", "eveil", "mobilier"])
})

test("le mode catalogue exige toujours Shopify et des collections", () => {
  expect(() => extractMenu('<nav><ul><li><a href="/jouets">Jouets</a></li></ul></nav>', origin)).toThrow(/Shopify/)
  expect(() => extractMenu('<script src="shopify.js"></script><header><nav><ul><li><a href="/pages/about">Qui sommes-nous</a></li></ul></nav></header>', origin)).toThrow(/Aucune collection/)
})

test("le mode navigation accepte les catégories hors Shopify et retire les liens techniques", () => {
  const result = extractMenu(`<header><nav><ul>
    <li><a href="/de/spielzeug">Spielzeug</a><ul>
      <li><a href="/de/sortierspiele">Sortierspiele</a></li>
      <li><a href="/de/lernspiele">Lernspiele</a></li></ul></li>
    <li><a href="/blog">Blog</a></li><li><a href="/account">Mein Konto</a></li>
    <li><a href="https://external.example/toys">External</a></li>
    <li><a href="javascript:alert(1)">Code</a></li>
    </ul></nav></header>`, `${origin}/de`, { navigationOnly: true })
  expect(result.navigationStatus).toBe("structured")
  expect(result.menu).toMatchObject([{ title: "Spielzeug", url: `${origin}/de/spielzeug`, children: [
    { title: "Sortierspiele", url: `${origin}/de/sortierspiele` }, { title: "Lernspiele" },
  ] }])
  expect(result.menu).toHaveLength(1)
  expect(result.collections).toEqual([])
})

test("les mega-menus Shopware en divs conservent les trois niveaux sous chaque entrée principale", () => {
  const result = extractMenu(`<nav id="main-navigation-menu"><ul class="main-navigation-menu-list">
    <li><a href="/spielzeug">Spielzeug</a><div class="dropdown-menu">
      <div class="navigation-flyout-category-link"><a href="/spielzeug">Zur Kategorie Spielzeug</a></div>
      <div class="navigation-flyout-categories is-level-0"><div class="col-3">
        <a href="/spielzeug/rollenspielzeug">Rollenspielzeug</a>
        <div class="navigation-flyout-categories is-level-1"><div>
          <a href="/spielzeug/rollenspielzeug/kaufladen">Kaufladen</a>
          <div class="navigation-flyout-categories is-level-2"><div><a href="/spielzeug/rollenspielzeug/kaufladen/eisladen">Eisladen</a></div></div>
        </div><div><a href="/spielzeug/rollenspielzeug/kinderkueche">Kinderküche</a></div></div>
      </div><div><a href="/spielzeug/motorik">Motorik</a></div></div>
    </div></li>
    <li><a href="/lernen">Lernen</a></li>
  </ul></nav>`, origin, { navigationOnly: true })
  expect(result.navigationStatus).toBe("structured")
  expect(result.menu).toMatchObject([
    { title: "Spielzeug", children: [
      { title: "Rollenspielzeug", children: [
        { title: "Kaufladen", children: [{ title: "Eisladen", key: "0.0.0.0" }] },
        { title: "Kinderküche" },
      ] },
      { title: "Motorik" },
    ] }, { title: "Lernen" },
  ])
})

test("les versions desktop et mobile ne doublent pas le menu et le meilleur arbre gagne", () => {
  const result = extractMenu(`<header>
    <nav aria-label="Mobile"><ul><li><a href="/collections/toys">Jouets</a></li></ul></nav>
    <nav aria-label="Desktop"><ul><li><a href="/collections/toys">Jouets</a><ul>
      <li><a href="/collections/tri">Tri</a></li><li><a href="/collections/eveil">Éveil</a></li>
    </ul></li></ul></nav>
  </header>`, origin, { navigationOnly: true })
  expect(result.menu).toHaveLength(1)
  expect(result.menu[0].children.map(node => node.title)).toEqual(["Tri", "Éveil"])
})

test("les labels structurels sont conservés sans importer un lien externe parent", () => {
  const result = extractMenu('<nav><ul><li><a href="https://other.example">Par âge</a><ul><li><a href="/jouets-1-an">1 an</a></li></ul></li></ul></nav>', origin, { navigationOnly: true })
  expect(result.menu[0]).toMatchObject({ title: "Par âge", url: null, children: [{ title: "1 an" }] })
})

test("un menu de liens plats est signalé partiel ; un menu uniquement JavaScript est indisponible", () => {
  const flat = extractMenu('<header><nav><a href="/toys">Jouets</a><a href="/toys">Jouets</a></nav></header>', origin, { navigationOnly: true })
  expect(flat.navigationStatus).toBe("partial")
  expect(flat.menu).toHaveLength(1)
  const dynamic = extractMenu('<nav id="menu"></nav><script>renderMenu()</script>', origin, { navigationOnly: true })
  expect(dynamic).toMatchObject({ menu: [], navigationStatus: "unavailable" })
})

test("une très grande navigation est bornée et signalée partielle", () => {
  const result = extractMenu(`<nav><ul>${Array.from({ length: 300 }, (_, i) => `<li><a href="/categorie-${i}">Catégorie ${i}</a></li>`).join("")}</ul></nav>`, origin, { navigationOnly: true })
  expect(result.menu).toHaveLength(250)
  expect(result.navigationStatus).toBe("partial")
})
