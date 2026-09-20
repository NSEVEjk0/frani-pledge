// Frani Split — wallet boundary.
// Thin Sphere SDK wrapper. Holds its own keys via file storage; never asks
// anyone for a seed or private key. testnet2 only.

import { Sphere, TokenRegistry, getCoinIdBySymbol } from '@unicitylabs/sphere-sdk';
import { createNodeProviders, createWalletApiProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { config, assertTestnet2 } from './config.js';

export async function openWallet() {
  assertTestnet2();

  const base = createNodeProviders({
    network: config.network,
    dataDir: config.dataDir,
    oracle: { apiKey: config.oracleApiKey },
  });

  const providers = createWalletApiProviders(base, {
    baseUrl: config.walletApiBaseUrl,
    network: config.network,
    deviceId: config.deviceId,
  });

  const initOptions = {
    ...providers,
    network: config.network,
    autoGenerate: true,
  };
  if (config.nametag) initOptions.nametag = config.nametag;

  return Sphere.init(initOptions);
}

export async function closeWallet(sphere) {
  try {
    if (sphere) await sphere.destroy();
  } finally {
    TokenRegistry.destroy();
  }
}

export async function uctCoinId() {
  await TokenRegistry.waitForReady().catch(() => {});
  return getCoinIdBySymbol('UCT');
}
