// ═══════════════════════════════════════════════════════════
// OPMarket — Formatters & Address Utilities
// ═══════════════════════════════════════════════════════════
import { bech32 } from 'bech32';

// ── Address display ───────────────────────────────────────

export function truncateAddress(addr, head = 8, tail = 6) {
  if (!addr || addr.length < head + tail + 3) return addr || '—';
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

// Reconstruct an OPNet opt1... address from the u256 BigInt
// stored in the NFTMarketplace contract.
//
// The contract stores Address bytes via u256.fromUint8ArrayBE(address)
// where Address is the 32-byte witness program of the opt1... address.
// To reverse: BigInt → 32-byte big-endian array → bech32-encode with 'opt' HRP.
//
// OPNet opt1s... addresses are witness-v0 + 32-byte data (P2WSH-style).
export function u256ToOpNetAddress(u256BigInt) {
  try {
    if (u256BigInt === undefined || u256BigInt === null) return null;
    const n = BigInt(u256BigInt.toString());
    if (n === 0n) return null;

    // Extract 32 bytes (big-endian)
    const bytes = new Uint8Array(32);
    let rem = n;
    for (let i = 31; i >= 0; i--) {
      bytes[i] = Number(rem & 0xFFn);
      rem >>= 8n;
    }

    // Encode as bech32 with witness version 0 prefix + 'opt' HRP
    const words = bech32.toWords(bytes);
    return bech32.encode('opt', [0, ...words]);
  } catch (e) {
    console.warn('[formatters] u256ToOpNetAddress failed:', e);
    return null;
  }
}

// Convert a bech32 opt1... address to its 32-byte Uint8Array
export function opNetAddressToBytes(optAddr) {
  try {
    const { words } = bech32.decode(optAddr);
    // First word is witness version (0), rest are the program
    return new Uint8Array(bech32.fromWords(words.slice(1)));
  } catch {
    return null;
  }
}

// ── Token amounts ─────────────────────────────────────────

export function toHuman(bigintOrNum, decimals = 8) {
  if (bigintOrNum === null || bigintOrNum === undefined) return '0';
  const n = typeof bigintOrNum === 'bigint' ? bigintOrNum : BigInt(bigintOrNum.toString());
  const divisor = BigInt(10 ** decimals);
  const whole = n / divisor;
  const frac  = n % divisor;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toLocaleString()}.${fracStr}`;
}

export function toRaw(humanStr, decimals = 8) {
  if (!humanStr || humanStr === '') return 0n;
  const [whole, frac = ''] = String(humanStr).split('.');
  const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole || '0') * BigInt(10 ** decimals) + BigInt(fracPadded || '0');
}

export function formatPrice(bigintOrNum, symbol = 'tWBTC', decimals = 8) {
  return `${toHuman(bigintOrNum, decimals)} ${symbol}`;
}

// ── Numbers ───────────────────────────────────────────────

export function formatNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Blocks ────────────────────────────────────────────────

export function formatBlock(blockNum) {
  if (!blockNum) return '—';
  return `#${Number(blockNum).toLocaleString()}`;
}

// ── NFT image gradient fallback ───────────────────────────
// Generates a deterministic gradient for NFTs without metadata images.
export function nftGradient(contractAddr, tokenId) {
  const seed = (parseInt((contractAddr || '').slice(-6), 16) || 0) + Number(tokenId || 0);
  const h1 = seed % 360;
  const h2 = (seed * 137 + 180) % 360;
  const h3 = (seed * 59 + 90)  % 360;
  return `linear-gradient(135deg, hsl(${h1},65%,25%) 0%, hsl(${h2},75%,18%) 50%, hsl(${h3},80%,12%) 100%)`;
}

// ── Time ──────────────────────────────────────────────────

export function timeAgo(isoString) {
  if (!isoString) return '';
  const ms = Date.now() - new Date(isoString).getTime();
  const s  = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}
