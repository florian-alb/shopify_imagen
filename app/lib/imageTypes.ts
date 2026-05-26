export type BaseImageType = "situation" | "closeup" | "texture";

export type FixationType =
  | "multi-fonction"
  | "passe-tringle"
  | "galon-fronceur-crochets-escargot"
  | "oeillets"
  | "plis-flamands-agrafes-flamandes";

export type ImageType = BaseImageType | FixationType;

export const BASE_IMAGE_TYPES: BaseImageType[] = ["situation", "closeup", "texture"];
export const BUDGET_IMAGE_TYPES: ImageType[] = ["situation", "closeup", "texture", "oeillets"];

export const FIXATION_ORDER: FixationType[] = [
  "multi-fonction",
  "passe-tringle",
  "galon-fronceur-crochets-escargot",
  "oeillets",
  "plis-flamands-agrafes-flamandes"
];

export const IMAGE_TYPE_LABELS: Record<ImageType, string> = {
  situation: "Situation / lifestyle",
  closeup: "Close-up",
  texture: "Texture",
  "multi-fonction": "Multi-fonction",
  "passe-tringle": "Passe-tringle",
  "galon-fronceur-crochets-escargot": "Galon fronceur + crochets escargot",
  oeillets: "Oeillets",
  "plis-flamands-agrafes-flamandes": "Plis flamands + agrafes flamandes"
};

export const ALL_IMAGE_TYPES: ImageType[] = [...BASE_IMAGE_TYPES, ...FIXATION_ORDER];

export function isImageType(value: string): value is ImageType {
  return (ALL_IMAGE_TYPES as string[]).includes(value);
}
