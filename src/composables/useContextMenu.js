import { reactive } from "vue"

const state = reactive({ open: false, x: 0, y: 0, items: [] })

function openMenu(event, items) {
  event.preventDefault()
  event.stopPropagation()
  items = items.filter(e => e === "_" || !("condition" in e) || e.condition)
  const cleaned = []
  for (const item of items) {
    if (item === "_" && (!cleaned.length || cleaned[cleaned.length - 1] === "_")) continue
    cleaned.push(item)
  }
  while (cleaned[cleaned.length - 1] === "_") cleaned.pop()
  if (!cleaned.length) return
  state.items = cleaned
  state.x = event.clientX
  state.y = event.clientY
  state.open = true
}

function closeMenu() {
  state.open = false
}

export function useContextMenu() {
  return { menu: state, openMenu, closeMenu }
}
