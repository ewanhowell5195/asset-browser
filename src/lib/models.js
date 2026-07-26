export function getModelMatch(path) {
  const blockstate = path.match(/^assets\/([^/]+)\/blockstates\/([^/]+)\.json$/)
  if (blockstate) return { type: "block", id: `${blockstate[1]}:${blockstate[2]}` }
  const item = path.match(/^assets\/([^/]+)\/items\/([^/]+)\.json$/)
  if (item) return { type: "item", id: `${item[1]}:${item[2]}` }
  if (/^assets\/[^/]+\/models\/.+\.json$/.test(path)) return { type: "model" }
  return null
}
