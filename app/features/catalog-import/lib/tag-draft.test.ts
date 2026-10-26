import { expect, test } from "vitest"
import type { Collection } from "../../../../convex/catalogue/model"
import { captureTagEditBases, tagValuesForSave } from "./tag-draft"

const collection = (key: string, values: Partial<Collection> = {}): Collection => ({
  key, title: key, url: `https://source.example/collections/${key}`,
  tag: key, description: "", image: null, validated: false,
  outsideMenu: false, membership: "complete", count: 0, selectedCount: 0,
  ...values,
})

test("manual drafts survive automatic proposals and untouched collections keep their latest tags", () => {
  const original = [collection("birds", { tag: "" }), collection("cats", { tag: "" })]
  const edits = { birds: { tag: "oiseau, été" } }
  const bases = captureTagEditBases(original, {}, edits)
  const latest = [collection("birds", { tag: "oiseaux" }), collection("cats", { tag: "chats" }), collection("dogs")]
  expect(tagValuesForSave(latest, edits, bases)).toEqual([
    { key: "birds", tag: "oiseau, été", ignored: false },
    { key: "cats", tag: "chats", ignored: false },
    { key: "dogs", tag: "dogs", ignored: false },
  ])
  expect(original[0].tag).toBe("")
  expect(latest[0].tag).toBe("oiseaux")
})

test("edits to different collections merge without overwriting a concurrent manual change", () => {
  const original = [collection("birds"), collection("cats")]
  const edits = { birds: { tag: "oiseaux" } }
  const bases = captureTagEditBases(original, {}, edits)
  expect(tagValuesForSave([original[0], collection("cats", { tag: "félins", edited: true })], edits, bases)[1].tag)
    .toBe("félins")
})

test.each([{ edited: true }, { validated: true }])(
  "conflicting saved or validated tags are refused: %j", (state) => {
    const original = [collection("birds")]
    const edits = { birds: { tag: "oiseaux" } }
    const bases = captureTagEditBases(original, {}, edits)
    expect(() => tagValuesForSave([collection("birds", { ...state, tag: "rapaces" })], edits, bases))
      .toThrow("Les tags de « birds » ont été modifiés ailleurs.")
    expect(edits.birds.tag).toBe("oiseaux")
  },
)

test("identical normalized concurrent changes are accepted", () => {
  const original = [collection("birds")]
  const edits = { birds: { tag: "été, oiseaux" } }
  const bases = captureTagEditBases(original, {}, edits)
  expect(tagValuesForSave([collection("birds", { tag: " e\u0301te\u0301 , oiseaux ", edited: true })], edits, bases)[0].tag)
    .toBe("été, oiseaux")
})

test("each field records its baseline when that field is first edited", () => {
  const original = [collection("birds", { tag: "" })]
  const bases = captureTagEditBases(original, {}, { birds: { ignored: true } })
  const proposed = [collection("birds", { tag: "oiseaux", edited: true })]
  const next = captureTagEditBases(proposed, bases, { birds: { tag: "rapaces" } })
  expect(bases).toEqual({ birds: { ignored: false } })
  expect(next).toEqual({ birds: { ignored: false, tag: "oiseaux" } })
  expect(captureTagEditBases([collection("birds", { tag: "autre" })], next, { birds: { tag: "chouettes" } }))
    .toEqual(next)
  expect(tagValuesForSave(proposed, { birds: { ignored: true, tag: "rapaces" } }, next)[0])
    .toEqual({ key: "birds", tag: "rapaces", ignored: true })
})

test("ignoring a collection retains an updated server tag and protects a conflicting exclusion", () => {
  const original = [collection("birds")]
  const bases = captureTagEditBases(original, {}, { birds: { ignored: true } })
  const latest = [collection("birds", { tag: "rapaces", edited: true })]
  expect(tagValuesForSave(latest, { birds: { ignored: true } }, bases)[0])
    .toEqual({ key: "birds", tag: "rapaces", ignored: true })
  expect(() => tagValuesForSave([collection("birds", { ignored: true })], { birds: { ignored: false } }, bases))
    .toThrow("L’exclusion de « birds » a été modifiée ailleurs.")
})

test("a removed collection or missing edit baseline cannot silently drop a draft", () => {
  const original = [collection("birds")]
  const edits = { birds: { tag: "oiseaux" } }
  const bases = captureTagEditBases(original, {}, edits)
  expect(() => tagValuesForSave([], edits, bases)).toThrow("Les collections ont changé")
  expect(() => tagValuesForSave(original, edits, {})).toThrow("Les collections ont changé")
})
