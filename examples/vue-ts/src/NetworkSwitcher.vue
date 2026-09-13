<script setup lang="ts">
import { useNetwork } from '@txnlab/use-wallet-vue'

const { activeNetwork, networkConfig, setActiveNetwork } = useNetwork()
</script>

<template>
  <label class="switcher">
    Network
    <select
      :value="activeNetwork"
      aria-label="Active network"
      @change="setActiveNetwork(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="id in Object.keys(networkConfig)" :key="id" :value="id">{{ id }}</option>
    </select>
  </label>
</template>

<style scoped>
.switcher {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
}
</style>
