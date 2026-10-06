/**
 * Constants shared between `adapter.ts` and `connect-dialog.ts` — kept in their own module so
 * neither has to import the other (the dialog is constructed from inside the adapter).
 */
export const WALLET_ID = 'biatec' as const
export const BIATEC_WALLET_URL = 'https://wallet.biatec.io'

/** Path of the wallet's popup route for the `direct` transport. */
export const DIRECT_ROUTE = '/direct'
/** Window name used for the popup, so repeated opens reuse one wallet window. */
export const DIRECT_WINDOW_NAME = 'biatec-wallet-direct'
export const DIRECT_POPUP_WIDTH = 480
export const DIRECT_POPUP_HEIGHT = 720
/** `reference` of the handshake message the wallet popup posts once it can take a request. */
export const DIRECT_READY_REFERENCE = 'biatec:direct:ready'
/** Version of the Biatec Direct protocol this package speaks. */
export const DIRECT_PROTOCOL_VERSION = 1
