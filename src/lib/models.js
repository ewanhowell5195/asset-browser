// files inside a nested pack are keyed by the zip holding them, so resource
// paths only start after the innermost ".zip/"
export function zipPrefix(path) {
  const index = path.lastIndexOf(".zip/")
  return index === -1 ? "" : path.slice(0, index + 5)
}

// innermost pack outwards, ending at the jar itself: a pack overrides the one
// containing it the same way it overrides vanilla
export function zipPrefixChain(prefix) {
  const chain = []
  while (prefix) {
    chain.push(prefix)
    const index = prefix.slice(0, -5).lastIndexOf(".zip/")
    prefix = index === -1 ? "" : prefix.slice(0, index + 5)
  }
  chain.push("")
  return chain
}

export function getModelMatch(path) {
  path = path.slice(zipPrefix(path).length)
  const blockstate = path.match(/^assets\/([^/]+)\/blockstates\/([^/]+)\.json$/)
  if (blockstate) return { type: "block", id: `${blockstate[1]}:${blockstate[2]}` }
  const item = path.match(/^assets\/([^/]+)\/items\/([^/]+)\.json$/)
  if (item) return { type: "item", id: `${item[1]}:${item[2]}` }
  if (/^assets\/[^/]+\/models\/.+\.json$/.test(path)) return { type: "model" }
  return null
}
