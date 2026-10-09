export class SessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionError'
  }
}

/**
 * Thrown when the browser refused to open the Biatec Wallet popup (`window.open` returned
 * `null`) — almost always because it was not called synchronously from a user gesture, or the
 * site is blocked from opening popups. Ask the user to click again / allow popups.
 */
export class PopupBlockedError extends SessionError {
  constructor(
    message = 'The browser blocked the Biatec Wallet popup. Allow popups for this site and try again.'
  ) {
    super(message)
    this.name = 'PopupBlockedError'
  }
}

/**
 * Legacy: an old wallet version answered ARC-0027 error 4004 for a network it was not on. Current
 * wallets sign on every network. Do not ask the user to switch network; suggest reloading the wallet
 * page or another connection method. {@link genesisHash} is what the dApp requested and, when the
 * wallet reported them, {@link walletGenesisHashes}.
 */
export class DirectNetworkMismatchError extends SessionError {
  readonly code = 4004
  readonly genesisHash: string
  readonly walletGenesisHashes: string[]
  constructor(message: string, genesisHash: string, walletGenesisHashes: string[] = []) {
    super(message)
    this.name = 'DirectNetworkMismatchError'
    this.genesisHash = genesisHash
    this.walletGenesisHashes = walletGenesisHashes
  }
}
