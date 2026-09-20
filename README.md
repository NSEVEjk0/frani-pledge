# Frani Pledge

Conditional UCT pledges on Unicity testnet2. A campaign states a condition — "3 pledgers join" or "reach 100 UCT" — and collects pledges up front. If the condition is met, the pledges are kept and every pledger receives a signed completion receipt. If the campaign fails or expires, every pledge is refunded.

Made by **CRYPTFRANI**. Owner / creator: **Itachi**.

---

## Track

Payments and markets.

## Is it Agentic?

No. Frani Pledge evaluates a fixed condition against recorded pledges and resolves the campaign one way or the other. No autonomous planning, no model in the loop.

## Runs on AstridOS?

No.

## Live on-network

- Network: **testnet2**
- Wallet pubkey (from a live boot): `038ad1445fb1f127233b6a6cb212692a841e2076b3709735f38c6e7e7b196a78ef`

Each deployment holds its own wallet and prints its address at startup.

## SDK features used

| Feature | Where |
| --- | --- |
| `sphere.payments.requests.create()` | Delivers a pledge payment request |
| `transfer:incoming` event | Records a pledge and re-evaluates the condition |
| `sphere.signMessage()` | Signs the completion receipt on success |
| `verifySignedMessage()` / `recoverPubkeyFromSignature()` | Offline receipt verification |
| `sphere.payments.send()` | Refunds pledges on failure/expiry (only outbound path) |
| `isPossiblyCommittedSendOutcome` / `PartialSendConflictError` | Refund money-safety — never double-pays |
| `sphere.communications` (DM) | `pledge` / `status` / `about` / `help` |

## What makes it different

A pledge here is a real payment collected up front, not a promise to pay later. The condition is explicit and machine-checkable — a distinct-pledger count or a cumulative amount — and the campaign resolves deterministically:

- **Succeeds** the moment the condition is met (on a new pledge, or on the periodic sweep). Pledges are kept as earnings and each pledger is DM'd a signed completion receipt binding their pledge to the fulfilled condition.
- **Fails** if the deadline passes unmet. Every pledge is refunded, exactly once.

It is **earn-only**: the only outbound payment is a refund on failure or expiry. Stray payments that arrive with no open campaign are refunded rather than kept. Refunds use the SDK's possibly-committed / partial-conflict guards, so a refund is never re-sent in a way that could double-pay.

## Condition types

```
--count N        succeeds when N distinct pledgers have paid
--amount X       succeeds when total pledged reaches X UCT
```

Both support an optional `--min` per-pledge minimum and an `--expires-in` deadline in seconds.

## Try it without a wallet

The condition logic and completion-receipt round-trip run with no network:

```bash
npm install
npm test
```

## Commands

```
pledge new --title "..." (--count N | --amount UCT) [--min UCT] [--expires-in SECONDS]
pledge list                    All campaigns with progress
pledge show <PLG-id>           Full JSON for one campaign
pledge about                   What this service is
pledge help                    Command list
pledge daemon                  Run the pledge + DM service
```

Over DM, a backer sends: `pledge <PLG-id> [amount]` (get a payment request), `status <PLG-id>`, `about`, `help`.

## Run it

```bash
# 1. install
npm install

# 2. copy config (defaults to testnet2)
cp .env.example .env

# 3. create a campaign
node bin/pledge.js new --title "Ship v1" --count 3 --min 1 --expires-in 86400

# 4. run the daemon (records pledges, resolves the condition, refunds on expiry)
node bin/pledge.js daemon

# 5. check progress
node bin/pledge.js list
```

### As a service

```bash
sudo cp systemd/frani-pledge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now frani-pledge
journalctl -u frani-pledge -f
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PLEDGE_NETWORK` | `testnet2` | Network. testnet2 only; other values are refused. |
| `PLEDGE_DATA_DIR` | `./wallet-data` | Where the wallet keys/state live. |
| `PLEDGE_WALLET_API` | `https://wallet-api.unicity.network` | testnet2 wallet-api. |
| `PLEDGE_ORACLE_KEY` | public testnet2 key | Oracle key (not a secret on testnet2). |
| `PLEDGE_DEVICE_ID` | `frani-pledge-1` | Stable per-machine session id. |
| `PLEDGE_NAMETAG` | _(empty)_ | Optional @nametag to register on first run. |
| `PLEDGE_DIR` | `./campaigns` | Where campaigns are stored. |
| `PLEDGE_SWEEP_SECONDS` | `30` | How often to check for met conditions / expiries. |

## Completion receipt shape

```json
{
  "version": "frani-pledge/1",
  "network": "testnet2",
  "campaignId": "PLG-F60D81",
  "campaignTitle": "Ship v1",
  "pledger": "02a9d4…",
  "amountBase": "3000000000000000000",
  "condition": { "type": "amount", "target": "5000000000000000000" },
  "resolvedAtIso": "2026-09-20T19:30:00.000Z",
  "signer": { "pubkey": "038ad1…78ef" },
  "signature": "…",
  "issuer": "Frani Pledge · CRYPTFRANI"
}
```

The signed string binds version, network, campaign id, pledger, amount, condition, resolve time, and a nonce. Verification recomputes it and checks the signature recovers to `signer.pubkey`.

## Structure

```
bin/pledge.js       CLI + daemon entrypoint
src/config.js       env-driven config, testnet2 guard
src/wallet.js       Sphere SDK boundary (holds its own keys)
src/amounts.js      BigInt UCT ↔ base-unit conversion
src/pledge.js       campaign model + condition evaluation
src/receipt.js      signed completion receipt build + verify
src/refund.js       single-attempt, double-pay-safe refunds
src/store.js        JSON campaign archive
src/service.js      DM command handler
test/pledge.test.js condition + receipt tests
systemd/            service unit
```

## Tests

```bash
npm test
```

Seven checks cover count and amount conditions, distinct-pledger handling, expiry, condition validation, and the completion-receipt sign/verify round-trip with tamper detection.

## Keys and safety

Frani Pledge holds its own wallet under `wallet-data/`. It never asks anyone for a seed or private key, runs on testnet2 only, and refuses to start on another network unless explicitly overridden. The only outbound payment is a refund on failure/expiry. `.env`, `wallet-data/`, and `campaigns/` are gitignored.

---

MIT licensed. Not financial software; provided as-is.
