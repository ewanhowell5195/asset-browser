import { reactive, ref, shallowRef } from "vue"
import { zipSync } from "fflate"
import { loadRenderer } from "../lib/renderer.js"
import { parseZip, createImage, textOf, isImagePath } from "../lib/zip.js"
import { getModelMatch } from "../lib/models.js"
import { storage, save } from "../lib/storage.js"
import { idbGet, idbPut, idbDelete } from "../lib/idb.js"
import { proxy, fetchBuffer } from "../lib/net.js"
import { titleCase, saveBlob, isBlankRender } from "../lib/util.js"
import { poolActive, startThumbnailPool, stopThumbnailPool, submitThumbnail } from "../lib/thumbnails.js"
import { basename } from "../lib/path.js"
import { updateUrlParams } from "../lib/url.js"

const manifest = reactive({
  latest: {},
  types: {
    release: "Java Release",
    snapshot: "Java Snapshot",
    bedrock: "Bedrock Release",
    "bedrock-preview": "Bedrock Preview"
  },
  versions: [],
  loaded: false,
  error: null
})

const jar = shallowRef(null)
const tree = shallowRef({})
const treeTick = ref(0)
const version = ref(null)
const initialPath = ref([])
const loadingMessage = ref(null)
const progressDone = ref(0)
const progressTotal = ref(0)
const progressBytes = ref(false)
const exporting = ref(false)
const toast = ref(null)

let loadedJars = {}
let toastTimeout
let freshBuffer = null

function quickMessage(message) {
  toast.value = message
  clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => toast.value = null, 3000)
}

async function loadManifest() {
  if (manifest.loaded) return
  manifest.error = null
  try {
    const [data, bedrock] = await Promise.all([
      fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json").then(e => e.json()),
      fetch("https://api.github.com/repos/Mojang/bedrock-samples/releases").then(e => e.ok ? e.json() : []).catch(() => [])
    ])
    for (const release of bedrock) {
      data.versions.push({
        id: release.tag_name,
        type: release.prerelease ? "bedrock-preview" : "bedrock",
        data: {
          type: release.prerelease ? "bedrock-preview" : "bedrock",
          downloads: {
            client: {
              url: `https://github.com/Mojang/bedrock-samples/archive/refs/tags/${release.tag_name}.zip`
            }
          }
        }
      })
    }
    for (const entry of data.versions) {
      if (!manifest.types[entry.type]) {
        manifest.types[entry.type] = titleCase(entry.type)
      }
    }
    manifest.latest = data.latest
    manifest.versions = data.versions
    manifest.loaded = true
  } catch (e) {
    console.error(e)
    manifest.error = "Unable to load the version list. Check your connection and try again."
  }
}

function getVersion(id) {
  let entry = manifest.versions.find(e => e.id === id)
  if (!entry && loadedJars[id]) {
    const dataPath = loadedJars[id].files["version.json"]
    if (dataPath) {
      try {
        const data = JSON.parse(textOf(dataPath.content))
        entry = manifest.versions.find(e => e.id === data.id)
      } catch {}
    }
  }
  return entry
}

async function getVersionData(id) {
  const entry = getVersion(id)
  if (!entry) throw new Error("Unknown version")
  if (entry.data) return entry.data
  entry.data = await fetch(entry.url).then(e => e.json())
  return entry.data
}

const isBedrockId = id => /^v\d+\.\d+\.\d+\.\d+/.test(id)

async function getVersionJar(id) {
  if (loadedJars[id]) return loadedJars[id]
  let buffer = (await idbGet("jars", id).catch(() => null))?.data
  if (!buffer) {
    const data = await getVersionData(id)
    loadingMessage.value = `Downloading ${id}…`
    progressBytes.value = true
    progressDone.value = 0
    progressTotal.value = 0
    buffer = await fetchBuffer(proxy(data.downloads.client.url), (done, total) => {
      progressDone.value = done
      progressTotal.value = total
    })
    progressBytes.value = false
    progressDone.value = 0
    progressTotal.value = 0
    // the workers read the jar out of IndexedDB themselves; on a first download
    // the put may not have landed yet, so hand this one copy over instead
    freshBuffer = buffer
    idbPut("jars", id, { id, date: Date.now(), size: buffer.byteLength, data: buffer }).then(() => {
      storage.cached = storage.cached.filter(e => e.id !== id)
      storage.cached.unshift({ id, date: Date.now(), size: buffer.byteLength })
      save()
    }).catch(() => {})
  }
  loadingMessage.value = `Loading ${id}…`
  await new Promise(resolve => setTimeout(resolve))
  const parsed = await parseZip(buffer)
  if (isBedrockId(id)) {
    const old = parsed.files
    parsed.files = {}
    for (const [file, data] of Object.entries(old)) {
      parsed.files[file.replace(/^[^\/]+\//, "")] = data
    }
  }
  loadedJars[id] = parsed
  return parsed
}

async function fetchObject(data) {
  if (data.content) return data.content
  let content = await idbGet("objects", data.hash).catch(() => null)
  if (!content) {
    content = await fetchBuffer(proxy(`https://resources.download.minecraft.net/${data.hash.slice(0, 2)}/${data.hash}`))
    idbPut("objects", data.hash, content).catch(() => {})
  }
  data.content = content
  if (isImagePath(data.path)) {
    data.image = createImage(content, data.path)
  }
  return content
}

async function getVersionObjects(id) {
  const entry = getVersion(id)
  if (!entry) return {}
  const data = await getVersionData(id)
  if ((data.type ?? "").includes("bedrock") || !data.assetIndex) return {}
  if (data.objects) return data.objects
  const index = await fetch(data.assetIndex.url).then(e => e.json())
  const root = Date.parse(entry.releaseTime) >= 1403106748000 || data.assets === "1.7.10" ? "assets" : "assets/minecraft"
  const objects = {}
  for (const [file, object] of Object.entries(index.objects)) {
    const packPath = file === "pack.mcmeta" ? file : `${root}/${file}`
    objects[packPath] = { path: packPath, hash: object.hash, size: object.size, object: true }
  }
  const eager = Object.values(objects).filter(e => isImagePath(e.path) || e.path === "pack.mcmeta")
  if (eager.length) {
    loadingMessage.value = `Loading ${id} objects…`
    progressDone.value = 0
    progressTotal.value = eager.length
    for (let i = 0; i < eager.length; i += 32) {
      await Promise.all(eager.slice(i, i + 32).map(async e => {
        try {
          await fetchObject(e)
        } catch {}
        progressDone.value++
      }))
    }
    progressTotal.value = 0
  }
  data.objects = objects
  return objects
}

async function loadVersion(id, startPath = []) {
  loadingMessage.value = `Loading ${id}…`
  progressDone.value = 0
  progressTotal.value = 0
  progressBytes.value = false
  try {
    const parsed = await getVersionJar(id)
    if (!Object.keys(parsed.files).length) {
      throw new Error("It may be corrupted")
    }
    if (storage.objects) {
      const objects = await getVersionObjects(id)
      for (const [k, v] of Object.entries(objects)) {
        parsed.files[k] = v
      }
    }
    const built = {}
    for (const filePath of Object.keys(parsed.files)) {
      const parts = filePath.split("/")
      if (parts[0] === "optifine") continue
      let current = built
      for (const [index, part] of parts.entries()) {
        if (!current[part]) {
          current[part] = index === parts.length - 1 ? filePath : {}
        }
        current = current[part]
      }
    }
    parsed.flipbook = null
    if (built.resource_pack?.textures?.["flipbook_textures.json"]) {
      try {
        parsed.flipbook = JSON.parse(textOf(parsed.files[built.resource_pack.textures["flipbook_textures.json"]].content).replace(/\/\/.*$/gm, ""))
        parsed.flipbook.push({
          flipbook_texture: "textures/flame_atlas"
        })
      } catch {}
    }
    if (storage.recents.includes(id)) {
      storage.recents.splice(storage.recents.indexOf(id), 1)
    }
    storage.recents.unshift(id)
    if (storage.recents.length > 20) {
      storage.recents.length = 20
    }
    save()
    version.value = id
    initialPath.value = startPath
    tree.value = built
    treeTick.value++
    jar.value = parsed
    // bedrock trees have no blockstates/items/models paths, so nothing there
    // ever renders a thumbnail and the pool would only cost memory
    if (isBedrockId(id)) {
      stopThumbnailPool()
    } else {
      startThumbnailPool(id, id, freshBuffer)
    }
    freshBuffer = null
    updateUrlParams(params => {
      params.set("version", id)
      if (storage.objects) {
        params.delete("objects")
      } else {
        params.set("objects", "0")
      }
      if (startPath.length) {
        params.set("path", startPath.join("/"))
      } else {
        params.delete("path")
      }
    })
  } catch (e) {
    console.error(e)
    quickMessage(`Unable to load ${id}. ${e.message ?? e}`)
  }
  loadingMessage.value = null
}

function disposeThumbnails(parsed) {
  if (!parsed?.thumbnailCache) return
  for (const thumb of parsed.thumbnailCache.values()) {
    thumb?.dispose()
  }
  parsed.thumbnailCache.clear()
}

function home() {
  // cached thumbnails are kept across folders while browsing, so free them all here
  for (const job of thumbnailQueue) {
    job.cancelled = true
  }
  for (const parsed of Object.values(loadedJars)) {
    disposeThumbnails(parsed)
  }
  stopThumbnailPool()
  jar.value = null
  version.value = null
  updateUrlParams(params => {
    params.delete("version")
    params.delete("objects")
    params.delete("path")
    params.delete("file")
    params.delete("download")
  })
}

function toggleObjects() {
  storage.objects = !storage.objects
  if (!storage.objects) {
    loadedJars = {}
  }
  save()
}

async function deleteCachedVersion(id) {
  await idbDelete("jars", id).catch(() => {})
  storage.cached = storage.cached.filter(e => e.id !== id)
  save()
}

function hasAnimation(file) {
  const files = jar.value.files
  const data = files[file]
  if (data.animation === false) return false
  if (data.animation) return true
  if (jar.value.flipbook) {
    const split = file.split("/")
    if (split[0] === "resource_pack") {
      const texture = split.slice(1).join("/").slice(0, -4)
      const anim = jar.value.flipbook.find(e => e.flipbook_texture === texture)
      if (anim) {
        data.animation = {
          animation: {
            frametime: anim.ticks_per_frame,
            interpolate: anim.blend_frames ?? true,
            frames: anim.frames
          }
        }
        return true
      }
    }
    data.animation = false
    return false
  }
  const mcmeta = files[file + ".mcmeta"]
  if (mcmeta) {
    try {
      const parsed = JSON.parse(textOf(mcmeta.content))
      if (parsed.animation) {
        data.animation = parsed
        return true
      }
    } catch {}
    data.animation = false
  }
  return false
}

async function getFileContent(file) {
  const data = jar.value.files[file] ?? jar.value.zips?.[file]
  if (!data) return
  if (!data.content && data.object) {
    await fetchObject(data)
  }
  return data.content
}

function assetsSource() {
  const parsed = jar.value
  parsed.assetsSource ??= {
    read: async filePath => {
      const data = parsed.files[filePath] ?? parsed.zips?.[filePath]
      if (data) {
        if (!data.content && data.object) {
          await fetchObject(data)
        }
        return data.content
      }
      if (filePath.endsWith(".mcmeta")) {
        const base = filePath.slice(0, -7)
        if (parsed.files[base] && hasAnimation(base) && parsed.files[base].animation) {
          return JSON.stringify(parsed.files[base].animation)
        }
      }
      return null
    },
    list: dir => {
      let current = tree.value
      for (const part of dir.split("/")) {
        if (!part) continue
        current = current?.[part]
        if (!current || typeof current === "string") return []
      }
      return Object.keys(current).filter(k => typeof current[k] === "string")
    }
  }
  return parsed.assetsSource
}

async function preparedAssets() {
  const parsed = jar.value
  const { prepareAssets } = await loadRenderer()
  return parsed.prepared ??= await prepareAssets(assetsSource())
}

function renderArgs() {
  const args = { width: 128, height: 128, animated: true }
  if (/^\d+\.\d+/.test(version.value)) {
    args.version = version.value
  }
  return args
}

async function renderModelPlayer(path, args) {
  const match = getModelMatch(path)
  if (!match) return null
  const { renderBlock, renderItem, renderModel, DISPLAYS } = await loadRenderer()
  args = { ...renderArgs(), ...args, assets: await preparedAssets() }
  if (match.type === "block") {
    args.display ??= { type: "fallback", rotateFlat: true, ...DISPLAYS.block }
    return renderBlock({ ...args, id: match.id })
  }
  if (match.type === "item") {
    // item definitions resolve to either a sprite or a block model, so keep the
    // flat fallback and let the model's own transform pose the block ones
    args.display ??= { type: "fallback", rotateFlat: true }
    return renderItem({ ...args, id: match.id })
  }
  // block models that declare no gui transform (fence sides, slab tops, stairs
  // pieces) would render face-on and unreadable, so pose those like an
  // inventory block. item sprites are flat in game, so they keep the default
  args.display ??= { type: "fallback", generated: false, rotateFlat: true, ...DISPLAYS.block }
  return renderModel({ ...args, model: JSON.parse(textOf(await getFileContent(path))) })
}

const thumbnailQueue = []
let thumbnailRunning = false

// rendered players are cached per jar and kept as you move between folders, so
// returning to a folder shows its thumbnails instantly; everything is disposed
// only when going home (see home()). jobs render in request order, which is
// top-down as the grid mounts, and a tile scrolled out of view before it
// renders cancels its job, so a fast scroll drops the tiles it flew past and
// the queue catches up to the current view
function renderModelThumbnail(path) {
  const parsed = jar.value
  const cache = parsed.thumbnailCache ??= new Map()
  if (cache.has(path)) {
    return { path, jar: parsed, cancelled: false, started: true, promise: Promise.resolve(cache.get(path)) }
  }
  if (poolActive()) {
    const job = submitThumbnail(path)
    job.jar = parsed
    job.promise = job.promise.then(async thumb => {
      // undefined means the pool never ran it, so fall back rather than
      // caching a miss the tile would show as a bare icon
      if (thumb === undefined) {
        if (job.cancelled || parsed !== jar.value) return null
        thumb = await queueMainThumbnail(job)
      }
      if (parsed !== jar.value) {
        thumb?.dispose()
        return null
      }
      // keep it even if the tile scrolled away, ready for when it returns
      cache.set(path, thumb)
      return thumb
    })
    return job
  }
  const job = { path, jar: parsed, cancelled: false }
  job.promise = queueMainThumbnail(job)
  return job
}

function queueMainThumbnail(job) {
  const promise = new Promise(resolve => job.resolve = resolve)
  job.cancelled = false
  thumbnailQueue.push(job)
  processThumbnails()
  return promise
}

// the worker pool and the main-thread fallback hand back the same shape, so the
// cache and the tiles never care which built a thumbnail
function mainThumb(player) {
  return {
    canvas: player.canvas,
    setVisible: visible => visible ? player.play() : player.pause(),
    dispose: () => player.dispose()
  }
}

function nextThumbnailJob() {
  while (thumbnailQueue.length) {
    const job = thumbnailQueue.shift()
    if (!job.cancelled && job.jar === jar.value) return job
    job.resolve(null)
  }
  return null
}

async function processThumbnails() {
  if (thumbnailRunning) return
  thumbnailRunning = true
  let job
  while (job = nextThumbnailJob()) {
    job.started = true
    let player = null
    try {
      player = await renderModelPlayer(job.path)
    } catch {}
    let thumb = null
    if (player && isBlankRender(player)) {
      // nothing visible to show, so cache the miss and let the icon stand
      player.dispose()
      if (job.jar === jar.value) {
        (job.jar.thumbnailCache ??= new Map()).set(job.path, null)
      }
    } else if (player) {
      if (job.jar === jar.value) {
        // keep it even if the tile scrolled away, ready for when it returns
        thumb = mainThumb(player)
        ;(job.jar.thumbnailCache ??= new Map()).set(job.path, thumb)
      } else {
        player.dispose()
      }
    }
    job.resolve(thumb)
  }
  thumbnailRunning = false
}

async function loadZip(file) {
  const content = await getFileContent(file)
  if (!content) {
    throw new Error(`${file} not found`)
  }
  const zip = await parseZip(content, false)

  const parts = file.split("/")
  let current = tree.value
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]]
  }
  const lastPart = parts[parts.length - 1]
  current[lastPart] = {}
  current = current[lastPart]

  for (const [key, zipFile] of Object.entries(zip.files)) {
    const fullPath = `${file}/${key}`
    jar.value.files[fullPath] = zipFile

    const subParts = key.split("/")
    let subCurrent = current
    for (const [index, subPart] of subParts.entries()) {
      if (!subCurrent[subPart]) {
        subCurrent[subPart] = index === subParts.length - 1 ? fullPath : {}
      }
      subCurrent = subCurrent[subPart]
    }
  }

  jar.value.zips ??= {}
  jar.value.zips[file] = jar.value.files[file]
  delete jar.value.files[file]
  treeTick.value++

  return current
}

async function downloadFiles(currentPath, names) {
  if (names.length === 1) {
    const full = currentPath.concat(names[0]).join("/")
    if (jar.value.files[full] || jar.value.zips?.[full] || names[0].endsWith(".zip")) {
      const content = await getFileContent(full)
      if (content) {
        saveBlob(basename(full), content)
        quickMessage(`Downloaded ${basename(full)}`)
      }
      return
    }
  }

  let current = tree.value
  for (const part of currentPath) {
    current = current[part]
  }

  const exportFiles = new Set()

  function traverse(node, nodePath) {
    for (const key of Object.keys(node)) {
      const newPath = nodePath.concat(key)
      if (typeof node[key] === "string" || key.endsWith(".zip")) {
        exportFiles.add(newPath.join("/"))
      } else {
        traverse(node[key], newPath)
      }
    }
  }

  const start = current
  for (const name of names) {
    current = start
    const parts = name.split("/")
    const last = parts.pop()
    for (const part of parts) {
      current = current[part]
    }
    if (typeof current[last] === "string" || last.endsWith(".zip")) {
      exportFiles.add(name)
    } else {
      traverse(current[last], parts.concat(last))
    }
  }

  const list = Array.from(exportFiles)
  const zipName = (names.length === 1 ? basename(names[0]) : currentPath[currentPath.length - 1] ?? version.value) + ".zip"
  if (!confirm(`Download ${list.length.toLocaleString()} files as ${zipName}?`)) return

  exporting.value = true
  loadingMessage.value = "Preparing files…"
  progressDone.value = 0
  progressTotal.value = list.length

  const alreadyCompressed = /\.(png|jpg|jpeg|ogg|fsb|zip|jar)$/i
  const zipFiles = {}
  for (let i = 0; i < list.length; i += 64) {
    await Promise.all(list.slice(i, i + 64).map(async filePath => {
      try {
        const content = await getFileContent(currentPath.concat(filePath).join("/"))
        if (content) {
          zipFiles[filePath] = alreadyCompressed.test(filePath) ? [content, { level: 0 }] : content
        }
      } catch {}
      progressDone.value++
    }))
  }

  loadingMessage.value = "Creating zip…"
  await new Promise(resolve => setTimeout(resolve))
  const data = zipSync(zipFiles)
  saveBlob(zipName, data, "application/zip")

  exporting.value = false
  loadingMessage.value = null
  progressTotal.value = 0
  quickMessage(`Downloaded ${list.length.toLocaleString()} files`)
}

export function useAssets() {
  return {
    manifest,
    jar,
    tree,
    treeTick,
    version,
    initialPath,
    loadingMessage,
    progressDone,
    progressTotal,
    progressBytes,
    exporting,
    toast,
    quickMessage,
    loadManifest,
    getVersion,
    loadVersion,
    home,
    toggleObjects,
    deleteCachedVersion,
    hasAnimation,
    getFileContent,
    assetsSource,
    preparedAssets,
    renderArgs,
    renderModelPlayer,
    renderModelThumbnail,
    loadZip,
    downloadFiles
  }
}
