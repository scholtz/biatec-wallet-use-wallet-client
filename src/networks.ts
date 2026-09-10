import type { NetworkConfig } from '@txnlab/use-wallet'

/**
 * CAIP-2 chain identifiers Biatec Wallet approves in a WalletConnect session.
 * Source: https://scholtz.github.io/AlgorandPublicData/genesis/genesis-list.json
 *
 * Algorand CAIP-2 ids are `algorand:` + the first 32 characters of the base64url
 * encoded genesis hash (ARC-0025 / CAIP-2 for Algorand).
 */
export const BIATEC_CAIP_CHAIN_IDS = {
  mainnet: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k',
  testnet: 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe',
  betanet: 'algorand:mFgazF-2uRS1tMiL9dsj01hJGySEmPN2',
  fnet: 'algorand:kUt08LxeVAAGHnh4JoAoAMM9ql_hBwSo',
  voimain: 'algorand:r20fSQI8gWe_kFZziNonSPCXLwcQmH_n',
  aramidmain: 'algorand:PgeQVJJgx_LYKJfIEz7dbfNPuXmDyJ-O'
} as const

export type BiatecNetworkId = keyof typeof BIATEC_CAIP_CHAIN_IDS

/**
 * Ready-to-use `NetworkConfig` entries for AVM chains that Biatec Wallet supports
 * but @txnlab/use-wallet does not ship by default. Pass them to
 * `NetworkConfigBuilder.addNetwork()` or spread them into `WalletManager.networks`.
 *
 * @example
 * ```ts
 * const networks = new NetworkConfigBuilder()
 *   .addNetwork('voimain', BIATEC_EXTRA_NETWORKS.voimain)
 *   .addNetwork('aramidmain', BIATEC_EXTRA_NETWORKS.aramidmain)
 *   .build()
 * ```
 */
export const BIATEC_EXTRA_NETWORKS: Record<'voimain' | 'aramidmain', NetworkConfig> = {
  voimain: {
    algod: {
      token: '',
      baseServer: 'https://mainnet-api.voi.nodely.dev',
      headers: {}
    },
    isTestnet: false,
    genesisHash: 'r20fSQI8gWe/kFZziNonSPCXLwcQmH/nxROvnnueWOk=',
    genesisId: 'voimain-v1.0',
    caipChainId: BIATEC_CAIP_CHAIN_IDS.voimain
  },
  aramidmain: {
    algod: {
      token: '',
      baseServer: 'https://aramidmain-algod-public.de.nodes.biatec.io',
      headers: {}
    },
    isTestnet: false,
    genesisHash: 'PgeQVJJgx/LYKJfIEz7dbfNPuXmDyJ+O7FwQ4XL9tE8=',
    genesisId: 'aramidmain-v1.0',
    caipChainId: BIATEC_CAIP_CHAIN_IDS.aramidmain
  }
}

/** Convert a base64 genesis hash into the Algorand CAIP-2 chain id. */
export function caipChainIdFromGenesisHash(genesisHashB64: string): string {
  const base64url = genesisHashB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `algorand:${base64url.slice(0, 32)}`
}
