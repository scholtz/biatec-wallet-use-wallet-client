# Biatec Liquid Auth protocol

The Liquid Auth transport of this package's `biatec()` wallet (`LiquidTransport`, in
`src/transports/liquid-transport.ts`), and the dApp ⇄ Biatec Wallet communication protocol built
on the Algorand Foundation's **Liquid Auth** (<https://liquidauth.com>,
<https://github.com/algorandfoundation/liquid-auth>). Liquid Auth is the Foundation's
WalletConnect replacement: a FIDO2/passkey-authenticated link followed by a direct, encrypted,
peer-to-peer WebRTC channel. It is not (yet) a numbered ARC; it builds on ARC-31 (proving control
of an account key) and its messages follow **ARC-0027** (provider message schema). This document
is the normative description of what the two Biatec implementations do —
[`src/liquid/`](../src/liquid) and [`src/transports/liquid-transport.ts`](../src/transports/liquid-transport.ts)
here (dApp side) and `src/scripts/liquid` + `src/store/liquid.ts` in the
[wallet](https://github.com/scholtz/wallet) (wallet side).

```mermaid
sequenceDiagram
    participant D as dApp (LiquidTransport)
    participant S as Liquid Auth service (https://liquid.biatec.io)
    participant W as Biatec Wallet (wallet.biatec.io)

    D->>D: requestId = UUID; show liquid://liquid.biatec.io/?requestId=…
    D->>S: socket.io `link {requestId}` (joins requestId room)
    W->>W: user pastes/scans link, picks account
    W->>S: POST /attestation/request (or /assertion/request/:credId)
    S-->>W: challenge (+ WebAuthn options)
    W->>W: passkey ceremony; sign challenge with account key
    W->>S: POST /attestation|assertion/response + liquid extension {address, signature, requestId}
    S-->>D: ack `link` → {requestId, wallet, credId}
    S-->>W: session cookie bound to wallet + requestId
    W->>S: socket.io connect (cookie) → `offer-description`, `offer-candidate`
    S-->>D: relayed into the requestId room
    D->>S: `answer-description`, `answer-candidate`
    S-->>W: relayed
    W-->>D: RTCDataChannel "liquid" opens
    D->>W: biatec:hello:request (dApp metadata)
    W-->>D: biatec:hello:response (wallet address, name, methods)
    D->>W: arc0027:sign_transactions:request / arc0060:sign_data:request
    W-->>D: …:response with result or error
```

## 1. Roles and components

| Component               | Role                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Liquid Auth service** | Stock `liquid-auth` server (NestJS + MongoDB + Redis). Authenticates the wallet with a passkey, brokers the WebRTC handshake between the two peers, never sees transactions. Biatec hosts one at `https://liquid.biatec.io`; the adapter's `origin` option points at it. |
| **dApp**                | Liquid Auth _answer_ peer. Generates the `requestId`, shows the deep link / QR, links, answers the wallet's WebRTC offer, sends ARC-0027 requests. Needs **no** passkey and no service account.                                                                          |
| **Wallet**              | Liquid Auth _offer_ peer. Authenticates at the service with a passkey carrying the `liquid` extension (the challenge signed by the account key), creates the WebRTC offer and the `liquid` data channel, answers requests after user approval.                           |
| **ICE**                 | Public Google STUN servers (`stun.l.google.com:19302` … `stun4`). No TURN by default; pass `iceServers` to add one for symmetric-NAT environments.                                                                                                                       |

### Why the service must live under the wallet's domain

WebAuthn only lets a page register a passkey whose RP ID is its own registrable domain. A
**web** wallet at `wallet.biatec.io` can therefore only authenticate against a service whose
`HOSTNAME` (RP ID) is `biatec.io`/`wallet.biatec.io` and whose `ORIGIN` is
`https://wallet.biatec.io`. This inverts the Liquid Auth docs' "the dApp hosts the service"
guidance (written for native wallets): with Biatec Wallet, **dApps use Biatec's service**. The
adapter defaults `origin` to it. Any origin can still be passed for self-hosted deployments that
run a Biatec Wallet build under their own domain.

## 2. Linking

1. dApp: `requestId = crypto.randomUUID()`, deep link
   `liquid://<service host>[/<path>]/?requestId=<requestId>` (see `generateLiquidDeepLink`).
   Shown via `onDisplayUri` (QR) or the built-in copy dialog.
2. dApp: opens a socket.io connection to the service (`transports: ['websocket']`,
   `withCredentials: true`) and emits `link { requestId }`. The server joins the socket to the
   `requestId` room; the acknowledgement arrives only once a wallet authenticates for it.
3. Wallet: parses the link (`parseLiquidDeepLink`), lets the user choose an account, then:
   - first time for that (service, account): **attestation** —
     `POST {origin}/attestation/request` `{ username: <address>, displayName, authenticatorSelection: { userVerification: 'required' }, extensions: { liquid: true } }`
     → `navigator.credentials.create()` → `POST /attestation/response` with
     `clientExtensionResults.liquid = { type: 'algorand', address, signature: base64url(ed25519(challenge)), requestId, device }`.
     The service verifies the passkey **and** the account signature (following rekeys via algod).
   - afterwards: **assertion** — `POST /assertion/request/{credId}` → `navigator.credentials.get()`
     → `POST /assertion/response` with `clientExtensionResults.liquid = { requestId }`.
     The wallet stores `credId` per (service, address) in its encrypted wallet blob.
     All calls use `credentials: 'include'`; the HTTP-only session cookie now carries
     `wallet = <address>` and `requestId`.
4. Service: emits `auth {requestId, wallet, credId}` → the dApp's `link` ack resolves with
   `{ requestId, wallet, credId }`. The dApp records `wallet` as the connected account.

## 3. Signaling (WebRTC)

Socket.io events, all relayed by the server into the `requestId` room (senders also receive
their own messages and must ignore the other role's events):

| Event                | Sender | Payload                                                  |
| -------------------- | ------ | -------------------------------------------------------- |
| `offer-description`  | wallet | SDP string of `RTCPeerConnection.createOffer()`          |
| `offer-candidate`    | wallet | `RTCIceCandidateInit` JSON                               |
| `answer-description` | dApp   | SDP string of `createAnswer()`                           |
| `answer-candidate`   | dApp   | `RTCIceCandidateInit` JSON                               |
| `presence`           | server | `{ requestId, deviceCount, online }` on every join/leave |

The wallet creates the data channel with label **`liquid`** before creating the offer. The dApp
resolves `connect()` when `ondatachannel` fires and the channel reaches `open`. Candidates that
arrive before the remote description is set are buffered on both sides.

**Reconnection.** WebRTC does not survive a page reload. The dApp persists `{ requestId, origin }`
in the use-wallet account metadata and `resumeSession()` restores the account without network
activity; the first signing call re-runs `link` + answer (`reconnectTimeoutMs`, default 30 s).
The wallet keeps its socket open and, on a `presence` event with `deviceCount ≥ 2` while its
channel is not open, creates a fresh offer. If the wallet is closed, the dApp's request fails
with ARC-0027 error `4002` and a message telling the user to open Biatec Wallet.

## 4. Data channel messages

Every message is an ARC-0027 envelope, **CBOR-encoded** (`cbor-x`) and sent as a **base64url
string** (`encodeLiquidMessage` / `decodeLiquidMessage`) — identical to the Algorand
Foundation's `liquid-auth-use-wallet-client` and Android/iOS wallets.

```ts
// request
{ id: string /* uuid */, reference: string, params: object }
// response
{ id: string, requestId: string /* id of the request */, reference: string, result?: object, error?: { code, message, data?, providerId? } }
```

The dApp correlates responses by `requestId === request.id`. Requests time out after
`requestTimeoutMs` (default 5 min) with error `4002`.

### 4.1 `biatec:hello:request` / `biatec:hello:response` (Biatec extension, optional)

Sent by the dApp right after the channel opens. Wallets that don't implement it are tolerated
(10 s timeout, logged, connection continues).

```ts
params: { providerId: string, metadata: { name, description, url, icons: string[] } } // dApp self-description
result: { providerId: string, wallet: string, name?: string, version?: string, methods?: string[] }
```

The wallet displays `metadata` (name/url) next to the session and uses `metadata.url` as the
best available "connected app origin" when checking ARC-0060 domains (see §5).

### 4.2 `arc0027:sign_transactions:request` / `:response` (ARC-0027 + ARC-0001)

```ts
params: {
  providerId: string,
  txns: Array<{ txn: string /* base64url msgpack; wallets also accept base64 */, signers?: string[], authAddr?: string, msig?: MultisigMetadata, stxn?: string }>
}
result: { providerId: string, stxns: Array<string | null> }
```

- `txns` follows ARC-0001 `WalletTransaction`: entries the dApp does not want signed (foreign
  senders, positions outside `indexesToSign`) carry `signers: []`.
- `stxns` is **positional**. Each entry is the base64url canonical msgpack of the signed
  transaction, or `null` where nothing was signed. For interoperability with the Foundation's
  Android reference wallet, which returns raw 64-byte signatures, the adapter treats a 64-byte
  entry as a signature and attaches it to the original transaction.
- Errors: `4001` user rejected, `4002` timed out, `4003` method not supported, `4200` malformed.

### 4.3 `arc0060:sign_data:request` / `:response` (ARC-0060, Biatec extension)

```ts
params: { providerId: string, items: Array<StdSigData & { scope: number, encoding: string }> }
// StdSigData byte fields (data, signer public key, authenticatorData) are base64url
result: { providerId: string, signatures: Array<string /* base64url */ | null> }
```

The dApp builds each item exactly as for WalletConnect (`BaseWallet.createStdSignData`:
`domain = location.host`, `authenticatorData = SHA-256(domain)`, `signer` = the account's
public key, following an on-chain rekey). The wallet verifies `authenticatorData` against
`domain`, checks the domain against the hello `metadata.url`, restricts the signer to the
session's account, and signs `SHA-256(data) || SHA-256(authenticatorData)` (ARC-0060 AUTH
scope). Adapter-side mapping to `SignDataError`: `4001` rejected, `4200` unsupported, `4300`
other.

### 4.4 Unknown references

The wallet answers any other `…:request` with error `4003` on the matching `…:response`
reference; the dApp ignores unsolicited requests.

## 5. Security considerations

- **Wallet → dApp authentication is strong**: the service verifies a passkey (user presence +
  verification) and an account-key signature over its challenge before it tells the dApp which
  address it is talking to. The dApp gets that address from the server's `link` ack, never from
  the wallet directly.
- **dApp → wallet authentication is weak**: Liquid Auth does not prove the dApp's origin to the
  wallet (the dApp is an anonymous socket). The hello `metadata` is self-declared. The wallet
  therefore shows the declared origin to the user and, for ARC-0060, requires the request's
  `domain` to match it — the same "user verifies the domain" model as a WalletConnect session
  without Verify. Anyone holding a `requestId` can attempt to link to it, which is why the
  service only reannounces a wallet that is genuinely present and refuses to hand a claimed
  requestId to a different wallet.
- **Channel confidentiality**: WebRTC data channels are DTLS-encrypted end to end; the service
  only ever sees SDP/ICE.
- **Session cookie**: the wallet's service session is an HTTP-only cookie scoped to the service
  origin; `SESSION_SECURE=true` is required in production.
- **Passkey RP ID**: the service's `HOSTNAME`/`ORIGIN` must match the wallet's domain (§1); a
  malicious service on another domain cannot obtain a passkey from the wallet page.

## 6. Service deployment requirements (for operators)

Environment for the stock `liquid-auth` image, using Biatec's deployment as the example:

```
RP_NAME="Biatec Wallet"
HOSTNAME=biatec.io                 # RP ID — registrable domain of the wallet
ORIGIN=https://wallet.biatec.io    # expected WebAuthn origin
SESSION_SECURE=true
SESSION_SECRET=<random>
DB_* / REDIS_*                     # MongoDB + Redis as documented upstream
ALGOD_SERVER=https://mainnet-api.4160.nodely.dev   # used to resolve rekeys when verifying signatures
```

Plus, in front of the service (ingress / reverse proxy), because both peers are cross-origin
to it:

- `Access-Control-Allow-Origin: https://wallet.biatec.io`, `Access-Control-Allow-Credentials: true`
  and the `OPTIONS` preflight for `/attestation/*`, `/assertion/*`, `/auth/*` (the stock server
  does not call `enableCors()`; socket.io already allows `origin: '*'`).
- WebSocket upgrade for `/socket.io/`.

The wallet-side document (`docs/LIQUID_AUTH.md` in the wallet repo) repeats these requirements.

## 7. Differences from the official Liquid Auth clients

| Topic                  | Foundation clients                                                                       | This implementation                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| dApp signaling library | `@algorandfoundation/liquid-client` (pulls `node-canvas`, GitHub-only `qr-code-styling`) | ~200 lines over `socket.io-client`; QR rendering left to the dApp (`onDisplayUri`) |
| Message library        | `@algorandfoundation/provider` (GitHub dependency)                                       | typed builders in `src/liquid/protocol.ts` (same wire format)                      |
| `stxns` contents       | raw signatures (Android) / undefined (docs)                                              | signed transaction bytes; raw signatures accepted                                  |
| ARC-0060               | not available                                                                            | `arc0060:sign_data:*`                                                              |
| Hello handshake        | none                                                                                     | `biatec:hello:*`, optional                                                         |
| Service hosting        | dApp hosts                                                                               | wallet operator hosts (web-wallet RP ID constraint)                                |

## References

- Liquid Auth: architecture, decisions and SEQUENCE.md —
  <https://github.com/algorandfoundation/liquid-auth> (server: `src/signals/signals.gateway.ts`,
  `src/attestation`, `src/assertion`)
- Browser client and use-wallet client — <https://github.com/algorandfoundation/liquid-auth-js>,
  <https://github.com/algorandfoundation/liquid-auth-use-wallet-client>
- ARC-0027 provider message schema — <https://github.com/algorandfoundation/ARCs/blob/main/ARCs/arc-0027.md>
- ARC-0001, ARC-0060, ARC-0031 — <https://github.com/algorandfoundation/ARCs>
- Foundation announcement — <https://algorand.co/blog/authenticated-comms-between-wallets-apps>
