<script lang="ts">
  import { useNetwork } from '@txnlab/use-wallet-svelte'

  const network = useNetwork()
</script>

<label class="switcher">
  Network
  <select
    value={network.activeNetwork.current}
    onchange={(e) => network.setActiveNetwork((e.target as HTMLSelectElement).value)}
    aria-label="Active network"
  >
    {#each Object.keys(network.networkConfig) as id (id)}
      <option value={id}>{id}</option>
    {/each}
  </select>
</label>

<style>
  .switcher {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
  }
</style>
