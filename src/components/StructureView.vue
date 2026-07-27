<script setup>
import { onBeforeUnmount, ref, watch } from "vue"
import { useAssets } from "../composables/useAssets.js"
import { zipPrefix, zipPrefixChain } from "../lib/models.js"
import { basename } from "../lib/path.js"

const props = defineProps({
  path: { type: String, required: true }
})

const { jar, version, zipUrl, getFileContent } = useAssets()

const VIEWER = import.meta.env.VITE_VIEWER_URL ?? "https://structure-viewer.ewanhowell.com/"
const SOURCE = "structure-viewer"
const STRUCTURE_RE = /^data\/([^/]+)\/structures?\/(.+)\.nbt$/i

const frame = ref(null)
const error = ref("")

let loadedStack = ""
let nextId = 1
const pending = new Map()

function send(type, body = {}, transfer = []) {
  const id = nextId++
  const done = new Promise(resolve => pending.set(id, resolve))
  frame.value?.contentWindow?.postMessage({ source: SOURCE, type, id, ...body }, "*", transfer)
  return done
}

function onMessage(event) {
  const message = event.data
  if (message?.source !== SOURCE || event.source !== frame.value?.contentWindow) return
  if (message.event === "ready") {
    loadedStack = ""
    return load()
  }
  const resolve = pending.get(message.reply)
  if (resolve) {
    pending.delete(message.reply)
    resolve(message)
  }
}

async function sources(prefix) {
  const chain = zipPrefixChain(prefix)
  const packs = []
  for (const layer of chain.slice(0, -1)) {
    const bytes = await getFileContent(layer.slice(0, -1))
    if (bytes) packs.push({ name: basename(layer.slice(0, -1)), data: bytes.slice().buffer })
  }
  return { base: jar.value?.buffer?.slice().buffer, packs }
}

async function load() {
  error.value = ""
  const path = props.path
  const prefix = zipPrefix(path)
  const stack = [version.value, zipUrl.value, prefix].join("|")

  if (stack !== loadedStack) {
    const { base, packs } = await sources(prefix)
    if (path !== props.path) return
    if (!base) return error.value = "couldn't read the pack"
    const transfer = [base, ...packs.map(p => p.data)]
    const packed = await send("loadPacks", { base, packs }, transfer)
    if (path !== props.path) return
    if (!packed?.ok) return error.value = packed?.error ?? "couldn't load the assets"
    loadedStack = stack
  }

  const match = path.slice(prefix.length).match(STRUCTURE_RE)
  if (match) {
    const loaded = await send("loadStructure", { path: `${match[1]}/${match[2]}` })
    if (path !== props.path) return
    if (loaded?.ok) return
  }

  const content = await getFileContent(path)
  if (path !== props.path) return
  if (!content) return error.value = "couldn't read the structure"
  const copy = content.slice().buffer
  const loaded = await send("loadStructure", { data: copy, name: basename(path) }, [copy])
  if (path !== props.path) return
  if (!loaded?.ok) error.value = loaded?.error ?? "couldn't load the structure"
}

addEventListener("message", onMessage)
onBeforeUnmount(() => removeEventListener("message", onMessage))

watch(() => props.path, () => {
  if (frame.value?.contentWindow) load()
})
</script>

<template>
  <div id="structure-view">
    <iframe ref="frame" :src="`${VIEWER}?minimal&manual`" allow="fullscreen"></iframe>
    <div v-if="error" class="structure-error">{{ error }}</div>
  </div>
</template>

<style scoped>
#structure-view {
  position: relative;
  align-self: stretch;
  flex: 1;
  min-height: 400px;
  display: flex;
}

iframe {
  width: 100%;
  border: none;
  background-color: var(--color-frame);
}

.structure-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  color: var(--color-subtle_text);
  background-color: var(--color-frame);
}
</style>
