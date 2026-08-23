const CORS = "https://cors.ewanhowell.com/"
const CORS_MC = "https://corsmc.ewanhowell.com/"

// the piston hosts send ACAO: *, so jars come straight from Mojang. the assets
// host sits on its own storage account with no such header, and goes through the
// minecraft proxy, which caches on its own box. github stays on the worker,
// because bedrock archives come from one Oracle egress IP there and github rate
// limits per IP, while the worker spreads over many
const DIRECT = /^https:\/\/piston-(data|meta)\.mojang\.com\//
const MOJANG = /^https:\/\/resources\.download\.minecraft\.net\//

export const proxy = url => DIRECT.test(url) ? url : (MOJANG.test(url) ? CORS_MC : CORS) + url

export const isRemote = url => /^https?:\/\//i.test(url)

export function remoteName(url) {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""
    return decodeURIComponent(last) || url
  } catch {
    return url
  }
}

// user-supplied urls try the origin directly and only fall back to the proxy
// when the failure has the shape a cors rejection has: an opaque TypeError,
// which is all the fetch api ever reveals about one
const needsProxy = new Set()

function originOf(url) {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

async function openRemote(url) {
  const origin = originOf(url)
  if (origin && !needsProxy.has(origin)) {
    try {
      return await fetch(url)
    } catch (e) {
      if (e.name !== "TypeError") throw e
      needsProxy.add(origin)
    }
  }
  return fetch(CORS + url)
}

export async function fetchRemoteBuffer(url, onProgress) {
  return readBody(await openRemote(url), onProgress)
}

export async function fetchBuffer(url, onProgress) {
  return readBody(await fetch(url), onProgress)
}

async function readBody(res, onProgress) {
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
