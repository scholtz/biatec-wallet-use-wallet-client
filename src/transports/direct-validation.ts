/**
 * Strict validators for everything the `direct` transport reads out of a `postMessage` payload.
 *
 * The sender's origin and window have already been verified by the time these run, but the
 * payload is still treated as untrusted input: every field that is used is type-checked,
 * lengths are bounded, and anything unexpected throws a {@link LiquidProviderError} (code 4200)
 * that the transport turns into a rejected request. Nothing here may be trusted to "just be a
 * string".
 *
 * `unknown` is used deliberately throughout this file: every parameter typed `unknown` is raw
 * `postMessage` data from another window, for which no static type can be trusted; each is
 * narrowed by an explicit runtime check before use (that is the purpose of this module).
 */
import algosdk from 'algosdk'
import { DIRECT_PROTOCOL_VERSION, DIRECT_READY_REFERENCE } from '../adapter-constants'
import {
  LiquidErrorCode,
  LiquidProviderError,
  fromBase64Url,
  type EnableAccount,
  type EnableResult
} from '../liquid/protocol'

/** Longest base64 string accepted for a (signed) transaction: far above the 1000 B + 4 KB limits. */
const MAX_STXN_CHARS = 64 * 1024
const MAX_SIGNATURE_CHARS = 16 * 1024
const MAX_ITEMS = 16
const MAX_ACCOUNTS = 100
const MAX_CAPABILITY_ENTRIES = 64
const MAX_SHORT_STRING = 256
const MAX_ERROR_MESSAGE = 500

const BASE64_PATTERN = /^[A-Za-z0-9_+/-]+={0,2}$/

export function invalid(message: string): LiquidProviderError {
  return new LiquidProviderError(
    `Malformed message from Biatec Wallet: ${message}`,
    LiquidErrorCode.invalidInput
  )
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value: unknown, label: string, max = MAX_SHORT_STRING): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw invalid(`${label} must be a non-empty string of at most ${max} characters`)
  }
  return value
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_CAPABILITY_ENTRIES) {
    throw invalid(`${label} must be an array of at most ${MAX_CAPABILITY_ENTRIES} strings`)
  }
  return value.map((entry, i) => boundedString(entry, `${label}[${i}]`))
}

/** Decodes a base64url/base64 string field; throws a 4200 error on anything else. */
export function decodeBase64Field(value: unknown, label: string, maxChars: number): Uint8Array {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxChars) {
    throw invalid(`${label} must be a non-empty base64 string`)
  }
  if (!BASE64_PATTERN.test(value)) throw invalid(`${label} is not valid base64url`)
  try {
    return fromBase64Url(value)
  } catch {
    throw invalid(`${label} is not valid base64url`)
  }
}

export interface DirectReady {
  /** Informational in protocol v1 (names of the operations the wallet popup handles). */
  methods: string[]
  /** Base64 genesis hashes of the networks the wallet can currently serve. */
  genesisHashes: string[]
}

/** Validates the wallet's `biatec:direct:ready` handshake message. */
export function parseReady(data: unknown): DirectReady {
  if (!isRecord(data) || data.reference !== DIRECT_READY_REFERENCE) {
    throw invalid('expected a biatec:direct:ready handshake')
  }
  if (typeof data.v !== 'number' || !Number.isInteger(data.v)) {
    throw invalid('ready message has no protocol version')
  }
  if (data.v !== DIRECT_PROTOCOL_VERSION) {
    throw new LiquidProviderError(
      `Biatec Wallet speaks Biatec Direct v${data.v}, this dApp speaks v${DIRECT_PROTOCOL_VERSION}`,
      LiquidErrorCode.methodNotSupported
    )
  }
  const capabilities = data.capabilities
  if (!isRecord(capabilities)) throw invalid('ready message has no capabilities')
  return {
    methods: stringArray(capabilities.methods, 'capabilities.methods'),
    genesisHashes: stringArray(capabilities.genesisHashes, 'capabilities.genesisHashes')
  }
}

export interface ParsedResponse {
  /** Present when the wallet answered with an error. */
  error?: { code: number; message: string; data?: unknown }
  /** Present on success; still unvalidated. */
  result?: unknown
}

/**
 * Validates the envelope of a response that is already known to belong to our request
 * (`requestId` matched): reference, and exactly one of `result` / `error`.
 */
export function parseResponseEnvelope(
  data: Record<string, unknown>,
  expectedReference: string
): ParsedResponse {
  if (data.reference !== expectedReference) {
    throw invalid(`expected reference ${expectedReference}`)
  }
  const hasResult = 'result' in data && data.result !== undefined
  const hasError = 'error' in data && data.error !== undefined
  if (hasResult === hasError) throw invalid('response must carry exactly one of result or error')
  if (hasError) {
    const error = data.error
    if (
      !isRecord(error) ||
      typeof error.code !== 'number' ||
      !Number.isInteger(error.code) ||
      typeof error.message !== 'string'
    ) {
      throw invalid('error must be { code: integer, message: string }')
    }
    return {
      error: {
        code: error.code,
        message: error.message.slice(0, MAX_ERROR_MESSAGE),
        ...(error.data !== undefined ? { data: error.data } : {})
      }
    }
  }
  return { result: data.result }
}

/**
 * `providerId` in a result identifies the **wallet** provider (the wallet announces its own fixed
 * id; it does not echo the dApp's). It is not an authenticator — origin, source window and
 * requestId are — so it is only validated for shape.
 */
function readWalletProviderId(result: Record<string, unknown>): string {
  return boundedString(result.providerId, 'providerId', 128)
}

/**
 * Decodes a genesis hash given as base64 or base64url, padded or not, to its 32 bytes.
 * Returns `null` when it is not a valid 32-byte hash.
 */
export function decodeGenesisHash(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || value.length < 43 || value.length > 44) return null
  if (!BASE64_PATTERN.test(value)) return null
  try {
    const bytes = fromBase64Url(value)
    return bytes.length === 32 ? bytes : null
  } catch {
    return null
  }
}

/** Compares two genesis hashes by their decoded bytes (never by string). */
export function genesisHashesEqual(a: unknown, b: unknown): boolean {
  const x = decodeGenesisHash(a)
  const y = decodeGenesisHash(b)
  return x !== null && y !== null && x.every((byte, i) => byte === y[i])
}

/** Validates an `enable` result: ids, genesis hash and every returned account address. */
export function parseEnableResult(result: unknown, genesisHash: string): EnableResult {
  if (!isRecord(result)) throw invalid('enable result must be an object')
  const providerId = readWalletProviderId(result)
  if (!genesisHashesEqual(result.genesisHash, genesisHash)) {
    throw new LiquidProviderError(
      'Biatec Wallet approved a different network than the one requested',
      LiquidErrorCode.networkNotSupported,
      { genesisHash: typeof result.genesisHash === 'string' ? result.genesisHash : undefined }
    )
  }
  const rawAccounts = result.accounts
  if (
    !Array.isArray(rawAccounts) ||
    rawAccounts.length === 0 ||
    rawAccounts.length > MAX_ACCOUNTS
  ) {
    throw invalid(`accounts must be an array of 1-${MAX_ACCOUNTS} entries`)
  }
  const seen = new Set<string>()
  const accounts: EnableAccount[] = []
  rawAccounts.forEach((entry, i) => {
    if (!isRecord(entry)) throw invalid(`accounts[${i}] must be an object`)
    const address = entry.address
    if (typeof address !== 'string' || !algosdk.isValidAddress(address)) {
      throw invalid(`accounts[${i}].address is not a valid Algorand address`)
    }
    if (seen.has(address)) return
    seen.add(address)
    const account: EnableAccount = { address }
    if (entry.name !== undefined)
      account.name = boundedString(entry.name, `accounts[${i}].name`, 128)
    accounts.push(account)
  })
  return { providerId, genesisHash, accounts }
}

/** Validates a `sign_transactions` result and returns the positional raw base64 entries. */
export function parseSignTransactionsResult(
  result: unknown,
  expectedLength: number
): (string | null)[] {
  if (!isRecord(result)) throw invalid('sign_transactions result must be an object')
  readWalletProviderId(result)
  const stxns = result.stxns
  if (!Array.isArray(stxns) || stxns.length !== expectedLength || stxns.length > MAX_ITEMS * 8) {
    throw invalid(`stxns must be an array of exactly ${expectedLength} entries`)
  }
  return stxns.map((entry, i) => {
    if (entry === null) return null
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > MAX_STXN_CHARS) {
      throw invalid(`stxns[${i}] must be a base64url string or null`)
    }
    return entry
  })
}

/** Validates a `sign_data` result and returns the positional raw base64 entries. */
export function parseSignDataResult(result: unknown, expectedLength: number): (string | null)[] {
  if (!isRecord(result)) throw invalid('sign_data result must be an object')
  readWalletProviderId(result)
  const signatures = result.signatures
  if (!Array.isArray(signatures) || signatures.length !== expectedLength) {
    throw invalid(`signatures must be an array of exactly ${expectedLength} entries`)
  }
  return signatures.map((entry, i) => {
    if (entry === null) return null
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > MAX_SIGNATURE_CHARS) {
      throw invalid(`signatures[${i}] must be a base64url string or null`)
    }
    return entry
  })
}

export const LIMITS = { MAX_STXN_CHARS, MAX_SIGNATURE_CHARS } as const
