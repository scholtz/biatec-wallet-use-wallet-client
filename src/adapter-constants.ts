/**
 * Constants shared between `adapter.ts` and `connect-dialog.ts` — kept in their own module so
 * neither has to import the other (the dialog is constructed from inside the adapter).
 */
export const WALLET_ID = 'biatec' as const
export const BIATEC_WALLET_URL = 'https://wallet.biatec.io'

/** Path of the wallet's popup route for the `direct` transport. */
export const DIRECT_ROUTE = '/direct'
/** Prefix of the per-session popup window name (`<prefix>-<uuid>`; never reused). */
export const DIRECT_WINDOW_NAME = 'biatec-wallet-direct'
/** Preferred Biatec Direct popup size; shrunk to fit the available screen (see `features()`). */
export const DIRECT_POPUP_WIDTH = 1100
export const DIRECT_POPUP_HEIGHT = 860
/** The popup is not shrunk below this unless the screen itself is smaller. */
export const DIRECT_POPUP_MIN_WIDTH = 640
export const DIRECT_POPUP_MIN_HEIGHT = 560
/** Fraction of the available screen the popup may cover (the dApp stays visible behind it). */
export const DIRECT_POPUP_SCREEN_FRACTION = 0.9
/** `reference` of the handshake message the wallet popup posts once it can take a request. */
export const DIRECT_READY_REFERENCE = 'biatec:direct:ready'
/** Version of the Biatec Direct protocol this package speaks. */
export const DIRECT_PROTOCOL_VERSION = 1
