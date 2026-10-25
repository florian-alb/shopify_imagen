import { normalizeTag, parseCollectionTags } from "../../../../convex/catalogue/tags"

export function collectionTagTokens(value: string): string[] {
  return value.trim() ? parseCollectionTags(value) : []
}

export function writeCollectionTag(value: string, index: number, text: string): string {
  const tokens = collectionTagTokens(value)
  tokens.splice(index, index < tokens.length ? 1 : 0, text)
  return tokens.join(", ")
}

export function commitCollectionTag(value: string, index: number, text: string): string {
  const tokens = collectionTagTokens(value)
  const added = text.split(/[,\r\n]/u).map(normalizeTag).filter(Boolean)
  tokens.splice(index, index < tokens.length ? 1 : 0, ...added)
  return tokens.join(", ")
}
