/**
 * Constants shared between `adapter.ts` and `connect-dialog.ts` — kept in their own module so
 * neither has to import the other (the dialog is constructed from inside the adapter).
 */
export const WALLET_ID = 'biatec' as const
export const BIATEC_WALLET_URL = 'https://wallet.biatec.io'
