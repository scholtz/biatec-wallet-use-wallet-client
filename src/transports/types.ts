/**
 * Shared context handed by `BiatecWalletAdapter` to each transport it owns. Transports are
 * plain classes (not `BaseWallet` subclasses — only the unified adapter extends `BaseWallet`
 * now), so this is how they read/write adapter state without needing `protected` access.
 */
import type { AdapterStoreAccessor, StdSignData } from '@txnlab/use-wallet/adapter'
import type { NetworkConfig } from '@txnlab/use-wallet'

export interface TransportLogger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export interface TransportContext {
  logger: TransportLogger
  store: AdapterStoreAccessor
  getMetadataName: () => string
  getAddresses: () => string[]
  getActiveNetworkConfig: () => NetworkConfig
  getActiveNetwork: () => string
  createStdSignData: (data: string) => Promise<StdSignData>
  onDisconnect: () => void
}

/** The connection method a persisted account/session used, so resume can dispatch correctly. */
export type BiatecMethod = 'walletconnect' | 'liquid'

export type BiatecAccountMetadata =
  | { method: 'walletconnect' }
  | { method: 'liquid'; requestId: string; origin: string }

/** Handle returned by a dialog-opening function so the caller can dismiss it. */
export interface DialogHandle {
  close(): void
}

/** Extra context passed alongside the pairing/session URI to `onDisplayUri`. */
export interface BiatecDisplayUriInfo {
  method: BiatecMethod
  /** Liquid Auth only. */
  requestId?: string
  /** Liquid Auth only. */
  origin?: string
}

export class ConnectAbortedError extends Error {
  constructor(message = 'Connection cancelled') {
    super(message)
    this.name = 'ConnectAbortedError'
  }
}

/** Rejects with {@link ConnectAbortedError} as soon as `signal` aborts, whichever comes first. */
export function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new ConnectAbortedError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ConnectAbortedError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}
