# Biatec Direct protocol (v1)

**Normative specification** of the `direct` connection method: a relay-free, same-browser channel
where the dApp opens Biatec Wallet in a **popup window** and the two pages exchange
[ARC-0027](https://github.com/algorandfoundation/ARCs/blob/main/ARCs/arc-0027.md) messages over
`window.postMessage`. This document is the contract between the dApp side (this package,
`src/transports/direct-transport.ts`) and the wallet side (the `/direct` route of
[scholtz/wallet](https://github.com/scholtz/wallet), tracked in
[scholtz/wallet#192](https://github.com/scholtz/wallet/issues/192)). If the two ever disagree,
this document wins; fix the code. The adapter-side plan is
[#2](https://github.com/scholtz/biatec-wallet-use-wallet-client/issues/2).

The keywords MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. Why a popup, and why no encryption

`window.open` + `postMessage` is the only cross-origin, relay-free channel a web wallet has. The
browser stamps every message with an unforgeable `event.origin`, so the wallet learns the dApp's
real origin without any server, and the dApp can pin the wallet origin without any key exchange.

- **No iframe.** An approval UI framed by the dApp is clickjackable, and third-party iframe
  storage is partitioned (the wallet would not see its own IndexedDB vault in Safari, Firefox and
  Chrome ≥ 115). A top-level popup is first-party and unpartitioned.
- **No payload encryption.** Encryption (as in Coinbase Smart Wallet) is only needed when an
  untrusted intermediary carries the messages. There is none here: popup and opener talk
  directly. The integrity/authenticity guarantee comes from `event.origin` + `event.source`.
- Messages are **plain structured-clone objects**. There is no CBOR and no base64url envelope
  (contrast with [Liquid Auth](LIQUID_AUTH_PROTOCOL.md)); only the transaction and signature
  fields keep their base64url string encoding.

## 2. Terms

| Term            | Meaning                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DAPP_ORIGIN`   | `location.origin` of the dApp page that called `window.open`. Must be a real http(s) origin (never the opaque origin `"null"`).                         |
| `WALLET_ORIGIN` | The wallet's origin. By default `https://wallet.biatec.io`. Pinned in the SDK; see §3.                                                                  |
| popup           | The `WindowProxy` returned by the dApp's `window.open`. The wallet sees the dApp as `window.opener`.                                                    |
| request         | One ARC-0027 request message. **Exactly one request is exchanged per popup lifetime.**                                                                  |
| `providerId`    | Opaque id the dApp chooses (random UUID per adapter instance by default); echoed by the wallet in every result.                                         |
| `genesisHash`   | Base64 genesis hash of the network the dApp operates on (`NetworkConfig.genesisHash`), e.g. `SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=` for testnet. |

## 3. Origin pinning

The dApp side pins `WALLET_ORIGIN`:

- default: `new URL('https://wallet.biatec.io').origin`;
- override only through the explicit `direct: { walletUrl }` option, which MUST be `https:` or
  `http:` on `localhost` / `127.0.0.1` (no credentials in the URL), and which logs a one-time
  `console.warn` ("non-default wallet origin"). It exists for wallet development; a production
  dApp MUST NOT set it, because whoever controls this origin controls what the user signs.

The wallet side pins the dApp origin to the **`origin` query hint** it was opened with and
verifies it against `event.origin` of the first request (see §6).

## 4. Opening the popup

```
window.open(
  `${WALLET_ORIGIN}/direct?origin=${encodeURIComponent(DAPP_ORIGIN)}`,
  'biatec-wallet-direct',
  'popup,width=480,height=720,left=<centered>,top=<centered>'
)
```

- The call MUST be made **synchronously** within a user gesture (a click handler): no `await`
  before it. Otherwise browsers return `null` (popup blocked). The SDK maps `null` to
  `PopupBlockedError`.
- The feature string MUST NOT contain `noopener` or `noreferrer` (they sever `window.opener`).
- The `origin` query parameter is a **hint** telling the wallet where to address its `ready`
  message. It is not trusted as identity: the wallet takes the dApp's identity from `event.origin`
  (§6).
- The dApp page MUST NOT send `Cross-Origin-Opener-Policy: same-origin` (that severs the opener
  relationship). `same-origin-allow-popups` or no COOP header work. The wallet's `/direct` route
  MUST NOT send COOP `same-origin` either.

## 5. Messages

All messages are objects posted with `postMessage`. Strings below are literal.

### 5.1 `ready` (wallet → dApp)

Posted by the wallet **once its `/direct` page has mounted and the wallet is unlocked** (a locked
wallet shows its login in place first). Posted to `window.opener` with `targetOrigin` set to the
`origin` query hint; if the hint is absent or not a valid origin the wallet MUST NOT post at all.
It carries nothing secret.

```json
{
  "v": 1,
  "reference": "biatec:direct:ready",
  "capabilities": {
    "methods": ["enable", "sign_transactions", "sign_data"],
    "genesisHashes": ["<base64>"]
  }
}
```

| Field                        | Type       | Rules                                                                                                                                                                  |
| ---------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v`                          | integer    | Protocol version. This document is `1`. A different integer makes the SDK reject with `4003`.                                                                          |
| `reference`                  | string     | Exactly `biatec:direct:ready`.                                                                                                                                         |
| `capabilities.methods`       | `string[]` | At most 64 entries, each 1-256 chars. **Informational in v1** (names of the operations the popup handles); the SDK does not gate on it.                                |
| `capabilities.genesisHashes` | `string[]` | At most 64 entries. The networks the wallet can currently serve. If non-empty and it does not contain the dApp's `genesisHash`, the SDK fails early with error `4004`. |

### 5.2 Request (dApp → wallet)

Sent once, after `ready`, with `popup.postMessage(request, WALLET_ORIGIN)`. `targetOrigin` is
always `WALLET_ORIGIN`, **never `"*"`**.

```json
{ "id": "<uuid>", "reference": "arc0027:<method>:request", "params": { "providerId": "…", "genesisHash": "…", … } }
```

`id` is a fresh UUID per request. Methods:

| `reference`                         | `params`                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arc0027:enable:request`            | `{ providerId, genesisHash, metadata: { name, description, url, icons[] } }`. Asks the user which accounts to expose to this site. `metadata` is dApp-self-reported and MUST be shown as unverified.                                                                                                          |
| `arc0027:sign_transactions:request` | `{ providerId, genesisHash, txns: [{ txn, signers?, authAddr?, msig?, stxn? }] }`. `txn` is the base64url canonical msgpack of the unsigned transaction. `signers: []` marks a position the wallet MUST NOT sign (foreign sender, not selected, or already signed) — exactly the ARC-0001 / Liquid Auth rule. |
| `arc0060:sign_data:request`         | `{ providerId, genesisHash, items: [LiquidStdSigData] }` — an ARC-0060 `StdSigData` with every byte field base64url encoded. Same payload as the Liquid Auth transport.                                                                                                                                       |
| `arc0027:disable:request`           | Reserved. Defined so the wallet can implement "forget this site"; **the SDK v1 never sends it** (it does not open a popup on `disconnect()`).                                                                                                                                                                 |

> **Note on the data-signing reference.** Data signing reuses the Liquid Auth reference
> `arc0060:sign_data:*` (this package's `LiquidReference.signDataRequest`). Wallet issue #192
> prints it as `arc0027:sign_data:*` in its sequence diagram while stating "same as Liquid"; the
> wallet MUST accept `arc0060:sign_data:request` and answer with `arc0060:sign_data:response`.
> Responses are matched on the exact expected reference.

### 5.3 Response (wallet → dApp)

```json
{ "id": "<uuid>", "requestId": "<the request id>", "reference": "arc0027:<method>:response",
  "result": { … } }
```

or, on failure, `"error": { "code": <integer>, "message": "<string>", "data"?: … }` **instead of**
`result`. Exactly one of `result` / `error` MUST be present.

| Method              | `result`                                                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enable`            | `{ providerId, genesisHash, accounts: [{ address, name? }] }` — the accounts **the user approved in the wallet** (1-100). `genesisHash` echoes the request.                                                                                                                                |
| `sign_transactions` | `{ providerId, stxns: (string \| null)[] }` — same length as `txns`. Each non-null entry is the base64url **signed transaction** (or, for Android-reference-wallet compatibility, a raw 64-byte ed25519 signature). `null` for positions with `signers: []` or that the user did not sign. |
| `sign_data`         | `{ providerId, signatures: (string \| null)[] }` — same length as `items`, base64url signatures.                                                                                                                                                                                           |

Reference of the response is the request reference with `request` → `response`.

### 5.4 Error codes

Reused from ARC-0027/ARC-0001/ARC-0060 (`LiquidErrorCode`):

| Code | Meaning                                                   | Typical SDK surface                                                                                |
| ---- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 4000 | unknown                                                   | `LiquidProviderError`                                                                              |
| 4001 | user rejected / popup closed                              | `LiquidProviderError` (`SignDataError` 4001 for `signData`)                                        |
| 4002 | timed out                                                 | `LiquidProviderError`                                                                              |
| 4003 | method / protocol version not supported                   | `LiquidProviderError`                                                                              |
| 4004 | network not supported                                     | `DirectNetworkMismatchError` (carries the requested `genesisHash` and the wallet's, when reported) |
| 4100 | unauthorized: origin not connected / account not approved | `LiquidProviderError` ("reconnect")                                                                |
| 4200 | invalid input / malformed message                         | `LiquidProviderError`                                                                              |
| 4201 | invalid group id                                          | `LiquidProviderError`                                                                              |
| 4300 | failed to post / cannot sign                              | `LiquidProviderError`                                                                              |

## 6. Wallet-side requirements (summary)

The wallet is the party that protects the user's keys; the SDK-side rules in §7 only protect the
dApp. The wallet's `/direct` route MUST:

1. refuse to run when `window.top !== window.self` (framed) or when there is no live
   `window.opener`, and in that case post nothing;
2. check **every** inbound message with `event.source === window.opener` before reading anything
   else;
3. take the dApp identity from `event.origin` of the first request, remember it, and reply only
   via `window.opener.postMessage(response, thatOrigin)` — never `"*"` after the handshake;
4. accept **exactly one request** per popup lifetime (a second one is answered with `4200` /
   ignored) and only within 30 seconds after `ready` was posted;
5. look up the stored session by `event.origin` for `sign_*` requests: no session → error `4100`;
   an address not in the session's approved accounts → `4100`;
6. reject a `genesisHash` that differs from its active network with `4004` (never sign for a
   different network);
7. treat the dApp's `metadata` (name, icons) as **unverified**; the origin is the headline shown
   to the user;
8. post `4001` on `pagehide` / unload while a request is pending, and close itself after the
   reply is flushed;
9. never navigate `window.opener`, and keep `rel="noopener noreferrer"` on its outgoing links;
10. send `Content-Security-Policy: frame-ancestors 'none'`, and no `Cross-Origin-Opener-Policy:
same-origin`.

## 7. SDK-side requirements (what this package enforces)

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `window.open` is the first statement of the user-gesture path; the connect dialog has an explicit "Open Biatec Wallet" button whose click calls it synchronously. `null` handle → `PopupBlockedError`.                                                                                                                                                                                                                                                                |
| 2   | An inbound message is considered only if `event.origin === WALLET_ORIGIN` **and** `event.source === popup`. Everything else is ignored silently.                                                                                                                                                                                                                                                                                                                      |
| 3   | Outbound `postMessage` always has `WALLET_ORIGIN` as `targetOrigin`.                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4   | One request per popup; a fresh `id` (UUID) per request; only one popup/request in flight at a time (a second concurrent call is rejected with `4200`).                                                                                                                                                                                                                                                                                                                |
| 5   | Before `ready`: anything from the trusted origin/source other than a valid `ready` is a protocol error (`4200`). After `ready`: only an object whose `requestId` equals our request id is considered a response; other messages (repeated `ready`, stray data, responses to other ids) are ignored.                                                                                                                                                                   |
| 6   | The matching response is **strictly validated**: exact `reference`, exactly one of `result`/`error`, `error` is `{ code: integer, message: string }` (message truncated to 500 chars), `providerId` equals ours (else `4200`), every field type-checked, all arrays bounded and — for sign results — of exactly the request's length, base64url strings charset-checked and length-bounded. Anything malformed rejects with `4200`; the message handler never throws. |
| 7   | `enable`: every returned `address` must pass `algosdk.isValidAddress`; duplicates are dropped; the echoed `genesisHash` must equal the requested one (else `4004`); 1-100 accounts.                                                                                                                                                                                                                                                                                   |
| 8   | `sign_transactions`: each returned signed transaction must decode (`decodeSignedTransaction`), its transaction must have the **same txID** as the unsigned transaction that was sent, and it must carry a `sig`, `msig` or `lsig`. A raw 64-byte signature is attached locally to the original transaction. Mismatch → `4200`; the call never returns unchecked bytes. Positions sent with `signers: []` are returned as `null` regardless of what the wallet sent.   |
| 9   | After a request settles (success, error, timeout, close, abort) the `message` listener is removed, all timers are cleared, and later messages are ignored. On failure the popup is closed.                                                                                                                                                                                                                                                                            |
| 10  | `popup.closed` is polled every 500 ms; a popup that stays closed for two consecutive polls rejects with `4001` (the second poll is a grace tick for a reply posted just before the wallet closed itself).                                                                                                                                                                                                                                                             |
| 11  | Timeouts: waiting for `ready` (the user may be unlocking the wallet) uses `connectTimeoutMs` (default 5 min) → `4002`; waiting for the response uses `connectTimeoutMs` for `enable` and `requestTimeoutMs` (default 5 min) for signing → `4002`.                                                                                                                                                                                                                     |
| 12  | `disconnect()` closes the popup and rejects the pending request. The SDK does not open a popup just to send `disable`.                                                                                                                                                                                                                                                                                                                                                |
| 13  | `resumeSession()` opens nothing: accounts come from the use-wallet store. A persisted session whose `walletOrigin` differs from the currently pinned `WALLET_ORIGIN` is dropped.                                                                                                                                                                                                                                                                                      |

## 8. Sequence

```
dApp (adapter)                                              wallet popup (WALLET_ORIGIN/direct)
 │ click → window.open(url, 'biatec-wallet-direct', features)   (sync, no await)
 │                                                              │ mount; locked → login in place; framed/no opener → refuse
 │  ◄── { v:1, reference:'biatec:direct:ready', capabilities }   │ postMessage(ready, <origin hint>)
 │      accept iff event.origin === WALLET_ORIGIN && event.source === popup
 │ ──► popup.postMessage({ id, reference:'arc0027:enable:request', params }, WALLET_ORIGIN)
 │                                                              │ record dappOrigin = event.origin; user picks accounts
 │  ◄── { id, requestId, reference:'arc0027:enable:response', result:{ providerId, genesisHash, accounts } }
 │      accept iff origin/source match AND requestId === our id; validate; popup closes itself
 │
 │ later: click → window.open(same name) → ready → one request (sign_transactions | sign_data) → one response
```

## 9. Local testing

Different ports are different origins, so the cross-origin path is exercised locally: dApp on
`http://localhost:5173`, wallet on `http://localhost:8080`, and
`biatec({ ..., direct: { walletUrl: 'http://localhost:8080' } })`. This package's own e2e suite
(`e2e/direct-popup.spec.ts`) serves a stub wallet on `http://127.0.0.1:5184` that implements §5
and the origin/source checks of §6.

## 10. Out of scope for v1

- `MessagePort` hand-off after the handshake (EIP-7039 style) to hide traffic from other scripts
  on the dApp page — possible v1.1 hardening, not required for the security model.
- Reusing one popup for several requests of a transaction group (one request per popup keeps the
  protocol simple and auditable).
- Hiding the `direct` tab on mobile browsers (popups are tabs there); the dApp can pass
  `direct: false` or `defaultMethod` per user agent.
