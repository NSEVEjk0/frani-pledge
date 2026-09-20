// Frani Pledge — configuration.
// Made by CRYPTFRANI. Owner / creator: Itachi. Unicity testnet2 only.

import process from 'node:process';

export const NETWORK = process.env.PLEDGE_NETWORK || 'testnet2';

export const config = {
  network: NETWORK,
  dataDir: process.env.PLEDGE_DATA_DIR || './wallet-data',
  walletApiBaseUrl:
    process.env.PLEDGE_WALLET_API || 'https://wallet-api.unicity.network',
  oracleApiKey:
    process.env.PLEDGE_ORACLE_KEY || 'sk_ddc3cfcc001e4a28ac3fad7407f99590',
  deviceId: process.env.PLEDGE_DEVICE_ID || 'frani-pledge-1',
  nametag: process.env.PLEDGE_NAMETAG || '',
  campaignsDir: process.env.PLEDGE_DIR || './campaigns',
  decimals: Number(process.env.PLEDGE_DECIMALS || '8'),
  // How often to check for expired campaigns, in seconds.
  sweepSeconds: Number(process.env.PLEDGE_SWEEP_SECONDS || '30'),
};

export function assertTestnet2() {
  if (config.network !== 'testnet2' && !process.env.PLEDGE_ALLOW_NONTESTNET2) {
    throw new Error(
      `Frani Pledge is testnet2-only. Refusing to start on '${config.network}'. ` +
        `Set PLEDGE_ALLOW_NONTESTNET2=1 only if you truly mean it.`,
    );
  }
}
