// grid thumbnails render here so a folder of models doesn't lock up scrolling.
// each worker preps the version jar itself (straight from the IndexedDB copy
// where it can) and keeps the players it built, painting them into canvases the
// page hands over with transferControlToOffscreen
import { loadRenderer } from "./renderer.js"
import { idbGet } from "./idb.js"
import { renderThumbnailModel } from "./thumbnailRender.js"

let lib = null
let assets = null
let version = null
const handles = new Map()
const players = new Map()

// drawn into a 2d probe rather than read directly, since the render's canvas
// may be webgl-backed
function isBlank(canvas) {
  if (!canvas?.width || !canvas.height) return true
  const probe = new OffscreenCanvas(canvas.width, canvas.height)
  const ctx = probe.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(canvas, 0, 0)
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]) return false
  }
  return true
}

function drop(key) {
  handles.get(key)?.handle.dispose?.()
  handles.delete(key)
  players.get(key)?.dispose()
  players.delete(key)
}

self.onmessage = async e => {
  const m = e.data
  try {
    if (m.type === "init") {
      lib = await loadRenderer()
      if (m.clockStart != null) lib.configure({ clockStart: m.clockStart })
      version = m.version
      const buffer = (await idbGet("jars", m.id).catch(() => null))?.data ?? m.buffer
      if (!buffer) throw new Error(`no cached jar for ${m.id}`)
      assets = await lib.prepareAssets(buffer)
      self.postMessage({ type: "init" })
    } else if (m.type === "render") {
      // there's no DOM here for the library's own offscreen pausing to watch,
      // so playback is driven entirely by the page's visible messages
      const args = { width: m.size, height: m.size, upgradable: true, pauseOffscreen: false }
      if (/^\d+\.\d+/.test(version)) {
        args.version = version
      }
      const handle = await renderThumbnailModel(lib, assets, m.path, args)
      if (!handle) {
        self.postMessage({ type: "render", key: m.key, kind: "blank" })
        return
      }
      const blank = isBlank(handle.canvas)
      if (!handle.toAnimated) {
        if (blank) {
          self.postMessage({ type: "render", key: m.key, kind: "blank" })
          return
        }
        const bitmap = await createImageBitmap(handle.canvas)
        self.postMessage({ type: "render", key: m.key, kind: "static", bitmap }, [bitmap])
        return
      }
      // the retained scene waits here for the page to hand over a canvas, so
      // the upgrade costs no second render
      handles.set(m.key, { handle, blank })
      self.postMessage({ type: "render", key: m.key, kind: "animated" })
    } else if (m.type === "animate") {
      const entry = handles.get(m.key)
      if (!entry) return
      handles.delete(m.key)
      const player = entry.handle.toAnimated(m.canvas)
      let blank = !player
      // a model whose first frame is empty may still animate into view, so give
      // a mid-loop frame the same look the static path gets
      if (player && entry.blank) {
        const frames = player.frames?.length ?? 0
        blank = true
        if (frames > 1) {
          player.renderFrame(Math.floor(frames / 2))
          blank = isBlank(player.canvas)
        }
      }
      if (blank) {
        player?.dispose()
        self.postMessage({ type: "animate", key: m.key, blank: true })
        return
      }
      player.play()
      players.set(m.key, player)
      self.postMessage({ type: "animate", key: m.key })
    } else if (m.type === "visible") {
      players.get(m.key)?.[m.visible ? "play" : "pause"]()
    } else if (m.type === "drop") {
      drop(m.key)
    }
  } catch (err) {
    self.postMessage({ type: m.type, key: m.key, error: String(err?.message ?? err) })
  }
}
