import { getModelMatch } from "./models.js"

// shared by the thumbnail workers and the main-thread path so both pose models
// the same way
export async function renderThumbnailModel(lib, assets, path, args) {
  const match = getModelMatch(path)
  if (!match) return null
  args = { ...args, assets }
  if (match.type === "block") {
    args.display ??= { type: "fallback", rotateFlat: true, ...lib.DISPLAYS.block }
    return lib.renderBlock({ ...args, id: match.id })
  }
  if (match.type === "item") {
    // item definitions resolve to either a sprite or a block model, so keep the
    // flat fallback and let the model's own transform pose the block ones
    args.display ??= { type: "fallback", rotateFlat: true }
    return lib.renderItem({ ...args, id: match.id })
  }
  // block models that declare no gui transform (fence sides, slab tops, stairs
  // pieces) would render face-on and unreadable, so pose those like an
  // inventory block. item sprites are flat in game, so they keep the default
  args.display ??= { type: "fallback", generated: false, rotateFlat: true, ...lib.DISPLAYS.block }
  const buf = await lib.readFile(path, assets)
  if (!buf) return null
  return lib.renderModel({ ...args, model: JSON.parse(new TextDecoder().decode(buf)) })
}
