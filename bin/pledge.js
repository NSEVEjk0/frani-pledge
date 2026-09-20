#!/usr/bin/env node
// Frani Pledge — CLI + daemon entrypoint.
// Made by CRYPTFRANI. Owner / creator: Itachi. Unicity testnet2 only.

import process from 'node:process';
import { config } from '../src/config.js';
import { openWallet, closeWallet, uctCoinId } from '../src/wallet.js';
import { CampaignStore } from '../src/store.js';
import {
  createCampaign,
  addPledge,
  conditionMet,
  isExpired,
  markSucceeded,
  markFailed,
  progressText,
  totalPledgedBase,
  distinctPledgerCount,
  STATUS,
} from '../src/pledge.js';
import { toBaseUnits, fromBaseUnits } from '../src/amounts.js';
import { refundOnce } from '../src/refund.js';
import { createCompletionReceipt } from '../src/receipt.js';
import { handleMessage, HELP, aboutText, statusText } from '../src/service.js';

const log = (...a) => console.log(new Date().toISOString(), ...a);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function cmdHelp() {
  console.log(HELP);
}

async function cmdAbout() {
  try {
    const { sphere } = await openWallet();
    console.log(aboutText(sphere.identity));
    await closeWallet(sphere);
  } catch {
    console.log(aboutText(null));
  }
}

async function cmdNew(args) {
  // pledge new --title "..." --count 3 [--min 1] [--expires-in 3600]
  // pledge new --title "..." --amount 100 [--min 5] [--expires-in 86400]
  const title = args.title || 'Pledge';
  let condition;
  if (args.count != null && args.count !== true) {
    condition = { type: 'count', target: Number(args.count) };
  } else if (args.amount != null && args.amount !== true) {
    condition = { type: 'amount', target: toBaseUnits(args.amount, config.decimals) };
  } else {
    console.error('Usage: pledge new --title "..." (--count N | --amount UCT) [--min UCT] [--expires-in SECONDS]');
    process.exit(1);
  }
  const minPledgeBase = args.min != null && args.min !== true ? toBaseUnits(args.min, config.decimals) : '1';
  const expiresAt = args['expires-in'] ? Date.now() + Number(args['expires-in']) * 1000 : null;

  const { sphere } = await openWallet();
  try {
    const coinId = await uctCoinId();
    const store = new CampaignStore(config.campaignsDir);
    const campaign = createCampaign({
      title,
      condition,
      minPledgeBase,
      coinId,
      network: config.network,
      expiresAt,
    });
    await store.save(campaign);
    console.log(statusText(campaign));
    console.log('stored at', store._file(campaign.id));
  } finally {
    await closeWallet(sphere);
  }
}

async function cmdList() {
  const store = new CampaignStore(config.campaignsDir);
  const all = await store.list();
  if (all.length === 0) {
    console.log('No campaigns yet. Create one: pledge new --title "..." --count 3');
    return;
  }
  for (const c of all) {
    console.log(`${c.id}  ${c.status.padEnd(9)} ${c.title} — ${progressText(c, fromBaseUnits)}`);
  }
}

async function cmdShow(args) {
  const id = (args._[0] || '').toUpperCase();
  const store = new CampaignStore(config.campaignsDir);
  const c = await store.get(id);
  if (!c) {
    console.error(`No campaign ${id}.`);
    process.exit(1);
  }
  console.log(JSON.stringify(c, null, 2));
}

// Resolve and finalise a succeeded campaign: issue signed receipts to pledgers.
async function finaliseSuccess(sphere, store, campaign, identity) {
  markSucceeded(campaign);
  await store.save(campaign);
  log(campaign.id, 'SUCCEEDED — issuing completion receipts');
  for (const pledge of campaign.pledges) {
    const receipt = createCompletionReceipt({
      campaign,
      pledge,
      sign: (m) => sphere.signMessage(m),
      signerPubkey: identity.chainPubkey,
      signerNametag: identity.nametag,
    });
    await sphere.communications
      .sendDM(
        pledge.pledger,
        [
          `${campaign.id} "${campaign.title}" succeeded. Thank you for pledging.`,
          'Your signed completion receipt:',
          '',
          JSON.stringify(receipt),
        ].join('\n'),
      )
      .catch((e) => log('receipt DM failed:', e.message));
  }
  campaign.receiptsIssued = true;
  await store.save(campaign);
}

// Resolve and finalise a failed/expired campaign: refund every pledge once.
async function finaliseFailure(sphere, store, campaign, coinId, reason) {
  markFailed(campaign, reason);
  await store.save(campaign);
  log(campaign.id, 'FAILED (', reason, ') — refunding', campaign.pledges.length, 'pledges');
  for (const pledge of campaign.pledges) {
    if (pledge.refunded) continue;
    const r = await refundOnce(sphere, {
      recipient: pledge.pledger,
      amountBase: pledge.amountBase,
      coinId,
      memo: `Refund: ${campaign.id} ${reason}`,
    });
    pledge.refunded = { amountBase: pledge.amountBase, transferId: r.transferId || null, status: r.status };
    await store.save(campaign);
    await sphere.communications
      .sendDM(pledge.pledger, `${campaign.id} "${campaign.title}" ${reason}. Refunded ${fromBaseUnits(pledge.amountBase)} UCT (${r.status}).`)
      .catch(() => {});
  }
}

async function cmdDaemon() {
  const { sphere, created, generatedMnemonic } = await openWallet();
  const store = new CampaignStore(config.campaignsDir);
  await store.init();

  if (created && generatedMnemonic) {
    log('A NEW wallet was created. Back up', config.dataDir, '— the mnemonic is not shown again.');
  }

  const identity = sphere.identity;
  const coinId = await uctCoinId();
  log('Frani Pledge is live on', config.network);
  log('wallet pubkey:', identity?.chainPubkey);
  if (identity?.directAddress) log('direct address:', identity.directAddress);
  if (identity?.nametag) log('nametag: @' + identity.nametag);

  const deps = {
    identity,
    getCampaign: (id) => store.get(id),
    requestPledge: async (campaign, sender, amountArg) => {
      let amountBase;
      try {
        amountBase = amountArg ? toBaseUnits(amountArg, config.decimals) : campaign.minPledgeBase;
      } catch {
        return { success: false, error: 'invalid amount' };
      }
      if (BigInt(amountBase) < BigInt(campaign.minPledgeBase)) {
        amountBase = campaign.minPledgeBase;
      }
      const res = await sphere.payments.requests.create(sender, {
        coinId,
        amount: amountBase,
        memo: `Pledge to ${campaign.id} — ${campaign.title}`,
      });
      return { ...res, amountBase };
    },
  };

  sphere.on('message:dm', async (msg) => {
    const sender = msg.senderPubkey;
    const label = msg.senderNametag ? '@' + msg.senderNametag : sender?.slice(0, 12);
    log('dm from', label, '::', String(msg.content || '').slice(0, 80));
    try {
      const { reply } = await handleMessage(msg.content, sender, deps);
      if (reply) {
        await sphere.communications.sendDM(sender, reply);
        log('reply sent to', label);
      }
    } catch (err) {
      log('handler error:', err.message);
    }
  });

  // Incoming pledge payment → attach to a matching open campaign, then check
  // whether the condition is now met.
  sphere.on('transfer:incoming', async (transfer) => {
    let sum = 0n;
    for (const t of transfer.tokens || []) {
      if (t.coinId === coinId && t.amount != null) {
        try {
          sum += BigInt(t.amount);
        } catch {
          /* ignore */
        }
      }
    }
    if (sum <= 0n) return;
    const pledger = transfer.senderPubkey;
    const amountBase = sum.toString();
    log('incoming pledge', fromBaseUnits(amountBase), 'UCT from', pledger?.slice(0, 12));

    // Attach to the oldest OPEN campaign. (A single-purpose deployment runs one
    // campaign at a time; if several are open, oldest-first is the rule.)
    const open = (await store.list()).filter((c) => c.status === STATUS.OPEN && !isExpired(c));
    const campaign = open[open.length - 1];
    if (!campaign) {
      log('no open campaign; refunding stray pledge');
      await refundOnce(sphere, { recipient: pledger, amountBase, coinId, memo: 'Frani Pledge: no open campaign' });
      return;
    }

    addPledge(campaign, { pledger, amountBase });
    await store.save(campaign);
    await sphere.communications
      .sendDM(pledger, `${campaign.id}: pledge of ${fromBaseUnits(amountBase)} UCT recorded. Progress: ${progressText(campaign, fromBaseUnits)}.`)
      .catch(() => {});

    if (conditionMet(campaign)) {
      await finaliseSuccess(sphere, store, campaign, identity);
    }
  });

  // Expiry sweep: fail + refund campaigns that pass their deadline unmet.
  const sweep = setInterval(async () => {
    try {
      const open = (await store.list()).filter((c) => c.status === STATUS.OPEN);
      for (const campaign of open) {
        if (conditionMet(campaign)) {
          await finaliseSuccess(sphere, store, campaign, identity);
        } else if (isExpired(campaign)) {
          await finaliseFailure(sphere, store, campaign, coinId, 'expired');
        }
      }
    } catch (err) {
      log('sweep error:', err.message);
    }
  }, Math.max(5, config.sweepSeconds) * 1000);

  const shutdown = async () => {
    log('shutting down...');
    clearInterval(sweep);
    await closeWallet(sphere);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log('listening for pledges and DMs. Ctrl-C to stop.');
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  switch (cmd) {
    case 'daemon':
      return cmdDaemon();
    case 'new':
      return cmdNew(args);
    case 'list':
      return cmdList();
    case 'show':
      return cmdShow(args);
    case 'about':
      return cmdAbout();
    case 'help':
    case undefined:
    case '--help':
    case '-h':
      return cmdHelp();
    default:
      console.error(`Unknown command "${cmd}". Try "pledge help".`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('fatal:', err.message);
  process.exit(1);
});
