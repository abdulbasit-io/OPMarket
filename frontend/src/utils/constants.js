// ═══════════════════════════════════════════════════════════
// OPMarket — Constants & Configuration
// ═══════════════════════════════════════════════════════════

export const NETWORK   = 'testnet';
export const RPC_URL   = 'https://testnet.opnet.org';

// Contract addresses (set in .env — not committed)
export const CONTRACTS = {
  MARKETPLACE: import.meta.env.VITE_MARKETPLACE_CONTRACT || '',
  LAUNCHPAD:   import.meta.env.VITE_LAUNCHPAD_CONTRACT   || '',
  BASE_NFT:    import.meta.env.VITE_BASE_NFT_CONTRACT    || '',
  HODL_TOKEN:  import.meta.env.VITE_HODL_TOKEN_CONTRACT  || 'opt1sqrpxenjta0hgpdzr32jc6gucr3llwv6scvn0p5ha',
};

// Known NFT collections to enumerate on My NFTs page.
// Populated from env + any collection that appears in active listings.
export const KNOWN_COLLECTIONS = [
  ...(import.meta.env.VITE_BASE_NFT_CONTRACT ? [import.meta.env.VITE_BASE_NFT_CONTRACT] : []),
].filter(Boolean);

// Known payment tokens (address → display info)
export const PAYMENT_TOKENS = {
  [CONTRACTS.HODL_TOKEN]: { symbol: 'HODL', decimals: 8 },
};

// Default payment token for new listings
export const DEFAULT_PAYMENT_TOKEN = CONTRACTS.HODL_TOKEN;
export const DEFAULT_PAYMENT_SYMBOL = 'HODL';
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
