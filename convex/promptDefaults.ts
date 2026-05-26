import { IMAGE_TYPE_LABELS, type ImageType } from "./lib";

const shared = `Use the uploaded image as the exact product reference.

Preserve the curtain exactly as shown in the reference image:
- same color
- same premium fabric appearance
- same padded / blackout / insulated construction
- same textile density, stitching, edge finishing, and weight
- same overall design character

Do not change the product, invent new features, or make it look thinner, cheaper, sheer, or lightweight.

Product: {{PRODUCT_TITLE}}
Handle: {{PRODUCT_HANDLE}}
Image type: {{IMAGE_TYPE}}
Fixation type, when applicable: {{FIXATION_TYPE}}

Style and art direction:
- ultra photorealistic
- premium product photography
- luxury interior textile aesthetic
- soft directional lighting
- realistic material detail
- square 1:1 composition

No text. No watermark. No collage.`;

export const defaultPrompts: Array<{
  imageType: ImageType;
  label: string;
  content: string;
}> = [
  {
    imageType: "situation",
    label: IMAGE_TYPE_LABELS.situation,
    content: `${shared}

Generate a luxurious lifestyle image showing this curtain installed in a sophisticated high-end interior. The curtain must remain the visual hero, hanging beautifully in front of a large window with rich folds, a natural heavy drape, refined architecture, premium materials, and a calm editorial atmosphere.`
  },
  {
    imageType: "closeup",
    label: IMAGE_TYPE_LABELS.closeup,
    content: `${shared}

Generate a premium close-up focused on curtain construction, finish, textile quality, and tailored detail. Communicate craftsmanship, structure, luxury, and the substantial weight of the drape.`
  },
  {
    imageType: "texture",
    label: IMAGE_TYPE_LABELS.texture,
    content: `${shared}

Generate a macro texture image that makes the fabric feel tactile, substantial, expensive, soft, dense, and richly structured. Use shallow depth of field and elegant folds while keeping the material the focus.`
  },
  {
    imageType: "multi-fonction",
    label: IMAGE_TYPE_LABELS["multi-fonction"],
    content: `${shared}

Generate a close-up of the top section with a premium multi-function heading. Clearly communicate a versatile finish for multiple installation methods while keeping the construction refined, realistic, and luxurious.`
  },
  {
    imageType: "passe-tringle",
    label: IMAGE_TYPE_LABELS["passe-tringle"],
    content: `${shared}

Generate a close-up of the top section with a rod pocket heading (passe-tringle). Show a curtain rod passing cleanly through the sewn top pocket with structured folds and a tailored luxury finish.`
  },
  {
    imageType: "galon-fronceur-crochets-escargot",
    label: IMAGE_TYPE_LABELS["galon-fronceur-crochets-escargot"],
    content: `${shared}

Generate a close-up of the top section with gathered heading tape and snail hooks (galon fronceur avec crochets escargot). The tape and hook-based finish should be visible or clearly suggested while remaining clean and premium.`
  },
  {
    imageType: "oeillets",
    label: IMAGE_TYPE_LABELS.oeillets,
    content: `${shared}

Generate a high-end close-up of the top part with metal grommets (eyelets / oeillets), hanging on a premium curtain rod with evenly spaced eyelets and deep elegant folds.`
  },
  {
    imageType: "plis-flamands-agrafes-flamandes",
    label: IMAGE_TYPE_LABELS["plis-flamands-agrafes-flamandes"],
    content: `${shared}

Generate a premium close-up of the top section with Flemish pleats / tailored pinch pleats using Flemish hooks. The pleats should feel precise, bespoke, structured, and couture-like.`
  }
];
