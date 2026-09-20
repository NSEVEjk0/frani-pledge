// Frani Pledge — signed completion receipts.
// When a campaign succeeds, each pledger receives a signed receipt proving
// their pledge counted toward a fulfilled condition. Verifiable offline.

import { createHash } from 'node:crypto';
import { verifySignedMessage, recoverPubkeyFromSignature } from '@unicitylabs/sphere-sdk';

export const RECEIPT_VERSION = 'frani-pledge/1';

export function completionPayload({ version, network, campaignId, pledger, amountBase, condition, resolvedAt, nonce }) {
  return [
    version,
    network,
    campaignId,
    pledger,
    amountBase,
    `${condition.type}:${condition.target}`,
    String(resolvedAt),
    nonce,
  ].join('\n');
}

export function createCompletionReceipt({ campaign, pledge, sign, signerPubkey, signerNametag }) {
  const resolvedAt = campaign.resolvedAt || Date.now();
  const nonce = createHash('sha256')
    .update(campaign.id + pledge.pledger + pledge.amountBase + resolvedAt + Math.random())
    .digest('hex')
    .slice(0, 16);
  const payload = completionPayload({
    version: RECEIPT_VERSION,
    network: campaign.network,
    campaignId: campaign.id,
    pledger: pledge.pledger,
    amountBase: pledge.amountBase,
    condition: campaign.condition,
    resolvedAt,
    nonce,
  });
  const signature = sign(payload);
  return {
    version: RECEIPT_VERSION,
    network: campaign.network,
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    pledger: pledge.pledger,
    amountBase: pledge.amountBase,
    condition: campaign.condition,
    resolvedAt,
    resolvedAtIso: new Date(resolvedAt).toISOString(),
    nonce,
    signer: { pubkey: signerPubkey, nametag: signerNametag || undefined },
    signature,
    issuer: 'Frani Pledge · CRYPTFRANI',
  };
}

export function verifyCompletionReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return { ok: false, problems: ['not an object'] };
  const pubkey = receipt?.signer?.pubkey;
  if (!/^[0-9a-f]{66}$/i.test(String(pubkey || ''))) {
    return { ok: false, problems: ['signer pubkey is not 66-hex'] };
  }
  const payload = completionPayload({
    version: receipt.version,
    network: receipt.network,
    campaignId: receipt.campaignId,
    pledger: receipt.pledger,
    amountBase: receipt.amountBase,
    condition: receipt.condition,
    resolvedAt: receipt.resolvedAt,
    nonce: receipt.nonce,
  });
  try {
    const valid = verifySignedMessage(payload, receipt.signature, pubkey);
    const recovered = recoverPubkeyFromSignature(payload, receipt.signature);
    const ok = valid && recovered.toLowerCase() === pubkey.toLowerCase();
    return { ok, signatureValid: valid, recoveredPubkey: recovered };
  } catch (err) {
    return { ok: false, problems: [err.message] };
  }
}
