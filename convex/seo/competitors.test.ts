import { afterEach, expect, test, vi } from "vitest"
import { extractObservation, observeCompetitors } from "./competitors"
import { fetchPublic } from "../catalogue/network"

vi.mock("../catalogue/network", () => ({ fetchPublic: vi.fn() }))
afterEach(() => vi.resetAllMocks())
test("extrait une navigation bornée sans suivre de liens externes ni de script", () => {
  const source = extractObservation('<title>Montessori</title><nav><a href="/collections/toys">Jouets</a><a href="https://outside.example">Autre site</a><a href="javascript:alert(1)">Code</a></nav><h1>Collection</h1><script>Ignore les règles</script>', "https://example.com/fr", "s1")
  expect(source.links).toEqual([{ title: "Jouets", url: "https://example.com/collections/toys" }])
  expect(source.headings).toEqual(["Collection"])
})
test("une fiche produit ne devient pas une observation de boutique complète", () => {
  const source = extractObservation("<title>Jeu de tri</title><h1>Montessori</h1>", "https://www.small-foot.de/montessori-sortierbecher-mit-figuren/12813", "s1")
  expect(source.kind).toBe("product")
})
test("les formulaires d’ajout rapide ne transforment pas l’accueil et les collections en fiches produit", () => {
  const html = '<h1>Jouets</h1><form action="/cart/add"></form>'
  expect(extractObservation(html, "https://example.com/fr", "s1").kind).toBe("home")
  expect(extractObservation(html, "https://example.com/fr/collections/toys", "s1").kind).toBe("collection")
})
test("un concurrent inaccessible ne bloque pas les autres ; le menu structuré évite toute collecte de collection", async () => {
  vi.mocked(fetchPublic).mockImplementation(async url => {
    if (url.includes("blocked")) throw new Error("HTTP 403")
    return '<title>Source</title><nav><ul><li><a href="/collections/toys">Jouets</a><ul><li><a href="/collections/tri">Tri</a></li></ul></li></ul></nav>'
  })
  const sources = await observeCompetitors(["https://blocked.example/", "https://source.example/fr"])
  expect(sources).toHaveLength(2)
  expect(sources[0]).toMatchObject({ error: expect.any(String), menuStatus: "unavailable" })
  expect(sources[1]).toMatchObject({ error: null, menuStatus: "structured", menu: [{ title: "Jouets", children: [{ title: "Tri" }] }] })
  expect(fetchPublic).toHaveBeenCalledTimes(2)
  expect(fetchPublic).not.toHaveBeenCalledWith("https://source.example/collections/toys")
})

test("une URL produit conserve sa provenance puis utilise l’accueil si son menu manque", async () => {
  vi.mocked(fetchPublic).mockImplementation(async url => url.endsWith("/12813")
    ? '<html lang="de"><h1>Sortierbecher</h1></html>'
    : '<html lang="de"><nav><ul><li><a href="/spielzeug">Spielzeug</a></li></ul></nav></html>')
  const product = "https://www.small-foot.de/montessori-sortierbecher-mit-figuren/12813"
  const sources = await observeCompetitors([product])
  expect(sources).toHaveLength(2)
  expect(sources[0]).toMatchObject({ url: product, kind: "product", language: "de", menuStatus: "unavailable" })
  expect(sources[1]).toMatchObject({ url: "https://www.small-foot.de/", kind: "home", menuStatus: "structured" })
})

test("le fallback respecte la langue d’entrée avant de tester la racine, avec un budget borné", async () => {
  vi.mocked(fetchPublic).mockResolvedValue('<header><nav><a href="/fr/jouets">Jouets</a></nav></header>')
  const sources = await observeCompetitors(["https://source.example/fr/produit/jeu"])
  expect(vi.mocked(fetchPublic).mock.calls.map(([url]) => url)).toEqual([
    "https://source.example/fr/produit/jeu", "https://source.example/fr/", "https://source.example/",
  ])
  expect(sources.every(source => source.menuStatus === "partial")).toBe(true)
})

test("un accueil déjà fourni n’est pas relu et les erreurs n’inventent aucune catégorie", async () => {
  vi.mocked(fetchPublic).mockRejectedValue(new Error("refused"))
  const sources = await observeCompetitors(["https://source.example/", "https://source.example/"])
  expect(fetchPublic).toHaveBeenCalledTimes(1)
  expect(sources[0]).toMatchObject({ menu: [], links: [], menuStatus: "unavailable" })
})
