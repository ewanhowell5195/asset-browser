<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useAssets } from "../composables/useAssets.js"
import { useContextMenu } from "../composables/useContextMenu.js"
import { useViewer } from "../composables/useViewer.js"
import { storage, save, defaultSavedFolders } from "../lib/storage.js"
import { basename, dirname, extname } from "../lib/path.js"
import { naturalSorter } from "../lib/natsort.js"
import { getFileIcon, getFolderIcon, iconHTML } from "../lib/icons.js"
import { getFileLabel } from "../lib/labels.js"
import { getModelMatch } from "../lib/models.js"
import { absoluteLink, updateUrlParams } from "../lib/url.js"
import LazyScroller from "./LazyScroller.vue"
import AnimatedTexture from "./AnimatedTexture.vue"
import ModelThumbnail from "./ModelThumbnail.vue"

const {
  jar, tree, treeTick, version, initialPath,
  hasAnimation, loadZip, downloadFiles, home, quickMessage
} = useAssets()
const { menu, openMenu } = useContextMenu()
const { viewer, openViewer } = useViewer()

const path = ref(initialPath.value.slice())
const navigationHistory = ref([path.value.slice()])
const navigationFuture = ref([])
const selected = ref([])
const lastInteracted = ref(null)
const shiftStartItem = ref(null)
const sidebarVisible = ref(true)
const displayType = ref(storage.display ?? "grid")
const sort = ref("name")
const sortDirection = ref("forwards")
const searchOpen = ref(false)
const searchText = ref("")
const validSavedFolders = ref([])
const activeSavedFolder = ref(null)
const breadcrumbsOverflowing = ref(false)
const renameTarget = ref(null)
const renameName = ref("")
const renameIcon = ref("")

const filesRef = ref(null)
const searchInput = ref(null)
const navigationEl = ref(null)
const homeButtonEl = ref(null)
const breadcrumbsEl = ref(null)

let searchTimeout
let lastArrowKeyPress = 0
let typeFindText = ""
let typeFindLastKey = 0
let typeFindStart = 0

const folderView = computed(() => {
  treeTick.value
  const files = jar.value.files
  const search = searchOpen.value ? searchText.value.trim().toLowerCase() : ""
  const meta = {}
  let current

  if (search) {
    current = {}
    const currentFolder = path.value.join("/") + "/"
    const folders = new Set
    for (const k of Object.keys(files)) {
      folders.add(dirname(k))
      if (k.startsWith(currentFolder) || currentFolder === "/") {
        let relativePath = k
        if (currentFolder !== "/") {
          relativePath = k.slice(currentFolder.length)
        }
        if (relativePath.toLowerCase().includes(search)) {
          current[relativePath] = k
          meta[relativePath] = {
            label: getFileLabel(jar.value, k, k),
            dimensions: getImageDimensions(k)
          }
        }
      }
    }
    for (const folder of folders) {
      if (folder === ".") continue
      if (folder.startsWith(currentFolder) || currentFolder === "/") {
        let relativePath = folder
        if (currentFolder !== "/") {
          relativePath = folder.slice(currentFolder.length)
        }
        if (relativePath.toLowerCase().includes(search)) {
          let content = tree.value
          let valid = true
          for (const part of folder.split("/")) {
            content = content?.[part]
            if (!content || typeof content === "string") {
              valid = false
              break
            }
          }
          if (valid) {
            current[relativePath] = content
            meta[relativePath] = {
              label: getFileLabel(jar.value, folder, content)
            }
          }
        }
      }
    }
  } else {
    current = tree.value
    for (const part of path.value) {
      current = current[part]
      if (!current || typeof current === "string") {
        current = {}
        break
      }
    }
    for (const [k, v] of Object.entries(current)) {
      meta[k] = {
        label: getFileLabel(jar.value, path.value.concat(k).join("/"), v),
        dimensions: typeof v === "object" ? undefined : getImageDimensions(v)
      }
    }
  }

  const count = Object.keys(current).length
  if (count > 4000) {
    return { entries: [], message: "Too many results, try narrowing your search", count }
  } else if (!count) {
    return { entries: [], message: "No results", count }
  }

  let entries

  if (search && sort.value === "name") {
    entries = Object.entries(current).sort(([ka, va], [kb, vb]) => {
      ka = ka.toLowerCase()
      kb = kb.toLowerCase()

      const isFolderA = typeof va === "object"
      const isFolderB = typeof vb === "object"

      const extA = extname(ka)
      const extB = extname(kb)
      const baseA = basename(ka, extA)
      const baseB = basename(kb, extB)

      if (baseA === search && baseB === search) {
        if (isFolderA !== isFolderB) return isFolderA ? 1 : -1
        return naturalSorter(ka, kb)
      }
      if (baseA === search) return -1
      if (baseB === search) return 1

      const aIndex = ka.lastIndexOf(search)
      const bIndex = kb.lastIndexOf(search)

      const slashCount = (ka.slice(aIndex + search.length).match(/\//g)?.length ?? 0) - (kb.slice(bIndex + search.length).match(/\//g)?.length ?? 0)
      if (slashCount !== 0) {
        return slashCount
      }

      const aBefore = ka.slice(0, aIndex).lastIndexOf("/")
      const aAfter = ka.slice(aIndex + search.length).indexOf("/")
      const aSection = basename(ka.slice(
        aBefore === -1 ? 0 : aBefore + 1,
        aIndex + search.length + (aAfter === -1 ? Infinity : aAfter)
      ), extA)

      const bBefore = kb.slice(0, bIndex).lastIndexOf("/")
      const bAfter = kb.slice(bIndex + search.length).indexOf("/")
      const bSection = basename(kb.slice(
        bBefore === -1 ? 0 : bBefore + 1,
        bIndex + search.length + (bAfter === -1 ? Infinity : bAfter)
      ), extB)

      if (aSection.startsWith(search)) {
        if (bSection.startsWith(search)) {
          const beforeSlashCount = (ka.slice(0, aIndex).match(/\//g)?.length ?? 0) - (kb.slice(0, bIndex).match(/\//g)?.length ?? 0)
          if (beforeSlashCount !== 0) return beforeSlashCount
          return naturalSorter(aSection, bSection)
        }
        return -1
      }
      if (bSection.startsWith(search)) return 1

      return naturalSorter(aSection, bSection)
    })
    if (sortDirection.value === "backwards") {
      entries.reverse()
    }
  } else {
    entries = Object.entries(current).sort(([ka, va], [kb, vb]) => {
      const la = ka.toLowerCase()
      const lb = kb.toLowerCase()

      const isFolderA = typeof va === "object" || la.endsWith(".zip")
      const isFolderB = typeof vb === "object" || lb.endsWith(".zip")
      if (sort.value === "size") {
        if (isFolderA && !isFolderB) return 1
        if (isFolderB && !isFolderA) return -1
      } else {
        if (isFolderA && !isFolderB) return -1
        if (isFolderB && !isFolderA) return 1
      }
      if (sort.value === "size") {
        const dimsA = meta[ka].dimensions
        const dimsB = meta[kb].dimensions

        if (dimsA && !dimsB) return -1
        if (dimsB && !dimsA) return 1

        if (dimsA && dimsB) {
          const areaA = dimsA[0] * dimsA[1]
          const areaB = dimsB[0] * dimsB[1]
          if (areaA !== areaB) {
            return sortDirection.value === "forwards" ? areaB - areaA : areaA - areaB
          }
        }
      } else if (sort.value === "type") {
        const labelA = meta[ka].label
        const labelB = meta[kb].label

        if (labelA && !labelB) return -1
        if (labelB && !labelA) return 1

        if (labelA && labelB) {
          const result = sortDirection.value === "forwards" ? naturalSorter(labelA, labelB) : naturalSorter(labelB, labelA)
          if (result) return result
        }
      }
      return sortDirection.value === "forwards" ? naturalSorter(la, lb) : naturalSorter(lb, la)
    })
  }

  return { entries: entries.map(([k, v]) => [k, v, meta[k]]), message: null, count }
})

watch(folderView, view => {
  lastInteracted.value = view.entries[0]?.[0]
  selected.value = []
})

function getImageDimensions(file) {
  const img = jar.value.files[file]?.image
  if (img?.naturalWidth) {
    return [img.naturalWidth, img.naturalHeight]
  }
}

function select(file, value, event) {
  if (event.currentTarget.dataset.lastClick) {
    if (Date.now() - Number(event.currentTarget.dataset.lastClick) < 500) {
      if (typeof value === "object") {
        return openFolder(path.value.concat(file))
      } else {
        return openFiles()
      }
    }
  }
  event.currentTarget.dataset.lastClick = Date.now()

  const keys = folderView.value.entries.map(entry => entry[0])

  if (!event.shiftKey) {
    shiftStartItem.value = null
  }
  if (event.shiftKey) {
    if (!shiftStartItem.value) {
      shiftStartItem.value = lastInteracted.value
    }
    const start = keys.indexOf(shiftStartItem.value)
    const wasSelected = selected.value.includes(shiftStartItem.value)
    const end = keys.indexOf(file)
    const range = keys.slice(Math.min(start, end), Math.max(start, end) + 1)
    if (event.ctrlKey || event.metaKey) {
      if (wasSelected) {
        selected.value = Array.from(new Set(selected.value.concat(range)))
      } else {
        selected.value = selected.value.filter(e => !range.includes(e))
      }
    } else {
      selected.value = range
    }
  } else if (event.ctrlKey || event.metaKey) {
    const index = selected.value.indexOf(file)
    if (index !== -1) {
      selected.value.splice(index, 1)
    } else {
      selected.value.push(file)
    }
  } else {
    selected.value = [file]
  }

  lastInteracted.value = file
}

async function openFilesCheck() {
  if (selected.value.length <= 16) return true
  if (!confirm(`You are about to open ${selected.value.length.toLocaleString()} files. Are you sure you want to continue?`)) return false
  if (selected.value.length > 128) {
    if (!confirm(`Are you really sure? ${selected.value.length.toLocaleString()} files is a lot. Are you absolutely sure you want to continue?`)) return false
  }
  return true
}

async function openFiles() {
  if (!(await openFilesCheck())) return
  const viewerFiles = []
  for (const name of selected.value) {
    const full = path.value.concat(name).join("/")
    if (name.endsWith(".zip") && jar.value.files[full]) {
      await loadZip(full)
      if (selected.value.length === 1) {
        openFolder(path.value.concat(name))
      }
      continue
    }
    if (!jar.value.files[full]) {
      if (selected.value.length === 1) {
        openFolder(path.value.concat(name))
      }
      continue
    }
    viewerFiles.push({ name: basename(full), path: full })
  }
  if (viewerFiles.length) {
    openViewer(viewerFiles)
  }
}

function getDetailedSelection() {
  const currentFolder = path.value.join("/")
  const details = selected.value.map(name => {
    const full = currentFolder ? currentFolder + "/" + name : name
    const isFolder = !jar.value.files[full] || name.endsWith(".zip")
    const dir = dirname(full)
    return {
      name,
      path: full,
      folder: dir === "." ? "" : dir,
      type: isFolder ? "folder" : "file"
    }
  })
  const hasFolder = details.some(e => e.type === "folder")
  const hasFile = details.some(e => e.type === "file")
  return [details, hasFolder && hasFile ? "multi" : hasFolder ? "folder" : "file"]
}

async function openSelectedFolder(detail) {
  if (detail.name.endsWith(".zip") && jar.value.files[detail.path]) {
    await loadZip(detail.path)
  }
  openFolder(path.value.concat(detail.name))
}

function openFolder(newPath) {
  newPath = newPath.flatMap(e => e.split("/"))
  if (JSON.stringify(newPath) !== JSON.stringify(path.value)) {
    changeFolder(newPath)
    navigationHistory.value.push(newPath.slice())
    navigationFuture.value = []
  }
}

function changeFolder(newPath) {
  searchOpen.value = false
  searchText.value = ""
  path.value = newPath.slice()
  getValidSavedFolders()
  if (filesRef.value?.viewport) {
    filesRef.value.viewport.scrollTop = 0
  }
  nextTick(() => {
    checkBreadcrumbsOverflow()
    filesRef.value?.onResize()
  })
}

function navigationSearch(item) {
  searchOpen.value = true
  searchText.value = item.search
  path.value = item.path.slice()
}

function navigationBack() {
  navigationFuture.value.push(navigationHistory.value.pop())
  const prev = navigationHistory.value[navigationHistory.value.length - 1]
  if (Array.isArray(prev)) {
    changeFolder(prev)
  } else {
    navigationSearch(prev)
  }
}

function navigationForward() {
  navigationHistory.value.push(navigationFuture.value.pop())
  const next = navigationHistory.value[navigationHistory.value.length - 1]
  if (Array.isArray(next)) {
    changeFolder(next)
  } else {
    navigationSearch(next)
  }
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  makeSearch()
  if (searchOpen.value) {
    setTimeout(() => searchInput.value?.focus(), 0)
  }
}

function makeSearch() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    const search = searchOpen.value ? searchText.value.trim().toLowerCase() : ""
    const prev = navigationHistory.value[navigationHistory.value.length - 1]
    if (search) {
      if (!Array.isArray(prev) && prev.search === search) return
      navigationHistory.value.push({
        search,
        path: path.value.slice()
      })
    } else {
      if (Array.isArray(prev) && prev.join("/") === path.value.join("/")) return
      navigationHistory.value.push(path.value.slice())
    }
    navigationFuture.value = []
  }, 1000)
}

const searchWidth = computed(() => {
  if (!searchOpen.value) return "54px"
  const used = (navigationEl.value?.clientWidth ?? 0) + (homeButtonEl.value?.clientWidth ?? 0)
  return `calc(100% - 2px - ${used}px)`
})

let breadcrumbsResizeObserver

function checkBreadcrumbsOverflow() {
  if (breadcrumbsEl.value) {
    breadcrumbsOverflowing.value = breadcrumbsEl.value.scrollWidth > breadcrumbsEl.value.clientWidth
    breadcrumbsEl.value.scrollLeft = breadcrumbsEl.value.scrollWidth
  }
}

function handleBreadcrumbsScroll() {
  if (breadcrumbsEl.value.scrollLeft) {
    breadcrumbsOverflowing.value = breadcrumbsEl.value.scrollWidth > breadcrumbsEl.value.clientWidth
  } else {
    breadcrumbsOverflowing.value = false
  }
}

async function getValidSavedFolders() {
  const results = []
  for (const folder of storage.savedFolders) {
    let current = tree.value
    let valid = true
    for (const segment of folder[0]) {
      if (typeof current === "object" && typeof current[segment] === "string" && segment.endsWith(".zip")) {
        current[segment] = await loadZip(current[segment])
      }
      if (!current || typeof current !== "object" || !(segment in current)) {
        valid = false
        break
      }
      current = current[segment]
    }
    if (valid && typeof current === "object") {
      results.push(folder)
    }
  }
  validSavedFolders.value = results
}

watch(() => storage.savedFolders, getValidSavedFolders, { deep: true })
watch(treeTick, getValidSavedFolders)

watch(path, () => updateUrlParams(params => {
  if (path.value.length) {
    params.set("path", path.value.join("/"))
  } else {
    params.delete("path")
  }
}))

function openSavedFolder(folderPath) {
  openFolder(folderPath)
}

function switchDisplay(type) {
  displayType.value = type
  storage.display = type
  save()
  if (filesRef.value?.viewport) {
    filesRef.value.viewport.scrollTop = 0
  }
  nextTick(() => filesRef.value?.onScroll())
}

function changeSort(type) {
  if (sort.value === type) {
    sortDirection.value = sortDirection.value === "forwards" ? "backwards" : "forwards"
  } else {
    sort.value = type
    sortDirection.value = "forwards"
  }
  if (filesRef.value?.viewport) {
    filesRef.value.viewport.scrollTop = 0
  }
}

function truncate(file) {
  if (displayType.value === "grid" && file.length > 32) {
    if (searchOpen.value && searchText.value) {
      file = "…" + file.slice(-31)
    } else {
      file = file.slice(0, 31) + "…"
    }
  }
  return file.replace(/(_|\.|\/)/g, "$1​")
}

function fileContextMenu(name, event) {
  lastInteracted.value = name
  if (!selected.value.includes(name)) {
    selected.value = [name]
  }
  const [details, selectionType] = getDetailedSelection()
  const currentFolder = path.value.join("/")
  openMenu(event, [
    {
      name: "Open",
      icon: selectionType === "folder" ? "folder_open" : "file_open",
      condition: selectionType !== "multi" && (selectionType !== "folder" || details.length === 1),
      click: () => selectionType === "folder" ? openSelectedFolder(details[0]) : openFiles()
    },
    {
      name: "Open File Location",
      icon: "drive_file_move",
      condition: details.every(e => e.folder === details[0].folder) && details[0].folder !== currentFolder,
      click: () => openFolder(details[0].folder.split("/"))
    },
    "_",
    {
      name: "Pin to Sidebar",
      icon: "push_pin",
      condition: selectionType === "folder" && details.some(e => !storage.savedFolders.some(saved => saved[0].join("/") === e.path)),
      click: () => {
        for (const folder of details) {
          if (!storage.savedFolders.some(saved => saved[0].join("/") === folder.path)) {
            storage.savedFolders.push([path.value.slice().concat(folder.name.split("/"))])
          }
        }
        save()
      }
    },
    {
      name: "Unpin from Sidebar",
      icon: "push_pin",
      condition: selectionType === "folder" && !details.some(e => !storage.savedFolders.some(saved => saved[0].join("/") === e.path)),
      click: () => {
        for (const folder of details) {
          const index = storage.savedFolders.findIndex(e => e[0].join("/") === folder.path)
          if (index !== -1) {
            storage.savedFolders.splice(index, 1)
          }
        }
        save()
      }
    },
    "_",
    {
      name: "Copy Link",
      icon: "link",
      condition: details.length === 1,
      click: () => {
        const item = details[0]
        const dir = dirname(item.path)
        navigator.clipboard.writeText(absoluteLink(item.type === "folder" ? {
          version: version.value,
          path: item.path
        } : {
          version: version.value,
          path: dir === "." ? "" : dir,
          file: basename(item.path)
        }))
        quickMessage("Link copied")
      }
    },
    {
      name: "Download",
      icon: "download",
      click: () => downloadFiles(path.value.slice(), selected.value.slice())
    }
  ])
}

function resetSidebar() {
  if (confirm("Are you sure you want to reset the sidebar?")) {
    storage.savedFolders.length = 0
    storage.savedFolders.push(...defaultSavedFolders())
    save()
  }
}

function sidebarItemContextMenu(folder, event) {
  activeSavedFolder.value = folder
  const wasActive = folder
  const closeGuard = () => {
    if (activeSavedFolder.value === wasActive) activeSavedFolder.value = null
  }
  watch(() => menu.open, open => {
    if (!open) closeGuard()
  }, { once: true })
  openMenu(event, [
    {
      name: "Open",
      icon: "folder_open",
      click: () => openSavedFolder(folder[0])
    },
    "_",
    {
      name: "Rename",
      icon: "edit",
      click: () => {
        renameTarget.value = folder
        renameName.value = folder[1] ?? folder[0][folder[0].length - 1]
        renameIcon.value = folder[2] ?? ""
      }
    },
    "_",
    {
      name: "Move Up",
      icon: "arrow_upward",
      condition: validSavedFolders.value[0] !== folder,
      click: () => {
        storage.savedFolders.splice(storage.savedFolders.indexOf(folder), 1)
        storage.savedFolders.splice(storage.savedFolders.indexOf(validSavedFolders.value[validSavedFolders.value.indexOf(folder) - 1]), 0, folder)
        save()
      }
    },
    {
      name: "Move Down",
      icon: "arrow_downward",
      condition: validSavedFolders.value[validSavedFolders.value.length - 1] !== folder,
      click: () => {
        storage.savedFolders.splice(storage.savedFolders.indexOf(folder), 1)
        storage.savedFolders.splice(storage.savedFolders.indexOf(validSavedFolders.value[validSavedFolders.value.indexOf(folder) + 1]) + 1, 0, folder)
        save()
      }
    },
    "_",
    {
      name: "Unpin from Sidebar",
      icon: "push_pin",
      click: () => {
        storage.savedFolders.splice(storage.savedFolders.indexOf(folder), 1)
        save()
      }
    },
    "_",
    {
      name: "Reset Sidebar",
      icon: "replay",
      click: resetSidebar
    }
  ])
}

function sidebarContextMenu(event) {
  openMenu(event, [
    {
      name: "Reset Sidebar",
      icon: "replay",
      click: resetSidebar
    }
  ])
}

function folderContextMenu(event) {
  openMenu(event, [
    {
      name: "Download Selection",
      icon: "download",
      condition: !!selected.value.length,
      click: () => downloadFiles(path.value.slice(), selected.value.slice())
    },
    {
      name: "Download Folder",
      icon: "download",
      click: () => downloadFiles(path.value.slice(), folderView.value.entries.map(e => e[0]))
    }
  ])
}

function confirmRename() {
  const folder = renameTarget.value
  folder[1] = renameName.value.trim() || null
  folder[2] = renameIcon.value.trim().toLowerCase().replaceAll(" ", "_") || null
  save()
  renameTarget.value = null
}

async function keydownHandler(event) {
  if (viewer.open || menu.open || renameTarget.value) return
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  const entries = folderView.value.entries
  if ((event.ctrlKey || event.metaKey) && event.key === "a") {
    event.preventDefault()
    selected.value = entries.map(e => e[0])
  } else if (event.key === "Escape") {
    event.stopPropagation()
    selected.value = []
  } else if (event.key === "Enter") {
    event.stopPropagation()
    const [details, selectionType] = getDetailedSelection()
    if (!details.length) return
    if (selectionType !== "folder") {
      openFiles()
    } else if (details.length === 1) {
      openSelectedFolder(details[0])
    }
  } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault()
    if (!selected.value.length || selected.value.length > 1) {
      selected.value = [lastInteracted.value]
    } else {
      const container = filesRef.value?.container
      if (!container) return
      const index = entries.findIndex(e => e[0] === selected.value[0])
      if (event.key === "ArrowLeft") {
        if (index > 0) {
          selected.value = [entries[index - 1][0]]
        }
      } else if (event.key === "ArrowRight") {
        if (index < entries.length - 1) {
          selected.value = [entries[index + 1][0]]
        }
      } else {
        const styles = getComputedStyle(container)
        const gap = parseInt(styles.rowGap)
        let itemsPerRow = 1
        if (displayType.value === "grid" && container.children[1]) {
          itemsPerRow = Math.max(1, Math.floor((container.clientWidth - parseInt(styles.padding) * 2 + gap) / (container.children[1].offsetWidth + gap)))
        }
        if (event.key === "ArrowUp") {
          if (index >= itemsPerRow) {
            selected.value = [entries[index - itemsPerRow][0]]
          }
        } else if (event.key === "ArrowDown") {
          if (index + itemsPerRow < entries.length) {
            selected.value = [entries[index + itemsPerRow][0]]
          }
        }
      }
      lastInteracted.value = selected.value[0]
      await nextTick()
      const selectedElement = container.children[entries.findIndex(e => e[0] === selected.value[0]) + 1]
      if (selectedElement) {
        const containerRect = filesRef.value.viewport.getBoundingClientRect()
        const elementRect = selectedElement.getBoundingClientRect()
        if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
          const scrollTo = displayType.value === "grid" ? selectedElement : selectedElement.children[0]
          scrollTo.scrollIntoView({
            behavior: Date.now() - lastArrowKeyPress > 250 ? "smooth" : undefined,
            block: "nearest"
          })
        }
      }
    }
    lastArrowKeyPress = Date.now()
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
    if (Date.now() - typeFindLastKey > 1000) {
      typeFindText = event.key.toLowerCase()
    } else {
      typeFindText += event.key.toLowerCase()
    }
    typeFindLastKey = Date.now()
    const index = entries.findIndex(e => e[0].toLowerCase().startsWith(typeFindText))
    if (index !== -1) {
      selected.value = [entries[index][0]]
      lastInteracted.value = entries[index][0]
      const container = filesRef.value?.container
      if (!container) return
      let scrollTo, currentItems, newItems
      const compare = Date.now()
      typeFindStart = compare
      do {
        currentItems = container.children.length
        if (container.children[index + 1]) {
          scrollTo = displayType.value === "grid" ? container.children[index + 1] : container.children[index + 1].children[0]
        } else {
          filesRef.value.loadMore()
          await nextTick()
        }
        newItems = container.children.length
      } while (!scrollTo && currentItems !== newItems && typeFindStart === compare)
      scrollTo?.scrollIntoView({ block: "center" })
    }
  }
}

onMounted(() => {
  addEventListener("keydown", keydownHandler)
  getValidSavedFolders()
  breadcrumbsResizeObserver = new ResizeObserver(checkBreadcrumbsOverflow)
  breadcrumbsResizeObserver.observe(breadcrumbsEl.value)
  breadcrumbsEl.value.addEventListener("scroll", handleBreadcrumbsScroll)
  checkBreadcrumbsOverflow()
})

onBeforeUnmount(() => {
  removeEventListener("keydown", keydownHandler)
  breadcrumbsResizeObserver?.disconnect()
  clearTimeout(searchTimeout)
})
</script>

<template>
  <div id="browser">
    <div id="browser-header">
      <div id="browser-navigation" ref="navigationEl">
        <i v-if="validSavedFolders.length" class="material-icons" :title="sidebarVisible ? 'Collapse Sidebar' : 'Open Sidebar'" @click="sidebarVisible = !sidebarVisible">{{ sidebarVisible ? "left_panel_close" : "left_panel_open" }}</i>
        <i class="material-icons" :class="{ disabled: navigationHistory.length === 1 }" title="Back" @click="navigationBack">arrow_back</i>
        <i class="material-icons" :class="{ disabled: !navigationFuture.length }" title="Forward" @click="navigationForward">arrow_forward</i>
        <i class="material-icons" :class="{ disabled: !path.length }" title="Up" @click="openFolder(path.slice(0, -1))">arrow_upward</i>
      </div>
      <div id="breadcrumbs-home" ref="homeButtonEl" :class="{ overflow: breadcrumbsOverflowing }">
        <div title="Go back to the version selector" @click="home">
          <i class="material-icons">home</i>
        </div>
      </div>
      <div id="breadcrumbs" ref="breadcrumbsEl">
        <div @click="openFolder([])">{{ version }}</div>
        <div v-for="(part, i) in path" @click="openFolder(path.slice(0, i + 1))">{{ part }}</div>
      </div>
      <div id="browser-search" :class="{ open: searchOpen }" :style="{ width: searchWidth }">
        <i class="material-icons" @click="toggleSearch">{{ searchOpen ? "close" : "search" }}</i>
        <input type="text" placeholder="Search…" ref="searchInput" v-model="searchText" @input="makeSearch">
      </div>
    </div>
    <div v-if="validSavedFolders.length" id="browser-sidebar" :class="{ open: sidebarVisible }" @contextmenu.self="sidebarContextMenu">
      <div v-for="folder of validSavedFolders" :key="folder[0].join()" class="saved-folder" :class="{ active: folder === activeSavedFolder }" :title="folder[1] ? folder[1] + ' - ' + folder[0].join('/') : folder[0].join('/')" @click="openSavedFolder(folder[0])" @contextmenu="sidebarItemContextMenu(folder, $event)">
        <span v-html="getFolderIcon(folder[0], folder[2]) ?? iconHTML('folder')"></span>
        <span>{{ folder[1] ?? folder[0][folder[0].length - 1] }}</span>
      </div>
    </div>
    <LazyScroller v-if="folderView.entries.length" id="files" ref="filesRef" :items="folderView.entries" :class="displayType" @click="selected = []" @contextmenu="folderContextMenu">
      <template #before-list>
        <div id="files-header" :style="displayType === 'grid' ? { display: 'none' } : {}">
          <div @click="changeSort('name')">
            <span>Name</span>
            <i :style="sort === 'name' ? {} : { visibility: 'hidden' }" class="material-icons">{{ sortDirection === "forwards" ? "arrow_upward" : "arrow_downward" }}</i>
          </div>
          <div @click="changeSort('size')">
            <span>Size</span>
            <i :style="sort === 'size' ? {} : { visibility: 'hidden' }" class="material-icons">{{ sortDirection === "forwards" ? "arrow_upward" : "arrow_downward" }}</i>
          </div>
          <div @click="changeSort('type')">
            <span>Type</span>
            <i :style="sort === 'type' ? {} : { visibility: 'hidden' }" class="material-icons">{{ sortDirection === "forwards" ? "arrow_upward" : "arrow_downward" }}</i>
          </div>
        </div>
      </template>
      <template #default="{ item: [file, value, m] }">
        <div :class="{ selected: selected.includes(file) }" :title="file" @click="select(file, value, $event)" @contextmenu="fileContextMenu(file, $event)">
          <template v-if="typeof value === 'object'">
            <i v-if="file.endsWith('.zip')" class="material-icons">folder_zip</i>
            <i v-else class="material-icons">
              <span>folder</span>
              <span v-if="getFolderIcon(file)" v-html="getFolderIcon(file)"></span>
            </i>
          </template>
          <template v-else-if="file.endsWith('.png') && jar.files[value].image && hasAnimation(value)">
            <AnimatedTexture :path="value" />
          </template>
          <template v-else-if="(file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) && jar.files[value].image">
            <div>
              <img class="checkerboard" :src="jar.files[value].image.src">
            </div>
          </template>
          <template v-else-if="getModelMatch(value)">
            <ModelThumbnail :key="value" :path="value" :icon="getFileIcon(file, value)" />
          </template>
          <template v-else>
            <i class="material-icons">{{ getFileIcon(file, value) }}</i>
          </template>
          <div>{{ truncate(file) }}</div>
          <template v-if="displayType === 'list'">
            <div v-if="file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')">{{ m.dimensions?.join(" x ") }}</div>
            <div v-else></div>
            <div>{{ m.label }}</div>
          </template>
        </div>
      </template>
    </LazyScroller>
    <div v-else id="files" class="message">{{ folderView.message }}</div>
    <div id="browser-footer">
      <div>{{ folderView.count.toLocaleString() }} item{{ folderView.count === 1 ? "" : "s" }}</div>
      <template v-if="selected.length">
        <div id="footer-divider"></div>
        <div>{{ selected.length.toLocaleString() }} selected</div>
      </template>
      <div class="spacer"></div>
      <div id="display-type">
        <i class="material-icons" :class="{ selected: displayType === 'list' }" @click="switchDisplay('list')">view_list</i>
        <i class="material-icons" :class="{ selected: displayType === 'grid' }" @click="switchDisplay('grid')">grid_view</i>
      </div>
    </div>
    <div v-if="renameTarget" id="rename-modal" @pointerdown.self="renameTarget = null">
      <div id="rename-panel">
        <h2>Rename Pinned Folder</h2>
        <div class="rename-row">
          <div>Path:</div>
          <div>{{ renameTarget[0].join("/") }}</div>
        </div>
        <div class="rename-row">
          <div>Name</div>
          <input type="text" placeholder="Textures" v-model="renameName" @keydown.enter="confirmRename">
        </div>
        <div class="rename-row">
          <div>Icon</div>
          <input type="text" placeholder="image" v-model="renameIcon" @keydown.enter="confirmRename">
        </div>
        <p>Icons can be any <a href="https://fonts.google.com/icons" target="_blank">Google Material Symbols</a> icon name, for example <code>image</code> or <code>deployed_code</code>.</p>
        <div class="rename-buttons">
          <button @click="confirmRename">Confirm</button>
          <button @click="renameTarget = null">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
#browser {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-content: flex-start;
  height: 100vh;
  background-color: var(--color-ui);
}

#browser-header {
  background-color: var(--color-back);
  width: 100%;
  display: flex;
  position: relative;
}

#browser-header > div:not(:first-child) {
  border-left: 2px solid var(--color-dark);
}

#browser-navigation,
#browser-search {
  display: flex;
  align-items: center;
  padding: 0 8px;
}

#browser-navigation i,
#browser-search > i {
  display: flex;
  cursor: pointer;
  min-width: 36px;
  height: 32px;
  align-items: center;
  justify-content: center;
  position: relative;
  margin: 0;
}

#browser-navigation i:hover,
#browser-search > i:hover {
  background-color: var(--color-selected);
  color: var(--color-light);
}

#browser-navigation i.disabled {
  opacity: 0.5;
  pointer-events: none;
}

#breadcrumbs,
#breadcrumbs-home {
  display: flex;
  padding: 8px 8px 0;
  gap: 24px;
  height: 48px;
  overflow-x: auto;
  align-items: flex-start;
  position: relative;
}

#breadcrumbs::-webkit-scrollbar {
  height: 8px;
}

#breadcrumbs::-webkit-scrollbar-thumb {
  background: var(--color-button);
  border-radius: 0;
  border-top: 2px solid var(--color-back);
  border-bottom: 2px solid var(--color-back);
}

#breadcrumbs::-webkit-scrollbar-thumb:hover {
  background: var(--color-selected);
}

#breadcrumbs::-webkit-scrollbar-track {
  background: var(--color-back);
}

#breadcrumbs > div,
#breadcrumbs-home > div {
  padding: 4px 8px;
  cursor: pointer;
  position: relative;
  font-weight: 600;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 5px;
}

#breadcrumbs > div::after,
#breadcrumbs-home > div::after {
  font-family: "Material Symbols Outlined";
  position: absolute;
  pointer-events: none;
  top: 50%;
  right: -12px;
  transform: translate(50%, -50%);
  font-size: 20px;
  opacity: 0.5;
  font-weight: 400;
}

#breadcrumbs > div:not(:last-child)::after {
  content: "chevron_right";
}

#breadcrumbs > div:hover,
#breadcrumbs-home > div:hover {
  background-color: var(--color-selected);
  color: var(--color-light);
}

#breadcrumbs > div > i,
#breadcrumbs-home > div > i {
  display: flex;
  margin: 0;
  justify-content: center;
}

#breadcrumbs-home {
  overflow-x: visible;
  z-index: 1;
}

#breadcrumbs-home > div::after {
  content: "chevron_right";
}

#breadcrumbs-home.overflow::before {
  content: "";
  width: 64px;
  background-image: linear-gradient(90deg, var(--color-back) 10%, transparent);
  position: absolute;
  top: 0;
  right: -64px;
  bottom: 0;
  pointer-events: none;
  z-index: 1;
}

#breadcrumbs {
  border-left: none !important;
  margin: 0 54px 0 8px;
  flex: 1;
}

#browser-search {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  background-color: var(--color-back);
  transition: width .3s;
  overflow: hidden;
  z-index: 1;
  gap: 8px;
}

#browser-search:not(.open) > :not(:first-child) {
  visibility: hidden;
}

#browser-search input {
  height: 100%;
  flex: 1;
  text-overflow: ellipsis;
  border: none;
  background-color: transparent;
}

#browser-sidebar,
#files {
  height: calc(100% - 48px - 24px);
}

#browser-sidebar {
  width: 162px;
  border-right: 2px solid var(--color-back);
  overflow-y: auto;
  padding: 8px 0;
  transform: translateX(-162px);
  transition: transform .15s;
}

#browser-sidebar ~ #files {
  margin-left: -162px;
  transition: margin-left .15s;
}

#browser-sidebar.open {
  transform: initial;
}

#browser-sidebar.open ~ #files {
  margin-left: 0;
}

.saved-folder {
  white-space: nowrap;
  padding: 0 12px;
  display: flex;
  align-items: center;
  height: 30px;
  cursor: pointer;
  gap: 4px;
}

.saved-folder:hover,
.saved-folder.active {
  color: var(--color-light);
  background-color: var(--color-selected);
}

.saved-folder > span {
  text-overflow: ellipsis;
  overflow: hidden;
}

.saved-folder > span:first-child {
  display: flex;
  align-items: center;
  min-width: 22px;
}

.saved-folder .material-icons {
  font-size: 22px;
}

#files {
  overflow-y: auto;
  contain: strict;
  background-color: var(--color-ui);
  flex: 1;
  padding: 16px;
}

#files > div {
  min-width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, 114px);
  gap: 10px;
  align-content: start;
}

#files > div > div {
  display: flex;
  align-items: center;
  text-align: center;
  flex-direction: column;
  padding: 0 4px 4px;
  cursor: pointer;
  font-size: 14px;
  word-break: break-word;
}

#files > div > div:hover {
  color: var(--color-light);
}

#files > div > div.selected {
  background-color: var(--color-selected);
  color: var(--color-light);
}

#files > div > div.selected > i i,
#files > div > div.selected > i svg {
  color: var(--color-selected);
}

#files > div > div > i,
#files > div > div > img,
#files > div > div > div > img,
#files > div > div > .animated-texture,
#files > div > div .animated-texture canvas,
#files > div > div > .model-thumbnail,
#files > div > div .model-thumbnail canvas {
  min-width: 64px;
  min-height: 64px;
  max-width: 64px;
  max-height: 64px;
  font-size: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  pointer-events: none;
}

#files > div > div > i,
#files > div > div > div,
#files > div > div > .animated-texture,
#files > div > div > .model-thumbnail {
  margin: 8px 0 4px;
}

#files > div > div > i i,
#files > div > div > i .material-icons,
#files > div > div > i svg {
  position: absolute;
  top: 20px;
  min-width: 100%;
  text-align: center;
  color: var(--color-ui);
  font-size: 32px;
  left: 0;
  display: flex;
  justify-content: center;
}

#files > div > div > i svg {
  width: 32px;
  height: 32px;
}

#files > div > div > div > img,
#files > div > div .animated-texture canvas {
  object-fit: contain;
  margin: 0;
}

#files.list {
  padding-top: 0;
}

#files.list > div {
  row-gap: 4px;
  column-gap: 0;
  grid-template-columns: auto 1fr auto auto;
}

#files.list > div > div {
  display: contents;
  font-size: 16px;
  text-align: initial;
}

#files.list > div > div.selected > * {
  background-color: var(--color-selected);
}

#files.list > div > div > * {
  padding: 0 10px;
}

#files.list > div > div > i,
#files.list > div > div > img,
#files.list > div > div > div > img,
#files.list > div > div > .animated-texture,
#files.list > div > div .animated-texture canvas,
#files.list > div > div > .model-thumbnail,
#files.list > div > div .model-thumbnail canvas {
  box-sizing: initial;
  margin: 0;
  min-width: 22px;
  min-height: 100%;
  max-width: 22px;
  max-height: 100%;
  font-size: 22px;
  align-self: center;
}

#files.list > div > div > i {
  padding-left: 8px;
}

#files.list > div > div > i i,
#files.list > div > div > i .material-icons,
#files.list > div > div > i svg {
  top: 50%;
  left: 2.5px;
  font-size: 12px;
  transform: translateY(calc(-50% + 1px));
}

#files.list > div > div > i svg {
  width: 12px;
  height: 12px;
}

#files.list > div > div > img,
#files.list > div > div > div > img,
#files.list > div > div .animated-texture canvas,
#files.list > div > div .model-thumbnail canvas {
  padding: 0;
  min-height: 22px;
  max-height: 22px;
}

#files > div > div .model-thumbnail canvas {
  object-fit: contain;
  image-rendering: auto;
}

#files.list > div > div > div {
  box-sizing: initial;
  display: flex;
  align-items: center;
  min-height: 30px;
}

#files.list > div > div > :first-child {
  max-width: 32px;
  padding: 0 3px 0 8px;
}

#files.list > div > div > :last-child {
  padding-right: 8px;
  text-align: right;
  justify-content: flex-end;
}

#files.list > div > div > :nth-child(2) {
  padding-left: 3px;
  display: block;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  direction: rtl;
  text-align: left;
  line-height: 29px;
}

#files.message {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 24px;
  color: var(--color-subtle_text);
}

#files-header > div {
  position: sticky;
  top: 0;
  background-color: var(--color-ui);
  border-bottom: 2px solid var(--color-back);
  text-align: left !important;
  justify-content: space-between !important;
  z-index: 2 !important;
  color: var(--color-text);
  gap: 8px;
  cursor: pointer;
}

#files-header > div:hover {
  color: var(--color-light);
}

#files-header > div .material-icons {
  font-size: 18px;
}

#files-header > :first-child {
  grid-column: span 2;
  min-width: 100%;
  box-sizing: border-box !important;
}

#files-header > :first-child::before {
  content: "";
  position: absolute;
  height: 2px;
  width: 16px;
  left: -16px;
  bottom: -2px;
  background-color: var(--color-back);
}

#files-header > :nth-child(2) {
  padding-left: 10px !important;
}

#files-header > :not(:last-child) {
  border-right: 2px solid var(--color-back);
}

#files-header > :last-child::before {
  content: "";
  position: absolute;
  height: 2px;
  width: 16px;
  right: -16px;
  bottom: -2px;
  background-color: var(--color-back);
}

#browser-footer {
  width: 100%;
  background-color: var(--color-back);
  height: 24px;
  display: flex;
  align-items: center;
  padding: 0 24px 0 8px;
  gap: 8px;
  font-size: 14px;
}

#footer-divider {
  width: 1px;
  height: 12px;
  background-color: var(--color-subtle_text);
  opacity: 0.25;
}

#display-type {
  display: flex;
}

#display-type i {
  font-size: 18px;
  height: 24px;
  min-width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

#display-type i:hover {
  color: var(--color-light);
}

#display-type i.selected {
  background-color: var(--color-selected);
  color: var(--color-light);
}

#rename-modal {
  position: fixed;
  inset: 0;
  z-index: 120;
  background-color: #0006;
  display: flex;
  align-items: center;
  justify-content: center;
}

#rename-panel {
  background-color: var(--color-ui);
  box-shadow: 0 10px 40px #00000080;
  padding: 16px 20px;
  width: 480px;
  max-width: calc(100vw - 48px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

#rename-panel h2 {
  margin: 0;
  font-size: 20px;
  color: var(--color-light);
}

#rename-panel p {
  margin: 0;
  color: var(--color-subtle_text);
  font-size: 14px;
}

#rename-panel code {
  background-color: var(--color-back);
  border: 1px solid var(--color-border);
  padding: 0 4px;
}

.rename-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rename-row > div:first-child {
  min-width: 64px;
}

.rename-row input {
  flex: 1;
}

.rename-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
