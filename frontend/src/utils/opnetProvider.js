// ═══════════════════════════════════════════════════════════
// OPNet Provider — JSONRpcProvider singleton
// ═══════════════════════════════════════════════════════════
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

// Proxy path rewritten by Vite (dev) and Vercel (prod) to avoid CORS.
// See vite.config.js proxy and vercel.json rewrites.
const RPC_URL = '/opnet-rpc';

let _provider = null;

// @btc-vision/bitcoin v6.5.6: only 'regtest' and 'testnet' exported.
// networks.testnet has bech32Opnet:'opt' — matches opt1... addresses.
export function getProvider() {
  if (!_provider) {
    try {
      _provider = new JSONRpcProvider(RPC_URL, networks.testnet);
    } catch (e) {
      console.warn('[OPMarket] Failed to create provider:', e);
      _provider = null;
    }
  }
  return _provider;
}

export function getNetworkConfig() {
  return networks.testnet;
}

export async function getBlockNumber() {
  const p = getProvider();
  if (!p) return null;
  try {
    return await p.getBlockNumber();
  } catch {
    return null;
  }
}

export async function getBalance(address) {
  const p = getProvider();
  if (!p) return null;
  try {
    return await p.getBalance(address);
  } catch {
    return null;
  }
}

export default { getProvider, getNetworkConfig, getBlockNumber, getBalance };
