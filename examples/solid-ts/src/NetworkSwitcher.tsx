import { useNetwork } from '@txnlab/use-wallet-solid'
import { For } from 'solid-js'

export function NetworkSwitcher() {
  const { activeNetwork, networkConfig, setActiveNetwork } = useNetwork()

  return (
    <label style={{ display: 'inline-flex', gap: '0.5rem', 'align-items': 'center' }}>
      Network
      <select
        value={activeNetwork()}
        onChange={(e) => setActiveNetwork(e.currentTarget.value)}
        aria-label="Active network"
      >
        <For each={Object.keys(networkConfig())}>{(id) => <option value={id}>{id}</option>}</For>
      </select>
    </label>
  )
}
