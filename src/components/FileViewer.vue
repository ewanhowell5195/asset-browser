<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { useViewer } from "../composables/useViewer.js"
import { useAssets } from "../composables/useAssets.js"
import { useContextMenu } from "../composables/useContextMenu.js"
import { textOf } from "../lib/zip.js"
import { basename, dirname, extname } from "../lib/path.js"
import { formatBytes, saveBlob, isBlankRender } from "../lib/util.js"
import { buildLink, updateUrlParams } from "../lib/url.js"
import { getModelMatch } from "../lib/models.js"
import { inlineHtml, resolvePath, OPEN_MESSAGE } from "../lib/html.js"
import AnimatedTexture from "./AnimatedTexture.vue"

const { viewer, openViewer, closeViewer } = useViewer()
const { jar, version, zipUrl, hasAnimation, getFileContent, renderModelPlayer, quickMessage } = useAssets()
const { openMenu } = useContextMenu()

const textExtensions = [".json", ".mcmeta", ".txt", ".cfg", ".properties", ".lang", ".glsl", ".vsh", ".fsh", ".html"]

const current = computed(() => viewer.files[viewer.index])

const kind = computed(() => {
  if (!current.value) return null
  const ext = extname(current.value.name).toLowerCase()
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") return "image"
  if (ext === ".ogg") return "audio"
  if (textExtensions.includes(ext) || !ext) return "text"
  return "none"
})

const isHtml = computed(() => /\.html?$/i.test(current.value?.name ?? ""))
const htmlTab = ref("preview")
const htmlDoc = ref(null)
const htmlFrame = ref(null)

// the frame is sandboxed into an opaque origin, so a link it can't follow comes
// back as a message and the viewer moves to that file instead
function followFrameLink(event) {
  if (event.source !== htmlFrame.value?.contentWindow) return
  if (event.data?.type !== OPEN_MESSAGE || !current.value) return
  const dir = dirname(current.value.path)
  const path = resolvePath(dir === "." ? "" : dir, event.data.href)
  if (!path) return
  if (!jar.value?.files[path]) {
    quickMessage(`${basename(path)} is not in this pack`)
    return
  }
  openViewer([{ name: basename(path), path }])
}

addEventListener("message", followFrameLink)
onBeforeUnmount(() => removeEventListener("message", followFrameLink))

const copied = ref(false)
const loading = ref(false)
const textContent = ref(null)

let copiedTimeout
const audioUrl = ref(null)
const size = ref(0)
const dimensions = ref(null)
const modelPreview = ref(false)
const modelPreviewEl = ref(null)
const image = computed(() => jar.value?.files[current.value?.path]?.image)
const animation = computed(() => {
  if (!current.value || kind.value !== "image") return null
  return hasAnimation(current.value.path) ? jar.value.files[current.value.path].animation : null
})

let modelPlayer

function disposeModel() {
  modelPlayer?.dispose?.()
  modelPlayer = null
  modelPreview.value = false
}

async function renderModelPreview(file) {
  if (!getModelMatch(file.path)) return
  try {
    const player = await renderModelPlayer(file.path, { width: 256, height: 256 })
    if (!player) return
    if (file !== current.value || isBlankRender(player)) {
      player.dispose()
      return
    }
    modelPlayer = player
    modelPreview.value = true
    await nextTick()
    player.canvas.classList.add("checkerboard")
    modelPreviewEl.value?.append(player.canvas)
  } catch (e) {
    console.warn("Model preview failed:", e)
  }
}

watch(current, async file => {
  textContent.value = null
  htmlDoc.value = null
  htmlTab.value = "preview"
  dimensions.value = null
  size.value = 0
  copied.value = false
  clearTimeout(copiedTimeout)
  disposeModel()
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = null
  }
  if (!file) return
  loading.value = true
  try {
    const content = await getFileContent(file.path)
    if (file !== current.value) return
    if (!content) throw new Error("no content")
    size.value = content.length
    if (kind.value === "text") {
      let text = textOf(content)
      if (/\.(json|mcmeta)$/i.test(file.name)) {
        try {
          text = JSON.stringify(JSON.parse(text), null, 2)
        } catch {}
      }
      textContent.value = text
      if (isHtml.value) {
        const dir = dirname(file.path)
        inlineHtml(text, dir === "." ? "" : dir, getFileContent)
          .then(doc => {
            if (file === current.value) htmlDoc.value = doc
          })
          .catch(() => {
            if (file === current.value) htmlDoc.value = text
          })
      }
      renderModelPreview(file)
    } else if (kind.value === "audio") {
      audioUrl.value = URL.createObjectURL(new Blob([content], { type: "audio/ogg" }))
    } else if (kind.value === "image") {
      const img = jar.value.files[file.path].image
      if (img && !img.complete) {
        try {
          await img.decode()
        } catch {}
      }
      if (img?.naturalWidth) {
        dimensions.value = [img.naturalWidth, img.naturalHeight]
      }
    }
  } catch {
    if (kind.value === "text") textContent.value = "Unable to load file"
  }
  loading.value = false
}, { immediate: true })

async function download() {
  const content = await getFileContent(current.value.path)
  if (content) {
    saveBlob(current.value.name, content)
  }
}

const downloadUrl = computed(() => {
  if (!current.value) return "#"
  const dir = dirname(current.value.path)
  return buildLink({
    version: version.value,
    zip: zipUrl.value,
    path: dir === "." ? "" : dir,
    file: basename(current.value.path),
    download: true
  })
})

function downloadClick(event) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  download()
}

function downloadContextMenu(event) {
  const link = location.origin + downloadUrl.value
  openMenu(event, [
    {
      name: "Download",
      icon: "download",
      click: download
    },
    {
      name: "Copy Link",
      icon: "link",
      click: () => {
        navigator.clipboard.writeText(link)
        quickMessage("Link copied")
      }
    }
  ])
}


function copyText() {
  navigator.clipboard.writeText(textContent.value ?? "")
  copied.value = true
  clearTimeout(copiedTimeout)
  copiedTimeout = setTimeout(() => copied.value = false, 3000)
}

watch(() => [viewer.open, current.value?.path], () => {
  updateUrlParams(params => {
    params.delete("download")
    if (viewer.open && current.value) {
      const full = current.value.path
      const dir = params.get("path")
      if (dir && full.startsWith(dir + "/")) {
        params.set("file", full.slice(dir.length + 1))
      } else {
        const fileDir = dirname(full)
        if (fileDir === ".") {
          params.delete("path")
        } else {
          params.set("path", fileDir)
        }
        params.set("file", basename(full))
      }
    } else {
      params.delete("file")
    }
  })
})

function move(direction) {
  viewer.index = (viewer.index + direction + viewer.files.length) % viewer.files.length
}

watch(() => viewer.open, open => {
  if (!open) disposeModel()
})

onBeforeUnmount(disposeModel)

addEventListener("keydown", e => {
  if (!viewer.open) return
  if (e.key === "Escape") {
    e.stopPropagation()
    closeViewer()
  } else if (e.key === "ArrowLeft" && viewer.files.length > 1) {
    e.stopPropagation()
    move(-1)
  } else if (e.key === "ArrowRight" && viewer.files.length > 1) {
    e.stopPropagation()
    move(1)
  }
}, true)
</script>

<template>
  <div v-if="viewer.open && current" id="file-viewer" @pointerdown.self="closeViewer">
    <div id="file-viewer-panel" :class="{ wide: kind === 'text' }">
      <header>
        <div id="file-viewer-title" :title="current.path">
          <div>{{ current.name }}</div>
          <div v-if="kind === 'image' && dimensions">{{ dimensions.join(" x ") }}<template v-if="size"> - {{ formatBytes(size) }}</template></div>
          <div v-else-if="size">{{ formatBytes(size) }}</div>
        </div>
        <div v-if="viewer.files.length > 1" id="file-viewer-nav">
          <i class="material-icons" @click="move(-1)">chevron_left</i>
          <span>{{ viewer.index + 1 }} / {{ viewer.files.length }}</span>
          <i class="material-icons" @click="move(1)">chevron_right</i>
        </div>
        <div v-if="isHtml && kind === 'text'" id="file-viewer-tabs">
          <div :class="{ active: htmlTab === 'preview' }" @click="htmlTab = 'preview'">Preview</div>
          <div :class="{ active: htmlTab === 'code' }" @click="htmlTab = 'code'">Code</div>
        </div>
        <div id="file-viewer-actions">
          <i v-if="kind === 'text' && textContent && !(isHtml && htmlTab === 'preview')" class="material-icons" :class="{ copied }" :title="copied ? 'Copied' : 'Copy'" @click="copyText">{{ copied ? "check" : "content_copy" }}</i>
          <a :href="downloadUrl" title="Download" @click="downloadClick" @contextmenu="downloadContextMenu">
            <i class="material-icons">download</i>
          </a>
          <i class="material-icons" title="Close" @click="closeViewer">close</i>
        </div>
      </header>
      <div id="file-viewer-content">
        <div v-if="loading" class="file-viewer-message">Loading…</div>
        <template v-else-if="kind === 'image' && image">
          <div id="file-viewer-image" :style="dimensions ? { aspectRatio: `${dimensions[0]} / ${dimensions[1]}` } : {}">
            <AnimatedTexture v-if="animation" :key="current.path" :path="current.path" />
            <img v-else :src="image.src" class="checkerboard">
          </div>
        </template>
        <iframe v-else-if="kind === 'text' && isHtml && htmlTab === 'preview' && htmlDoc" :key="current.path" id="file-viewer-html" ref="htmlFrame" :srcdoc="htmlDoc" sandbox="allow-scripts allow-popups"></iframe>
        <div v-else-if="kind === 'text'" id="file-viewer-text">
          <div v-show="modelPreview" id="model-preview" ref="modelPreviewEl"></div>
          <pre>{{ textContent }}</pre>
        </div>
        <audio v-else-if="kind === 'audio' && audioUrl" :src="audioUrl" controls autoplay></audio>
        <div v-else class="file-viewer-message">
          <span>No preview available for this file type</span>
          <a class="download-button" :href="downloadUrl" @click="downloadClick" @contextmenu="downloadContextMenu">Download</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
#file-viewer {
  position: fixed;
  inset: 0;
  z-index: 120;
  background-color: #0006;
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

#file-viewer-panel {
  background-color: var(--color-ui);
  box-shadow: 0 10px 40px #00000080;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 80px);
  max-height: calc(100vh - 80px);
  min-width: 320px;
}

#file-viewer-panel.wide {
  width: 816px;
}

header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  background-color: var(--color-back);
}

#file-viewer-title {
  flex: 1;
  min-width: 0;
}

#file-viewer-title > div:first-child {
  font-weight: 600;
  color: var(--color-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#file-viewer-title > div:nth-child(2) {
  font-size: 13px;
  color: var(--color-subtle_text);
}

#file-viewer-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-subtle_text);
}

#file-viewer-nav i,
#file-viewer-actions i {
  cursor: pointer;
  padding: 4px;
}

#file-viewer-nav i:hover,
#file-viewer-actions i:hover,
#file-viewer-actions a.context-open i {
  color: var(--color-light);
  background-color: var(--color-selected);
}

#file-viewer-actions {
  display: flex;
  align-items: center;
}

#file-viewer-actions i.copied {
  color: var(--color-accent);
}

#file-viewer-actions a {
  color: inherit;
  display: flex;
}

#file-viewer-actions a:hover {
  text-decoration: none;
}

.download-button {
  background-color: var(--color-button);
  color: var(--color-text);
  padding: 6px 16px;
}

.download-button:hover,
.download-button.context-open {
  background-color: var(--color-accent);
  color: var(--color-light);
  text-decoration: none;
}

#file-viewer-content {
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 128px;
  padding: 16px;
}

#file-viewer-image {
  max-width: 100%;
  max-height: calc(100vh - 200px);
  min-width: 128px;
  min-height: 128px;
  display: flex;
  align-items: center;
  justify-content: center;
}

#file-viewer-image img,
#file-viewer-image :deep(.animated-texture),
#file-viewer-image :deep(canvas) {
  image-rendering: pixelated;
  max-width: min(70vw, 640px);
  max-height: calc(100vh - 200px);
  width: 100%;
  height: 100%;
  object-fit: contain;
}

#file-viewer-tabs {
  display: flex;
  gap: 2px;
}

#file-viewer-tabs > div {
  padding: 4px 12px;
  cursor: pointer;
  color: var(--color-text);
  background-color: var(--color-button);
}

#file-viewer-tabs > div:hover {
  color: var(--color-light);
}

#file-viewer-tabs > div.active {
  color: var(--color-light);
  background-color: var(--color-selected);
}

#file-viewer-html {
  align-self: stretch;
  /* the ua stylesheet sets an explicit 300px, so stretch alone won't widen it */
  width: 100%;
  /* an iframe has no intrinsic height, so flex alone would collapse it */
  height: calc(100vh - 200px);
  border: none;
  background-color: #fff;
}

#file-viewer-text {
  align-self: stretch;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  max-height: calc(100vh - 200px);
}

#model-preview {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}

#model-preview :deep(canvas) {
  width: 256px;
  height: 256px;
  image-rendering: auto;
}

pre {
  user-select: text;
  cursor: text;
  margin: 0;
  flex: 1;
  min-height: 64px;
  font-family: Consolas, "Courier New", monospace;
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  background-color: var(--color-back);
  padding: 12px;
  overflow: auto;
}

.file-viewer-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-subtle_text);
  padding: 24px;
}
</style>
