import { reactive } from "vue"

const state = reactive({ open: false, x: 0, y: 0, items: [] })
let trigger = null

function setTrigger(el) {
  trigger?.classList.remove("context-open")
  trigger = el
  trigger?.classList.add("context-open")
}

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
  setTrigger(event.currentTarget instanceof Element ? event.currentTarget : null)
  state.items = cleaned
  state.x = event.clientX
  state.y = event.clientY
  state.open = true
}

function closeMenu() {
  state.open = false
  setTrigger(null)
}

export function useContextMenu() {
  return { menu: state, openMenu, closeMenu }
}
