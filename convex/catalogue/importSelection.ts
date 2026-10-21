export type ImportSelection = {
  products: boolean
  collections: boolean
  menu: boolean
}

export const allImportElements: ImportSelection = {
  products: true,
  collections: true,
  menu: true,
}

export const hasImportElements = (selection: ImportSelection) =>
  selection.products || selection.collections || selection.menu
