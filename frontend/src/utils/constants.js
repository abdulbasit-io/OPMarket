// ═══════════════════════════════════════════════════════════
// OPMarket — Constants & Configuration
// ═══════════════════════════════════════════════════════════

export const NETWORK   = 'testnet';
export const RPC_URL   = 'https://testnet.opnet.org';

// Contract addresses (set in .env — not committed)
export const CONTRACTS = {
  MARKETPLACE: import.meta.env.VITE_MARKETPLACE_CONTRACT || '',
  LAUNCHPAD:   import.meta.env.VITE_LAUNCHPAD_CONTRACT   || '',
  WBTC_TOKEN:  import.meta.env.VITE_WBTC_TOKEN_CONTRACT  || '',
};

// Known payment tokens (address → display info)
export const PAYMENT_TOKENS = {
  ...(CONTRACTS.WBTC_TOKEN ? { [CONTRACTS.WBTC_TOKEN]: { symbol: 'tWBTC', decimals: 8 } } : {}),
};

// Default payment token
export const DEFAULT_PAYMENT_TOKEN  = CONTRACTS.WBTC_TOKEN || '';
export const DEFAULT_PAYMENT_SYMBOL = 'tWBTC';
export const TOKEN_DECIMALS = 8;

// Listing statuses (matches NFTMarketplace contract)
export const LISTING_STATUS = {
  ACTIVE:    0n,
  SOLD:      1n,
  CANCELLED: 2n,
};

// Platform fee display
export const PLATFORM_FEE_BPS = 250; // 2.5% — matches contract default

// Links
export const LINKS = {
  OPNET:    'https://opnet.org',
  OPWALLET: 'https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb',
  FAUCET:   'https://faucet.opnet.org',
  TWITTER:  'https://x.com/opnetbtc',
  DISCORD:  'https://discord.com/invite/opnet',
  TELEGRAM: 'https://t.me/opnetbtc',
  GITHUB:   'https://github.com',
};

// OPNet testnet explorer base URL
export const EXPLORER_URL = 'https://explorer.opnet.org';
