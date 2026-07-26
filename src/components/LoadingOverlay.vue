<script setup>
import { useAssets } from "../composables/useAssets.js"
import { formatBytes } from "../lib/util.js"

const { loadingMessage, progressDone, progressTotal, progressBytes } = useAssets()
</script>

<template>
  <div id="loading">
    <div>{{ loadingMessage }}</div>
    <template v-if="progressTotal">
      <div id="progress-bar-container">
        <div id="progress-bar" :style="{ width: `calc(${Math.round(progressDone / progressTotal * 100)}% - 8px)` }"></div>
      </div>
      <div id="progress-bar-text">
        <template v-if="progressBytes">{{ formatBytes(progressDone) }} / {{ formatBytes(progressTotal) }} - {{ Math.round(progressDone / progressTotal * 100) }}%</template>
        <template v-else>{{ progressDone.toLocaleString() }} / {{ progressTotal.toLocaleString() }} - {{ Math.round(progressDone / progressTotal * 100) }}%</template>
      </div>
    </template>
    <div v-else-if="progressBytes && progressDone" id="progress-bar-text">{{ formatBytes(progressDone) }}</div>
  </div>
</template>

<style scoped>
#loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  font-size: 24px;
  gap: 16px;
  position: fixed;
  inset: 0;
  z-index: 100;
  background-color: color-mix(in srgb, var(--color-ui), transparent 25%);
}

#progress-bar-container {
  width: calc(100% - 80px);
  max-width: 512px;
  height: 24px;
  background-color: var(--color-back);
  position: relative;
}

#progress-bar {
  background-color: var(--color-accent);
  position: absolute;
  top: 4px;
  left: 4px;
  height: 16px;
  transition: width .5s ease;
}

#progress-bar-text {
  margin-top: -12px;
  font-size: 20px;
  color: var(--color-subtle_text);
}
</style>
