// the worker pool behind the model grid. jobs run in request order, which is
// top-down as the grid mounts, and a job still queued when its tile scrolls out
// of view is dropped, so a fast scroll lets the queue catch up to the view.
// animated thumbnails keep their player in the worker that built them, so every
// thumb routes its visibility and disposal back to that same worker
const SIZE = 128

let workers = []
let queue = []
let clockStart = null
let keySeq = 0
const pending = new Map()

// true from the moment the pool starts, not from when a worker finishes
// preparing the jar: jobs queue and wait, rather than racing a whole screenful
// of renders onto the main thread during warm-up
export function poolActive() {
  return workers.length > 0
}

function makeCanvas() {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = SIZE
  return canvas
}

function finish(slot, job, thumb) {
  pending.delete(job.key)
  if (slot.busy === job) {
    slot.busy = null
  }
  job.resolve(thumb)
  pump()
}

function onMessage(slot, m) {
  if (m.type === "init") {
    slot.ready = !m.error
    slot.failed = !!m.error
    // nothing can render if every worker failed to prep, so give the queued
    // jobs back and let the caller run them on the main thread
    if (workers.every(s => s.failed)) {
      stopThumbnailPool()
      return
    }
    pump()
    return
  }
  const job = pending.get(m.key)
  if (!job) return
  if (m.error) {
    finish(slot, job, null)
    return
  }
  if (m.type === "render") {
    if (m.kind === "blank") {
      finish(slot, job, null)
    } else if (m.kind === "static") {
      const canvas = makeCanvas()
      canvas.getContext("2d").drawImage(m.bitmap, 0, 0)
      m.bitmap.close()
      finish(slot, job, { canvas, setVisible() {}, dispose() {} })
    } else if (job.cancelled) {
      slot.worker.postMessage({ type: "drop", key: m.key })
      finish(slot, job, null)
    } else {
      // a fresh canvas every time: transferControlToOffscreen throws on one
      // that already has a context, and it can never take a 2d one afterwards
      job.canvas = makeCanvas()
      const offscreen = job.canvas.transferControlToOffscreen()
      slot.worker.postMessage({ type: "animate", key: m.key, canvas: offscreen }, [offscreen])
    }
    return
  }
  if (m.type === "animate") {
    if (m.blank) {
      finish(slot, job, null)
      return
    }
    const key = m.key
    const worker = slot.worker
    finish(slot, job, {
      canvas: job.canvas,
      setVisible: visible => worker.postMessage({ type: "visible", key, visible }),
      dispose: () => worker.postMessage({ type: "drop", key })
    })
  }
}

function nextJob() {
  while (queue.length) {
    const job = queue.shift()
    if (!job.cancelled) return job
    job.resolve(null)
  }
  return null
}

function pump() {
  for (const slot of workers) {
    if (!slot.ready || slot.busy) continue
    const job = nextJob()
    if (!job) return
    job.started = true
    job.key = String(++keySeq)
    slot.busy = job
    pending.set(job.key, job)
    slot.worker.postMessage({ type: "render", key: job.key, path: job.path, size: SIZE })
  }
}

export function startThumbnailPool(id, version, buffer) {
  stopThumbnailPool()
  // ?mainrender forces the main-thread path, for comparing the two
  if (new URLSearchParams(location.search).has("mainrender")) return
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return
  if (!document.createElement("canvas").transferControlToOffscreen) return
  clockStart ??= performance.timeOrigin + performance.now()
  const count = Math.max(2, Math.min(6, (navigator.hardwareConcurrency ?? 4) - 2))
  for (let i = 0; i < count; i++) {
    let worker
    try {
      worker = new Worker(new URL("./thumbnailWorker.js", import.meta.url), { type: "module" })
    } catch {
      break
    }
    const slot = { worker, ready: false, busy: null }
    worker.onmessage = e => onMessage(slot, e.data)
    worker.onerror = () => {
      slot.ready = false
      if (slot.busy) finish(slot, slot.busy, null)
    }
    worker.postMessage({ type: "init", id, version, clockStart, buffer })
    workers.push(slot)
  }
}

// undefined rather than null: null is a real result meaning "nothing to show",
// while these jobs never ran and the caller should render them another way
export function stopThumbnailPool() {
  for (const slot of workers) {
    slot.worker.terminate()
  }
  workers = []
  for (const job of pending.values()) {
    job.resolve(undefined)
  }
  pending.clear()
  for (const job of queue) {
    job.resolve(undefined)
  }
  queue = []
}

export function submitThumbnail(path) {
  const job = { path, cancelled: false, started: false }
  job.promise = new Promise(resolve => job.resolve = resolve)
  queue.push(job)
  pump()
  return job
}
