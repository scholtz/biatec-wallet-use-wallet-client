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

| Term            | Meaning                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DAPP_ORIGIN`   | `location.origin` of the dApp page that called `window.open`. Must be a real http(s) origin (never the opaque origin `"null"`).                                                                                                                                                                                                                                                                                  |
| `WALLET_ORIGIN` | The wallet's origin. By default `https://wallet.biatec.io`. Pinned in the SDK; see §3.                                                                                                                                                                                                                                                                                                                           |
| popup           | The `WindowProxy` returned by the dApp's `window.open`. The wallet sees the dApp as `window.opener`.                                                                                                                                                                                                                                                                                                             |
| request         | One ARC-0027 request message. **Exactly one request is exchanged per popup lifetime.**                                                                                                                                                                                                                                                                                                                           |
| `providerId`    | Appears in requests (the dApp's own id, informational) **and in results, where it identifies the wallet provider**: the wallet answers with its own fixed provider id (e.g. `8f7a1c2e-5b3d-4e9f-a6c0-1d2e3f4a5b6c`), it does **not** echo the dApp's. It is not an authenticator (origin + source window + `requestId` are); the SDK only checks it is a non-empty string of at most 128 characters.             |
| `genesisHash`   | Genesis hash of the network, **base64 or base64url, padded or not**. The dApp sends what use-wallet has (`NetworkConfig.genesisHash`, padded standard base64, e.g. `SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=`); the wallet answers with a normalized form (base64url, no padding, e.g. `SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9_cOUJOiI`). Implementations MUST compare the decoded 32 bytes, never the strings. |

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
  `biatec-wallet-direct-${uuid}`,
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
    "methods": [
      "arc0027:enable:request",
      "arc0027:disable:request",
      "arc0027:sign_transactions:request",
      "arc0060:sign_data:request"
    ],
    "genesisHashes": []
  }
}
```

| Field                        | Type       | Rules                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `v`                          | integer    | Protocol version. This document is `1`. A different integer makes the SDK reject with `4003`.                                                                                                                                                                                              |
| `reference`                  | string     | Exactly `biatec:direct:ready`.                                                                                                                                                                                                                                                             |
| `capabilities.methods`       | `string[]` | At most 64 entries, each 1-256 chars. The wallet lists the **full request reference strings** it handles (e.g. `arc0027:enable:request`). **Informational in v1**; the SDK does not gate on it.                                                                                            |
| `capabilities.genesisHashes` | `string[]` | At most 64 entries. **Reserved: the current wallet sends `[]`; do not rely on it.** If a wallet does list networks and none equals (by decoded bytes) the dApp's `genesisHash`, the SDK fails early with `4004`; the authoritative check is the wallet's own `4004` answer to the request. |

### 5.2 Request (dApp → wallet)

Sent once, after `ready`, with `popup.postMessage(request, WALLET_ORIGIN)`. `targetOrigin` is
always `WALLET_ORIGIN`, **never `"*"`**.

```json
{ "id": "<uuid>", "reference": "arc0027:<method>:request", "params": { "providerId": "…", "genesisHash": "…", … } }
```

`id` is a fresh UUID per request. Methods:

| `reference`                         | `params`                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `arc0027:enable:request`            | `{ providerId, genesisHash, metadata: { name, description, url, icons[] } }`. Asks the user which accounts to expose to this site. `metadata` is dApp-self-reported and MUST be shown as unverified.                                                                                                                                                                                       |
| `arc0027:sign_transactions:request` | `{ providerId, genesisHash, txns: [{ txn, signers?, authAddr?, msig?, stxn? }] }`. `txn` is the base64url canonical msgpack of the unsigned transaction. `signers: []` marks a position the wallet MUST NOT sign (foreign sender, not selected, or already signed) — exactly the ARC-0001 / Liquid Auth rule.                                                                              |
| `arc0060:sign_data:request`         | `{ providerId, genesisHash, items: [LiquidStdSigData] }` — an ARC-0060 `StdSigData` with every byte field base64url encoded. Same payload as the Liquid Auth transport. The ARC-0060 `domain` that use-wallet supplies is `location.host` (it includes a non-default port); the wallet accepts it as equal to either the `host` or the `hostname` of the verified dApp origin.             |
| `arc0027:disable:request`           | Implemented by the wallet (removes the site's grant). **The SDK never sends it**: `disconnect()` stays local, because opening a popup needs a user gesture that `disconnect()` does not have. The wallet-side grant is revoked in the wallet's **Connect → Direct** tab; every signature still needs a fresh approval in a fresh popup, so a leftover grant never signs anything silently. |

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

| Method              | `result`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enable`            | `{ providerId, genesisHash, accounts: [{ address, name? }] }` — the accounts **the user approved in the wallet** (1-100). The wallet currently sends `{ address }` only: account names are the user's private labels and are **not** shared with dApps; `name` stays optional in the schema for other wallets and the SDK falls back to a generated label. `genesisHash` is the network the wallet approved (normalized form, see §2); `providerId` is the wallet's; an optional `wallet` brand string is informational. |
| `sign_transactions` | `{ providerId, stxns: (string \| null)[] }` — same length as `txns`. Each non-null entry is the base64url **signed transaction** (or, for Android-reference-wallet compatibility, a raw 64-byte ed25519 signature). `null` is allowed **only** at positions the request marked `signers: []`; a `null` at a position the dApp asked to sign is treated by the SDK as a rejection of the whole request (error `4001`, "did not sign the transaction at position N"), never passed through as a hole in the group.         |
| `sign_data`         | `{ providerId, signatures: (string \| null)[] }` — same length as `items`, base64url ed25519 signatures (64 bytes) over `sha256(data) \|\| sha256(authenticatorData)` by the item's `signer` key. The SDK verifies each one locally and rejects an invalid signature with `4200`.                                                                                                                                                                                                                                        |

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
3. take the dApp identity from the `origin` URL hint **and** require it to equal `event.origin` of the first request (so the two are equivalent), remember it, and reply only
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

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Before `window.open`, the dApp origin is checked the way the wallet checks it: `https:` any host, or `http:` only on `localhost`, `*.localhost`, `127.0.0.1`, `[::1]`; canonical origin; hostname must not end with `.`. Anything else throws a `SessionError` instead of opening a popup the wallet would refuse. `window.open` is the first statement of the user-gesture path; the connect dialog has an explicit "Open Biatec Wallet" button whose click calls it synchronously. `null` handle → `PopupBlockedError`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2   | An inbound message is considered only if `event.origin === WALLET_ORIGIN` **and** `event.source === popup`. Everything else is ignored silently.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3   | Outbound `postMessage` always has `WALLET_ORIGIN` as `targetOrigin`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 4   | One request per popup; a fresh `id` (UUID) per request, and a **unique window name per session** (`biatec-wallet-direct-<uuid>`). A dApp MUST NOT reuse a window name for a second request: the wallet popup is **single-use** (its channel is consumed for the lifetime of that window, tracked in `sessionStorage`), so a reused name would navigate a popup left open by an earlier load and the wallet would never post `ready` (a hang until the connect timeout). Additionally **at most one popup/request is in flight per page** (a module-level guard keyed by the page window, shared by every adapter/transport instance on it): a second concurrent call, from any instance, is rejected with `4200` and never touches the first popup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 5   | Before `ready`: anything from the trusted origin/source other than a valid `ready` is a protocol error (`4200`). After `ready`: only an object whose `requestId` equals our request id is considered a response; other messages (repeated `ready`, stray data, responses to other ids) are ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6   | The matching response is **strictly validated**: exact `reference`, exactly one of `result`/`error`, `error` is `{ code: integer, message: string }` (message truncated to 500 chars), `providerId` is a non-empty string of at most 128 chars (it is the wallet's, not compared with the dApp's), every field type-checked, all arrays bounded and, for sign results, of exactly the request's length, base64url strings charset-checked and length-bounded. Anything malformed rejects with `4200`; the message handler never throws.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7   | `enable`: every returned `address` must pass `algosdk.isValidAddress`; duplicates are dropped; the returned `genesisHash` must denote the requested network (decoded-bytes comparison, else `4004`); 1-100 accounts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8   | `sign_transactions`: each returned signed transaction must decode, its transaction must have the **same txID** as the unsigned transaction that was sent, and it must carry a signature. An ed25519 `sig` (also a raw 64-byte signature, which is then attached locally) must be exactly 64 bytes and **verify cryptographically** over the transaction's `bytesToSign()` against the sender, or, for a rekeyed sender, against its auth address, which the SDK confirms on chain (algod `accountInformation` with `exclude=all`, queried at most once per sender per call and only when the signature does not verify for the sender and the wallet did not itself claim the sender signed; a rekey made by an **earlier transaction of the same group** is applied in order and needs no lookup; a failing lookup is reported as a network error, distinct from an invalid signature; the wallet's own `sgnr` claim is never trusted by itself). `msig` / `lsig` / `pqsig` get structural checks only. Mismatch → `4200`; the call never returns unchecked bytes. Positions sent with `signers: []` are returned as `null` regardless of what the wallet sent. `sign_data` signatures must be exactly 64 bytes and verify (ed25519) over `sha256(data) \|\| sha256(authenticatorData)` with the item's signer key (or, for a rekeyed signer, its auth address, confirmed on chain only when the signer key does not verify); the message of a wallet error is truncated to 500 characters and its `data` is reduced to at most 8 valid genesis hashes (anything else is dropped). |
| 9   | After a request settles (success, error, timeout, close, abort) the `message` listener is removed, all timers are cleared, and later messages are ignored. The popup is closed on every failure, **including when the wallet's reply fails local validation** (tampered transaction, bad base64, invalid signature, store failure).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 10  | `popup.closed` is polled every 500 ms; a popup that stays closed for two consecutive polls rejects with `4001` (the second poll is a grace tick for a reply posted just before the wallet closed itself).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 11  | Timeouts: waiting for `ready` (the user may be unlocking the wallet) uses `connectTimeoutMs` (default 5 min) → `4002`; waiting for the response uses `connectTimeoutMs` for `enable` and `requestTimeoutMs` (default 5 min) for signing → `4002`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 12  | `disconnect()` is local: it closes any open popup, rejects the pending request and clears the stored accounts. It never opens a popup (no user gesture); the grant kept by the wallet is removed in the wallet's Connect → Direct tab.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 13  | `resumeSession()` opens nothing: accounts come from the use-wallet store. A persisted session is dropped when its `walletOrigin` differs from the pinned `WALLET_ORIGIN`, or when its persisted `genesisHash` (decoded-bytes comparison) differs from the current active network.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## 8. Sequence

```
dApp (adapter)                                              wallet popup (WALLET_ORIGIN/direct)
 │ click → window.open(url, `biatec-wallet-direct-${uuid}`, features)   (sync, no await)
 │                                                              │ mount; locked → login in place; framed/no opener → refuse
 │  ◄── { v:1, reference:'biatec:direct:ready', capabilities }   │ postMessage(ready, <origin hint>)
 │      accept iff event.origin === WALLET_ORIGIN && event.source === popup
 │ ──► popup.postMessage({ id, reference:'arc0027:enable:request', params }, WALLET_ORIGIN)
 │                                                              │ record dappOrigin = event.origin; user picks accounts
 │  ◄── { id, requestId, reference:'arc0027:enable:response', result:{ providerId(wallet's), genesisHash(normalized), accounts } }
 │      accept iff origin/source match AND requestId === our id; validate; popup closes itself
 │
 │ later: click → window.open(fresh `biatec-wallet-direct-<uuid>` name) → ready → one request (sign_transactions | sign_data) → one response
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
