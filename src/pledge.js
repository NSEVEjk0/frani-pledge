// Frani Pledge — campaign model and condition evaluation.
//
// A campaign states a condition and collects pledges toward it up front. The
// service holds only its own wallet; each pledge is a real incoming payment.
//
//   condition types:
//     'count'  — succeeds when N distinct pledgers have paid
//     'amount' — succeeds when total pledged reaches a target (base units)
//
//   lifecycle:
//     open      accepting pledges
//     succeeded condition met — pledges are kept (earned), receipts issued
//     failed    expired (or closed) before the condition met — all refunded
//
// Earn-only: the only outbound payment is a refund on failure/expiry.

import { randomUUID } from 'node:crypto';

export const STATUS = Object.freeze({
  OPEN: 'open',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
});

export function shortId() {
  return 'PLG-' + randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
}

// opts: { title, condition: {type:'count'|'amount', target}, minPledgeBase,
//         coinId, network, expiresAt }
export function createCampaign(opts) {
  const now = Date.now();
  const { type, target } = opts.condition;
  if (type !== 'count' && type !== 'amount') {
    throw new Error(`unknown condition type: ${type}`);
  }
  if (!(Number(target) > 0)) throw new Error('condition target must be positive');

  return {
    id: shortId(),
    network: opts.network,
    title: opts.title || 'Pledge',
    coinId: opts.coinId,
    condition: { type, target: String(target) },
    minPledgeBase: opts.minPledgeBase || '1',
    status: STATUS.OPEN,
    createdAt: now,
    updatedAt: now,
    expiresAt: opts.expiresAt || null,
    resolvedAt: null,
    pledges: [], // { pledger, amountBase, at, refunded? {amountBase,transferId} }
    receiptsIssued: false,
    history: [{ at: now, event: 'created', condition: { type, target: String(target) } }],
  };
}

export function addPledge(campaign, { pledger, amountBase }) {
  const at = Date.now();
  campaign.pledges.push({ pledger, amountBase, at, refunded: null });
  campaign.history.push({ at, event: 'pledged', pledger, amountBase });
  return campaign;
}

export function totalPledgedBase(campaign) {
  return campaign.pledges.reduce((acc, p) => acc + BigInt(p.amountBase), 0n).toString();
}

export function distinctPledgerCount(campaign) {
  return new Set(campaign.pledges.map((p) => p.pledger)).size;
}

// Evaluate whether the condition is currently met.
export function conditionMet(campaign) {
  if (campaign.condition.type === 'count') {
    return distinctPledgerCount(campaign) >= Number(campaign.condition.target);
  }
  // amount
  return BigInt(totalPledgedBase(campaign)) >= BigInt(campaign.condition.target);
}

export function isExpired(campaign, now = Date.now()) {
  return campaign.expiresAt != null && now >= campaign.expiresAt;
}

export function markSucceeded(campaign) {
  campaign.status = STATUS.SUCCEEDED;
  campaign.resolvedAt = Date.now();
  campaign.history.push({ at: campaign.resolvedAt, event: 'succeeded' });
  return campaign;
}

export function markFailed(campaign, reason) {
  campaign.status = STATUS.FAILED;
  campaign.resolvedAt = Date.now();
  campaign.history.push({ at: campaign.resolvedAt, event: 'failed', reason });
  return campaign;
}

export function progressText(campaign, fromBaseUnits) {
  if (campaign.condition.type === 'count') {
    return `${distinctPledgerCount(campaign)}/${campaign.condition.target} pledgers`;
  }
  return `${fromBaseUnits(totalPledgedBase(campaign))}/${fromBaseUnits(campaign.condition.target)} UCT`;
}
