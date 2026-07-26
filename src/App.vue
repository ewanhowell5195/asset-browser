<script setup>
import { onMounted } from "vue"
import { useAssets } from "./composables/useAssets.js"
import { useViewer } from "./composables/useViewer.js"
import { basename } from "./lib/path.js"
import { storage } from "./lib/storage.js"
import { saveBlob } from "./lib/util.js"
import VersionIndex from "./components/VersionIndex.vue"
import Browser from "./components/Browser.vue"
import LoadingOverlay from "./components/LoadingOverlay.vue"
import FileViewer from "./components/FileViewer.vue"
import ContextMenu from "./components/ContextMenu.vue"

const { jar, loadingMessage, exporting, toast, loadManifest, loadVersion, loadZip, getFileContent } = useAssets()
const { openViewer } = useViewer()

async function ensureZipLoaded(path) {
  const zip = path.match(/^(.*?\.zip)(?:\/|$)/)
  if (zip && jar.value.files[zip[1]]) {
    await loadZip(zip[1])
  }
}

onMounted(async () => {
  const params = new URLSearchParams(location.search)
  const objects = params.get("objects")
  if (objects !== null) {
    storage.objects = objects !== "0"
  }
  await loadManifest()
  const versionId = params.get("version")
  if (!versionId) return
  const startPath = params.get("path")?.split("/").filter(Boolean) ?? []
  await loadVersion(versionId, startPath)
  if (!jar.value) return
  if (startPath.length) {
    await ensureZipLoaded(startPath.join("/")).catch(() => {})
  }
  const file = params.get("file")
  if (!file) return
  const fullPath = startPath.concat(file.split("/").filter(Boolean)).join("/")
  await ensureZipLoaded(fullPath).catch(() => {})
  if (!jar.value.files[fullPath]) return
  openViewer([{ name: basename(fullPath), path: fullPath }])
  if (params.has("download")) {
    const content = await getFileContent(fullPath)
    if (content) {
      saveBlob(basename(fullPath), content)
    }
  }
})
</script>

<template>
  <VersionIndex v-if="!jar && !loadingMessage" />
  <Browser v-if="jar && (!loadingMessage || exporting)" />
  <LoadingOverlay v-if="loadingMessage" />
  <FileViewer />
  <ContextMenu />
  <div v-if="toast" class="quick-message">{{ toast }}</div>
</template>
