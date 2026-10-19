"use node"
import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { observeCompetitors } from "./seo/competitors"
import { generateStructure } from "./seo/ai"

export const analyze = internalAction({
  args: { versionId: v.id("seoVersions") }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await ctx.runQuery(internal.seoProjects.context, args)
    if (!context) return null
    const sources = await observeCompetitors(context.version.config.competitors)
    const { document, model } = await generateStructure(context.version.config, context.keywords, sources)
    const warnings = ["Regroupements sémantiques non vérifiés par une analyse des résultats Google.",
      "L’Excel est la seule source des mots-clés et volumes. Les catégories concurrentes non mesurées restent hors du menu.",
      "Export partiel : ce menu ne couvre pas nécessairement toute la thématique.",
      "Sommes des volumes déclarés : ni audience unique ni prévision de trafic."]
    document.warnings = [...new Set([...warnings, ...document.warnings])].slice(0, 30)
    await ctx.runMutation(internal.seoProjects.complete, { ...args, documentJson: JSON.stringify(document), model })
    return null
  },
})
