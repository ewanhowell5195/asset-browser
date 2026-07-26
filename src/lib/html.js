const MIME = {
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  mp4: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  txt: "text/plain"
}

const mimeOf = path => MIME[path.split(".").pop().toLowerCase()] ?? "application/octet-stream"

const hasScheme = ref => /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith("//")

const isExternal = ref => !ref || hasScheme(ref) || ref.startsWith("#")

// zip paths, not urls: no origin to resolve against, so a leading slash means
// the archive root
export function resolvePath(dir, ref) {
  if (isExternal(ref)) return null
  const out = ref.startsWith("/") ? [] : dir.split("/").filter(Boolean)
  for (const part of ref.split(/[?#]/)[0].split("/")) {
    if (!part || part === ".") continue
    if (part === "..") out.pop()
    else out.push(decodeURIComponent(part))
  }
  return out.length ? out.join("/") : null
}

function dataUri(bytes, path) {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return `data:${mimeOf(path)};base64,${btoa(binary)}`
}

const decoder = new TextDecoder()

async function inlineCss(text, dir, read, depth) {
  if (depth > 4) return text
  const jobs = []
  const collect = (pattern, handler) => {
    for (const match of text.matchAll(pattern)) {
      jobs.push({ match, handler })
    }
  }
  collect(/@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?\s*;/gi, "import")
  collect(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, "url")
  const edits = await Promise.all(jobs.map(async ({ match, handler }) => {
    const path = resolvePath(dir, match[1])
    const bytes = path && await read(path)
    if (!bytes) return null
    const nested = path.slice(0, path.lastIndexOf("/") + 1)
    const value = handler === "import"
      ? await inlineCss(decoder.decode(bytes), nested, read, depth + 1)
      : `url(${dataUri(bytes, path)})`
    return { from: match[0], to: value }
  }))
  for (const edit of edits) {
    if (edit) text = text.replaceAll(edit.from, edit.to)
  }
  return text
}

// srcdoc in a sandboxed frame has an opaque origin, so it can't fetch blob urls
// the page made: every local reference has to travel inside the document
export async function inlineHtml(html, dir, read) {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const jobs = []

  for (const link of doc.querySelectorAll("link[rel~=stylesheet][href]")) {
    jobs.push((async () => {
      const path = resolvePath(dir, link.getAttribute("href"))
      const bytes = path && await read(path)
      if (!bytes) return
      const style = doc.createElement("style")
      const nested = path.slice(0, path.lastIndexOf("/") + 1)
      style.textContent = await inlineCss(decoder.decode(bytes), nested, read, 0)
      link.replaceWith(style)
    })())
  }

  for (const style of doc.querySelectorAll("style")) {
    jobs.push((async () => {
      style.textContent = await inlineCss(style.textContent, dir, read, 0)
    })())
  }

  for (const script of doc.querySelectorAll("script[src]")) {
    jobs.push((async () => {
      const path = resolvePath(dir, script.getAttribute("src"))
      const bytes = path && await read(path)
      if (!bytes) return
      script.removeAttribute("src")
      script.textContent = decoder.decode(bytes)
    })())
  }

  for (const [selector, attribute] of [
    ["img[src]", "src"],
    ["input[src]", "src"],
    ["source[src]", "src"],
    ["track[src]", "src"],
    ["audio[src]", "src"],
    ["video[src]", "src"],
    ["video[poster]", "poster"],
    ["embed[src]", "src"],
    ["object[data]", "data"],
    ["link[rel~=icon][href]", "href"]
  ]) {
    for (const el of doc.querySelectorAll(selector)) {
      jobs.push((async () => {
        const path = resolvePath(dir, el.getAttribute(attribute))
        const bytes = path && await read(path)
        if (bytes) el.setAttribute(attribute, dataUri(bytes, path))
      })())
    }
  }

  for (const el of doc.querySelectorAll("[style]")) {
    jobs.push((async () => {
      el.setAttribute("style", await inlineCss(el.getAttribute("style"), dir, read, 0))
    })())
  }

  for (const a of doc.querySelectorAll("a[href]")) {
    if (!hasScheme(a.getAttribute("href"))) continue
    a.setAttribute("target", "_blank")
    a.setAttribute("rel", "noopener noreferrer")
  }

  const nav = doc.createElement("script")
  nav.textContent = NAV_SCRIPT
  doc.body.append(nav)

  await Promise.all(jobs)
  return "<!doctype html>" + doc.documentElement.outerHTML
}

// a srcdoc document resolves urls against the parent page, so "#x" is a
// navigation to the app rather than a jump within the document, and a link to a
// sibling file points at nothing this frame can reach. the frame has an opaque
// origin, so handing the href back up is the only way to follow it
export const OPEN_MESSAGE = "asset-browser:open"

const NAV_SCRIPT = `
addEventListener("click", event => {
  const link = event.target.closest?.("a[href]")
  if (!link || link.target === "_blank") return
  const href = link.getAttribute("href")
  event.preventDefault()
  if (!href.startsWith("#")) {
    parent.postMessage({ type: ${JSON.stringify(OPEN_MESSAGE)}, href }, "*")
    return
  }
  let id = href.slice(1)
  try {
    id = decodeURIComponent(id)
  } catch {}
  const target = document.getElementById(id) ?? document.getElementsByName(id)[0]
  target?.scrollIntoView()
})
`
