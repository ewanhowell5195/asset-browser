const CORS = "https://cors.ewanhowell.com/"
const CORS_MC = "https://corsmc.ewanhowell.com/"

// mojang goes through the minecraft proxy, which caches on its own box. github
// stays on the worker, because bedrock archives come from one Oracle egress IP
// there and github rate limits per IP, while the worker spreads over many
const MOJANG = /^https:\/\/(resources\.download\.minecraft\.net|libraries\.minecraft\.net|piston-(data|meta)\.mojang\.com)\//

export const proxy = url => (MOJANG.test(url) ? CORS_MC : CORS) + url

export async function fetchBuffer(url, onProgress) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download (${res.status})`)
  }
  if (!res.body || !onProgress) {
    return new Uint8Array(await res.arrayBuffer())
  }
  const total = Number(res.headers.get("Content-Length")) || 0
  const reader = res.body.getReader()
  const chunks = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress(received, total)
  }
  const out = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}
