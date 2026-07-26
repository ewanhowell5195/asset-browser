<script setup>
import { nextTick, ref, watch } from "vue"
import { useContextMenu } from "../composables/useContextMenu.js"

const { menu, closeMenu } = useContextMenu()
const el = ref(null)
const pos = ref({ left: 0, top: 0 })

watch(() => [menu.open, menu.x, menu.y], async () => {
  if (!menu.open) return
  pos.value = { left: menu.x, top: menu.y }
  await nextTick()
  const rect = el.value?.getBoundingClientRect()
  if (!rect) return
  pos.value = {
    left: Math.max(4, Math.min(menu.x, innerWidth - rect.width - 4)),
    top: Math.max(4, Math.min(menu.y, innerHeight - rect.height - 4))
  }
})

addEventListener("pointerdown", e => {
  if (menu.open && !el.value?.contains(e.target)) closeMenu()
}, true)
addEventListener("keydown", e => {
  if (e.key === "Escape" && menu.open) {
    e.stopPropagation()
    closeMenu()
  }
}, true)
addEventListener("wheel", () => {
  if (menu.open) closeMenu()
}, { capture: true, passive: true })
addEventListener("blur", () => {
  if (menu.open) closeMenu()
})

function run(item) {
  closeMenu()
  item.click()
}
</script>

<template>
  <div v-if="menu.open" ref="el" class="context-menu" :style="{ left: pos.left + 'px', top: pos.top + 'px' }" @contextmenu.prevent>
    <template v-for="(item, i) in menu.items" :key="i">
      <hr v-if="item === '_'">
      <div v-else class="context-menu-item" @click="run(item)">
        <i class="material-icons">{{ item.icon }}</i>
        <span>{{ item.name }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 150;
  min-width: 180px;
  background-color: var(--color-ui);
  border: 1px solid var(--color-border);
  box-shadow: 0 6px 24px #00000080;
  padding: 4px 0;
}

.context-menu hr {
  margin: 4px 0;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px 8px;
  cursor: pointer;
  white-space: nowrap;
}

.context-menu-item:hover {
  background-color: var(--color-selected);
  color: var(--color-light);
}

.context-menu-item .material-icons {
  font-size: 18px;
  min-width: 20px;
  text-align: center;
  color: var(--color-subtle_text);
}

.context-menu-item:hover .material-icons {
  color: var(--color-light);
}
</style>
