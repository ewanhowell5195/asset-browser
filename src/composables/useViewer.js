import { reactive } from "vue"

const state = reactive({ open: false, files: [], index: 0 })

function openViewer(files, index = 0) {
  state.files = files
  state.index = index
  state.open = true
}

function closeViewer() {
  state.open = false
  state.files = []
}

export function useViewer() {
  return { viewer: state, openViewer, closeViewer }
}
