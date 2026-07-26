<script setup>
import { computed, reactive, ref, watch } from "vue"
import { useAssets } from "../composables/useAssets.js"
import { useContextMenu } from "../composables/useContextMenu.js"
import { storage, save } from "../lib/storage.js"
import { getVersionIcon } from "../lib/icons.js"
import { formatBytes } from "../lib/util.js"

const { manifest, loadManifest, loadVersion, toggleObjects, deleteCachedVersion } = useAssets()
const { openMenu } = useContextMenu()

const type = ref(storage.type ?? "release")
const versionSearch = ref("")
const selectedVersions = reactive({})

watch(() => manifest.loaded, () => {
  for (const t of Object.keys(manifest.types)) {
    selectedVersions[t] ??= manifest.versions.find(e => e.type === t)?.id
  }
}, { immediate: true })

const typeVersions = computed(() => manifest.versions.filter(e => e.type === type.value))

const filteredCached = computed(() => storage.cached.filter(e => e.id.toLowerCase().includes(versionSearch.value)))
const filteredRecents = computed(() => storage.recents.filter(id => id.toLowerCase().includes(versionSearch.value)))

function load() {
  const id = selectedVersions[type.value]
  if (!id) return
  storage.type = type.value
  save()
  loadVersion(id)
}

function cachedContextMenu(entry, event) {
  openMenu(event, [
    {
      name: "Load",
      icon: "folder_open",
      click: () => loadVersion(entry.id)
    },
    "_",
    {
      name: "Remove Download",
      icon: "delete",
      click: () => deleteCachedVersion(entry.id)
    }
  ])
}

function recentContextMenu(id, event) {
  openMenu(event, [
    {
      name: "Load",
      icon: "folder_open",
      click: () => loadVersion(id)
    },
    "_",
    {
      name: "Remove from Recents",
      icon: "delete",
      click: () => {
        storage.recents.splice(storage.recents.indexOf(id), 1)
        save()
      }
    }
  ])
}
</script>

<template>
  <div id="index-page">
    <div id="index">
      <div id="index-title">
        <h1>Asset Browser</h1>
        <p>Browse, view, and download the Minecraft vanilla assets, straight from your browser.</p>
      </div>
      <template v-if="manifest.loaded">
        <div class="index-row">
          <div class="index-column">
            <div class="index-heading">Release Type</div>
            <select v-model="type">
              <option v-for="(label, id) in manifest.types" :value="id">{{ label }}</option>
            </select>
          </div>
          <div class="index-column">
            <div class="index-heading">Minecraft Version</div>
            <select v-model="selectedVersions[type]">
              <option v-for="entry in typeVersions" :value="entry.id">{{ entry.id }}</option>
            </select>
          </div>
        </div>
        <button @click="load">Load Assets</button>
        <hr>
        <div id="version-search">
          <input type="text" placeholder="Filter…" v-model="versionSearch" ref="entry" @input="versionSearch = versionSearch.toLowerCase()">
          <i class="material-icons" :class="{ active: versionSearch }" @click="versionSearch = ''; $refs.entry.focus()">{{ versionSearch ? "clear" : "search" }}</i>
        </div>
        <div class="index-row" style="flex: 1;">
          <div class="index-column">
            <div class="index-heading">Downloaded Versions</div>
            <div class="version-list">
              <template v-if="filteredCached.length">
                <div v-for="entry in filteredCached" class="version" :title="formatBytes(entry.size)" @click="loadVersion(entry.id)" @contextmenu="cachedContextMenu(entry, $event)">
                  <span v-html="getVersionIcon(entry.id)"></span>
                  <span>{{ entry.id }}</span>
                </div>
              </template>
              <div v-else class="no-results">No downloaded versions</div>
            </div>
          </div>
          <hr>
          <div class="index-column">
            <div class="index-heading">Recently Viewed</div>
            <div class="version-list">
              <template v-if="filteredRecents.length">
                <div v-for="id in filteredRecents" class="version" @click="loadVersion(id)" @contextmenu="recentContextMenu(id, $event)">
                  <span v-html="getVersionIcon(id)"></span>
                  <span>{{ id }}</span>
                </div>
              </template>
              <div v-else class="no-results">No recently viewed versions</div>
            </div>
          </div>
        </div>
        <hr>
        <label class="checkbox-row">
          <input type="checkbox" :checked="storage.objects" @input="toggleObjects">
          <div>Include objects (sounds, languages, panorama, etc…)</div>
        </label>
      </template>
      <div v-else-if="manifest.error" id="index-message">
        <p>{{ manifest.error }}</p>
        <button @click="loadManifest">Retry</button>
      </div>
      <div v-else id="index-message">Loading version list…</div>
      <div id="index-footer">
        <a href="https://ewanhowell.com/" target="_blank">By Ewan Howell</a>
        <a href="https://discord.ewanhowell.com/" target="_blank">Discord Server</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
#index-page {
  height: 100%;
  display: flex;
  justify-content: center;
  padding: 24px;
  overflow-y: auto;
}

#index {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 816px;
  height: 100%;
  min-height: 480px;
  background-color: var(--color-ui);
  padding: 16px 20px;
  box-shadow: 0 4px 24px #00000040;
}

#index-title h1 {
  margin: 0;
  font-size: 28px;
  color: var(--color-light);
}

#index-title p {
  margin: 4px 0 0;
  color: var(--color-subtle_text);
}

.index-row {
  display: flex;
  gap: 16px;
  overflow-y: auto;
  min-height: 0;
}

.index-row > hr {
  height: auto;
  width: 1px;
}

.index-column {
  flex: 1;
  display: flex;
  gap: 8px;
  flex-direction: column;
  min-width: 0;
}

.index-heading {
  font-size: 24px;
}

.version-list {
  overflow-y: auto;
}

.version {
  cursor: pointer;
  padding: 6px 8px;
  min-height: 30px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  line-height: 1;
}

.version:hover,
.version.context-open {
  background-color: var(--color-selected);
  color: var(--color-light);
}

.version span {
  display: flex;
  align-items: center;
}

.version :deep(.material-icons) {
  font-size: 20px;
}

.version :deep(svg) {
  height: 18px;
  width: 18px;
}

.no-results {
  color: var(--color-subtle_text);
}

#version-search {
  position: relative;
}

#version-search input {
  width: 100%;
  padding-right: 32px;
}

#version-search i {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

#version-search i.active {
  cursor: pointer;
  pointer-events: initial;
}

.checkbox-row {
  display: flex;
  gap: 8px;
  align-items: center;
  cursor: pointer;
  line-height: 1;
}

.checkbox-row * {
  cursor: pointer;
}

#index-message {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-subtle_text);
  font-size: 20px;
}

#index-footer {
  display: flex;
  justify-content: center;
  gap: 24px;
}
</style>
