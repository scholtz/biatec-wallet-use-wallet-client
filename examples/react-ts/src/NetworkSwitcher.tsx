import { useNetwork } from '@txnlab/use-wallet-react'

export function NetworkSwitcher() {
  const { activeNetwork, networkConfig, setActiveNetwork } = useNetwork()

  return (
    <label style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
      Network
      <select
        value={activeNetwork}
        onChange={(e) => setActiveNetwork(e.target.value)}
        aria-label="Active network"
      >
        {Object.keys(networkConfig).map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  )
}
