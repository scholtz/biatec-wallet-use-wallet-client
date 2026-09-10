import { describe, expect, it } from 'vitest'
import {
  BIATEC_CAIP_CHAIN_IDS,
  BIATEC_EXTRA_NETWORKS,
  caipChainIdFromGenesisHash
} from './networks'

describe('networks', () => {
  it('derives CAIP-2 ids from base64 genesis hashes', () => {
    expect(caipChainIdFromGenesisHash('wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=')).toBe(
      BIATEC_CAIP_CHAIN_IDS.mainnet
    )
    expect(caipChainIdFromGenesisHash('SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=')).toBe(
      BIATEC_CAIP_CHAIN_IDS.testnet
    )
    expect(caipChainIdFromGenesisHash('mFgazF-2uRS1tMiL9dsj01hJGySEmPN2OvOTQHJ6iQg=')).toBe(
      BIATEC_CAIP_CHAIN_IDS.betanet
    )
  })

  it('keeps the extra network configs consistent with their genesis hashes', () => {
    for (const config of Object.values(BIATEC_EXTRA_NETWORKS)) {
      expect(config.caipChainId).toBe(caipChainIdFromGenesisHash(config.genesisHash!))
    }
  })
})
