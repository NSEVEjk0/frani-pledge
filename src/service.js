// Frani Pledge — DM command handler.
// A backer DMs `pledge <PLG-id> [amount]` to receive a payment request toward a
// campaign; `status` shows progress. Pure and testable; wallet-backed
// capability is injected via `deps`.

import { fromBaseUnits } from './amounts.js';
import { progressText, totalPledgedBase, distinctPledgerCount, STATUS } from './pledge.js';

const HELP = [
  'Frani Pledge — conditional pledges on Unicity testnet2.',
  '',
  'Commands (DM me):',
  '  pledge <PLG-id> [amount]  → get a payment request to pledge toward a campaign',
  '  status <PLG-id>           → campaign progress and condition',
  '  about                     → what this is',
  '  help                      → this message',
  '',
  'If a campaign fails or expires, every pledge is refunded. If it succeeds,',
  'each pledger receives a signed completion receipt.',
].join('\n');

function aboutText(identity) {
  const lines = [
    'Frani Pledge',
    'Pledge UCT toward a stated condition — "N pledgers join" or "reach a',
    'target". Funds are collected up front. If the condition fails or expires,',
    'pledges are refunded; if it succeeds, pledgers get a signed receipt.',
    '',
    `Wallet pubkey: ${identity?.chainPubkey || '(unknown)'}`,
  ];
  if (identity?.directAddress) lines.push(`Direct address: ${identity.directAddress}`);
  if (identity?.nametag) lines.push(`Nametag: @${identity.nametag}`);
  lines.push('', 'Made by CRYPTFRANI · Owner/creator: Itachi · testnet2 only.');
  return lines.join('\n');
}

function parse(body) {
  const trimmed = String(body || '').trim();
  if (!trimmed) return { command: 'help', argument: '' };
  const parts = trimmed.split(/\s+/);
  return { command: parts[0].toLowerCase(), args: parts.slice(1) };
}

function statusText(campaign) {
  const lines = [
    `${campaign.id} — ${campaign.title}`,
    `  status: ${campaign.status}`,
    `  progress: ${progressText(campaign, fromBaseUnits)}`,
    `  pledgers: ${distinctPledgerCount(campaign)} · total ${fromBaseUnits(totalPledgedBase(campaign))} UCT`,
  ];
  if (campaign.expiresAt) {
    lines.push(`  expires: ${new Date(campaign.expiresAt).toISOString()}`);
  }
  return lines.join('\n');
}

// deps:
//   identity
//   getCampaign(id)                         -> campaign | null
//   requestPledge(campaign, sender, amountBase) -> { success, requestId?, error? }
export async function handleMessage(body, sender, deps) {
  const { command, args } = parse(body);

  switch (command) {
    case 'help':
    case '?':
      return { reply: HELP };

    case 'about':
      return { reply: aboutText(deps.identity) };

    case 'status': {
      const id = (args[0] || '').toUpperCase();
      if (!id) return { reply: 'Usage: status <PLG-id>' };
      const campaign = await deps.getCampaign(id);
      if (!campaign) return { reply: `No campaign ${id} here.` };
      return { reply: statusText(campaign) };
    }

    case 'pledge': {
      const id = (args[0] || '').toUpperCase();
      if (!id) return { reply: 'Usage: pledge <PLG-id> [amount]' };
      const campaign = await deps.getCampaign(id);
      if (!campaign) return { reply: `No campaign ${id} here.` };
      if (campaign.status !== STATUS.OPEN) {
        return { reply: `${campaign.id} is ${campaign.status} and no longer accepting pledges.` };
      }
      // amount: explicit arg, else the campaign minimum.
      const amountArg = args[1];
      const res = await deps.requestPledge(campaign, sender, amountArg);
      if (!res || !res.success) {
        return { reply: `Could not create the pledge request${res?.error ? ': ' + res.error : ''}.` };
      }
      return {
        reply: [
          `${campaign.id} — ${campaign.title}`,
          `Pledge request for ${fromBaseUnits(res.amountBase)} UCT sent.`,
          'Pay it to pledge. If the campaign fails or expires you are refunded;',
          'if it succeeds you get a signed completion receipt.',
          `Request id: ${res.requestId}`,
        ].join('\n'),
      };
    }

    default:
      return { reply: `Unknown command "${command}". Send "help".` };
  }
}

export { HELP, aboutText, parse, statusText };
