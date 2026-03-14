// ═══════════════════════════════════════════════════════════
// OPMarket — On-Chain Contract Service
// ═══════════════════════════════════════════════════════════
// Architecture:
//   NFTLaunchpad — self-contained registry: registerCollection, mint, withdraw
//   NFTMarketplace — secondary market: list, buy, cancel
//   No external NFT contract required.

import { getContract } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { CONTRACTS, LISTING_STATUS, TOKEN_DECIMALS } from './constants';
import { getProvider, getNetworkConfig } from './opnetProvider';
import { u256ToOpNetAddress } from './formatters';

import {
  NFTLaunchpadAbi,
  NFTMarketplaceAbi,
  OP20Abi,
  TestWBTCAbi,
} from './abis.js';

const MARKET_ABI    = NFTMarketplaceAbi;
const LAUNCHPAD_ABI = NFTLaunchpadAbi;
const OP20_ABI      = OP20Abi;
const WBTC_ABI      = TestWBTCAbi;

// ── Read-only contract factory ────────────────────────────
function readContract(address, abi) {
  const p = getProvider();
  if (!p || !address) return null;
  try {
    return getContract(address, abi, p, getNetworkConfig());
  } catch (e) {
    console.warn('[contractService] readContract failed:', address, e);
    return null;
  }
}

// ── Address resolution cache ──────────────────────────────
const _addrCache = new Map();

// Resolve any OPNet address to an Address object.
// Supports:
//   0x<64 hex> — contract hash (preferred for contracts)
//   0x<66 hex starting 02/03> — compressed public key
//   opt1s... — bech32 address (resolved via RPC)
async function toAddress(addrOrHex) {
  if (!addrOrHex) throw new Error('Empty address provided.');
  if (_addrCache.has(addrOrHex)) return _addrCache.get(addrOrHex);

  const p = getProvider();

  // Compressed public key (33 bytes 02/03 prefix, no 0x)
  if (addrOrHex.length === 66 && (addrOrHex.startsWith('02') || addrOrHex.startsWith('03'))) {
    const resolved = Address.fromString(addrOrHex);
    _addrCache.set(addrOrHex, resolved);
    return resolved;
  }

  // Bech32 opt1s... or 0x hash — resolve via RPC so we get the correct P2OP Address object
  try {
    const info = await p.getPublicKeyInfo(addrOrHex, true);
    if (info) { _addrCache.set(addrOrHex, info); return info; }
  } catch (e) {
    console.warn('[contractService] getPublicKeyInfo failed for', addrOrHex, e);
  }

  // Last resort: direct parse (works for reading but may produce wrong type for write params)
  if (addrOrHex.startsWith('0x')) {
    const resolved = Address.fromString(addrOrHex);
    _addrCache.set(addrOrHex, resolved);
    return resolved;
  }

  throw new Error(
    `Address "${addrOrHex}" not found on-chain. ` +
    `Use the opt1s... bech32 address from the OPNet explorer.`
  );
}

// Resolve the caller's wallet public key for write transactions.
async function resolveWallet(senderBech32) {
  const p = getProvider();
  try {
    const info = await p.getPublicKeyInfo(senderBech32, false);
    if (info) return info;
  } catch { /* fresh wallet — fall through */ }

  if (typeof window !== 'undefined' && window.opnet?.web3?.getMLDSAPublicKey) {
    try {
      const [mldsaHex, legacyHex] = await Promise.all([
        window.opnet.web3.getMLDSAPublicKey(),
        window.opnet.getPublicKey?.() ?? Promise.resolve(null),
      ]);
      if (mldsaHex) return Address.fromString(mldsaHex, legacyHex || undefined);
    } catch (e) {
      console.warn('[contractService] OPWallet key fetch failed:', e);
    }
  }
  return null;
}

async function writeContract(address, abi, senderBech32) {
  const p = getProvider();
  if (!p || !address) return { contract: null, error: 'Contract address missing — check .env' };
  const sender = await resolveWallet(senderBech32);
  if (!sender) return {
    contract: null,
    error: 'Could not resolve wallet public key. Make sure OPWallet is unlocked and has sent at least one transaction.',
  };
  try {
    return { contract: getContract(address, abi, p, getNetworkConfig(), sender), error: null };
  } catch (e) {
    return { contract: null, error: e.message || 'Failed to load contract' };
  }
}

// ── Generic write helper ──────────────────────────────────
async function executeOnChain(contractAddress, abi, method, args, senderAddress) {
  if (typeof window === 'undefined' || !window.opnet?.web3) {
    throw new Error('OPWallet not detected. Install OPWallet to submit transactions.');
  }
  const { contract: c, error } = await writeContract(contractAddress, abi, senderAddress);
  if (!c) throw new Error(error);

  let sim;
  try {
    sim = await c[method](...args);
  } catch (e) {
    throw new Error(`Simulation failed (${method}): ${e.message}`);
  }
  if (sim.revert) throw new Error(`Transaction would revert: ${sim.revert}`);

  const receipt = await sim.sendTransaction({
    signer: null,
    mldsaSigner: null,
    refundTo: senderAddress,
    maximumAllowedSatToSpend: 0n,
    network: getNetworkConfig(),
  });
  return receipt?.transactionId ?? '(check wallet)';
}

// Convert a u256 property to a 0x-prefixed 32-byte hex string.
// Used for addresses stored on-chain so they match CONTRACTS.* keys in constants.
function u256ToHex(val) {
  if (val === undefined || val === null) return null;
  const n = BigInt(val.toString());
  if (n === 0n) return null;
  return '0x' + n.toString(16).padStart(64, '0');
}

// ── Normalise listing from contract response ───────────────
function normaliseListing(id, props) {
  return {
    id,
    seller:           u256ToOpNetAddress(props.seller),
    sellerHash:       props.seller?.toString() || '0',
    collectionId:     BigInt(props.collectionId ?? 0),
    tokenId:          BigInt(props.tokenId     ?? 0),
    price:            BigInt(props.price       ?? 0),
    paymentToken:     u256ToHex(props.paymentToken),
    royaltyRecipient: u256ToOpNetAddress(props.royaltyRecipient),
    royaltyBps:       Number(props.royaltyBps  ?? 0),
    status:           BigInt(props.status      ?? 0),
    isActive:         BigInt(props.status      ?? 0) === LISTING_STATUS.ACTIVE,
  };
}

// ── Normalise collection from contract response ────────────
function normaliseCollection(id, props, strings) {
  return {
    id,
    creator:      u256ToOpNetAddress(props.creator),
    creatorHash:  props.creator?.toString() || '0',
    mintPrice:    BigInt(props.mintPrice    ?? 0),
    paymentToken: u256ToHex(props.paymentToken),
    maxSupply:    BigInt(props.maxSupply    ?? 0),
    minted:       BigInt(props.minted       ?? 0),
    startBlock:   BigInt(props.startBlock   ?? 0),
    endBlock:     BigInt(props.endBlock     ?? 0),
    royaltyBps:   Number(props.royaltyBps   ?? 0),
    maxPerWallet: BigInt(props.maxPerWallet ?? 0),
    proceeds:     BigInt(props.proceeds     ?? 0),
    isRegistered: BigInt(props.creator      ?? 0) !== 0n,
    // From getCollectionStrings
    name:         strings?.name     ?? '',
    symbol:       strings?.symbol   ?? '',
    imageURI:     strings?.imageURI ?? '',
  };
}

// ═══════════════════════════════════════════════════════════
// READ: Marketplace
// ═══════════════════════════════════════════════════════════

export async function getListingCount() {
  const c = readContract(CONTRACTS.MARKETPLACE, MARKET_ABI);
  if (!c) return 0;
  try {
    const r = await c.getListingCount();
    return Number(r?.properties?.count ?? 0);
  } catch { return 0; }
}

export async function getListing(id) {
  const c = readContract(CONTRACTS.MARKETPLACE, MARKET_ABI);
  if (!c) return null;
  try {
    const r = await c.getListing(BigInt(id));
    if (!r?.properties) return null;
    return normaliseListing(id, r.properties);
  } catch (e) {
    console.warn(`[contractService] getListing(${id}) failed:`, e);
    return null;
  }
}

export async function getAllActiveListings() {
  const count = await getListingCount();
  if (!count) return [];
  const listings = [];
  for (let i = 0; i < count; i++) {
    const l = await getListing(i);
    if (l?.isActive) listings.push(l);
  }
  return listings;
}

// ═══════════════════════════════════════════════════════════
// READ: Launchpad
// ═══════════════════════════════════════════════════════════

export async function getCollectionCount() {
  const c = readContract(CONTRACTS.LAUNCHPAD, LAUNCHPAD_ABI);
  if (!c) return 0;
  try {
    const r = await c.getCollectionCount();
    return Number(r?.properties?.count ?? 0);
  } catch { return 0; }
}

export async function getCollection(collectionId) {
  const c = readContract(CONTRACTS.LAUNCHPAD, LAUNCHPAD_ABI);
  if (!c) return null;
  try {
    const [numR, strR] = await Promise.all([
      c.getCollection(BigInt(collectionId)),
      c.getCollectionStrings(BigInt(collectionId)),
    ]);
    if (!numR?.properties) return null;
    return normaliseCollection(collectionId, numR.properties, strR?.properties);
  } catch (e) {
    console.warn('[contractService] getCollection failed:', e);
    return null;
  }
}

export async function getAllCollections() {
  const count = await getCollectionCount();
  if (!count) return [];
  const ids = Array.from({ length: count }, (_, i) => i);
  const results = await Promise.all(ids.map(id => getCollection(id)));
  return results.filter(Boolean);
}

export async function getLaunchpadBalance(collectionId, ownerAddr) {
  const c = readContract(CONTRACTS.LAUNCHPAD, LAUNCHPAD_ABI);
  if (!c || !ownerAddr) return 0n;
  try {
    const ownerResolved = await toAddress(ownerAddr);
    const r = await c.balanceOf(BigInt(collectionId), ownerResolved);
    return BigInt(r?.properties?.balance ?? 0);
  } catch { return 0n; }
}

export async function ownerOf(collectionId, tokenId) {
  const c = readContract(CONTRACTS.LAUNCHPAD, LAUNCHPAD_ABI);
  if (!c) return null;
  try {
    const r = await c.ownerOf(BigInt(collectionId), BigInt(tokenId));
    return r?.properties?.owner ?? null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════
// READ: OP20 (payment tokens)
// ═══════════════════════════════════════════════════════════

export async function getTokenBalance(tokenAddr, ownerAddr) {
  const c = readContract(tokenAddr, OP20_ABI);
  if (!c || !ownerAddr) return null;
  try {
    const r = await c.balanceOf(ownerAddr);
    return BigInt(r?.properties?.balance ?? 0);
  } catch { return null; }
}

export async function getTokenSymbol(tokenAddr) {
  const c = readContract(tokenAddr, OP20_ABI);
  if (!c) return '???';
  try {
    const r = await c.symbol();
    return r?.properties?.symbol || '???';
  } catch { return '???'; }
}

export async function getTokenAllowance(tokenAddr, ownerAddr, spenderAddr) {
  const c = readContract(tokenAddr, OP20_ABI);
  if (!c) return 0n;
  try {
    const r = await c.allowance(ownerAddr, spenderAddr);
    return BigInt(r?.properties?.remaining ?? 0);
  } catch { return 0n; }
}

// ═══════════════════════════════════════════════════════════
// WRITE: Launchpad
// ═══════════════════════════════════════════════════════════

export async function registerCollection(senderAddr, {
  name, symbol, imageURI, maxSupply, mintPrice, paymentToken,
  startBlock, endBlock, royaltyBps, maxPerWallet,
}) {
  const { contract: c, error } = await writeContract(CONTRACTS.LAUNCHPAD, LAUNCHPAD_ABI, senderAddr);
  if (!c) throw new Error(error);

  let sim;
  try {
    sim = await c.registerCollection(
      name,
      symbol,
      imageURI || '',
      BigInt(maxSupply),
      BigInt(mintPrice),
      await toAddress(paymentToken),
      BigInt(startBlock),
      BigInt(endBlock),
      BigInt(royaltyBps || 0),
      BigInt(maxPerWallet || 0),
    );
  } catch (e) {
    throw new Error(`Simulation failed (registerCollection): ${e.message}`);
  }
  if (sim.revert) throw new Error(`Transaction would revert: ${sim.revert}`);

  const collectionId = sim?.properties?.collectionId ?? null;

  const receipt = await sim.sendTransaction({
    signer: null,
    mldsaSigner: null,
    refundTo: senderAddr,
    maximumAllowedSatToSpend: 0n,
    network: getNetworkConfig(),
  });

  return {
    txId: receipt?.transactionId ?? '(check wallet)',
    collectionId,
  };
}

export async function mintFromLaunchpad(senderAddr, collectionId, quantity) {
  return executeOnChain(
    CONTRACTS.LAUNCHPAD,
    LAUNCHPAD_ABI,
    'mint',
    [BigInt(collectionId), BigInt(quantity)],
    senderAddr,
  );
}

export async function withdrawProceeds(senderAddr, collectionId) {
  return executeOnChain(
    CONTRACTS.LAUNCHPAD,
    LAUNCHPAD_ABI,
    'withdraw',
    [BigInt(collectionId)],
    senderAddr,
  );
}

export async function approveTokenForLaunchpad(tokenAddr, amount, senderAddr) {
  return executeOnChain(
    tokenAddr,
    OP20_ABI,
    'increaseAllowance',
    [await toAddress(CONTRACTS.LAUNCHPAD), BigInt(amount)],
    senderAddr,
  );
}

// ═══════════════════════════════════════════════════════════
// WRITE: Marketplace
// ═══════════════════════════════════════════════════════════

export async function listNFT(senderAddr, collectionId, tokenId, price, paymentToken, royaltyRecipient, royaltyBps) {
  return executeOnChain(
    CONTRACTS.MARKETPLACE,
    MARKET_ABI,
    'list',
    [
      BigInt(collectionId),
      BigInt(tokenId),
      BigInt(price),
      await toAddress(paymentToken),
      await toAddress(royaltyRecipient || CONTRACTS.LAUNCHPAD),
      BigInt(royaltyBps || 0),
    ],
    senderAddr,
  );
}

export async function buyNFT(senderAddr, listingId) {
  return executeOnChain(
    CONTRACTS.MARKETPLACE,
    MARKET_ABI,
    'buy',
    [BigInt(listingId)],
    senderAddr,
  );
}

export async function cancelListing(senderAddr, listingId) {
  return executeOnChain(
    CONTRACTS.MARKETPLACE,
    MARKET_ABI,
    'cancel',
    [BigInt(listingId)],
    senderAddr,
  );
}

export async function approveTokenForMarketplace(tokenAddr, amount, senderAddr) {
  return executeOnChain(
    tokenAddr,
    OP20_ABI,
    'increaseAllowance',
    [await toAddress(CONTRACTS.MARKETPLACE), BigInt(amount)],
    senderAddr,
  );
}

// ═══════════════════════════════════════════════════════════
// WRITE: Faucet (test WBTC)
// ═══════════════════════════════════════════════════════════

export async function mintFromFaucet(senderAddr) {
  return executeOnChain(
    CONTRACTS.WBTC_TOKEN,
    WBTC_ABI,
    'faucet',
    [],
    senderAddr,
  );
}

// ═══════════════════════════════════════════════════════════
// Metadata fetcher (IPFS / Arweave)
// ═══════════════════════════════════════════════════════════
const metaCache = new Map();

export async function fetchNFTMetadata(tokenUri) {
  if (!tokenUri) return null;
  if (metaCache.has(tokenUri)) return metaCache.get(tokenUri);
  try {
    const url = tokenUri
      .replace('ipfs://', 'https://ipfs.io/ipfs/')
      .replace('ar://', 'https://arweave.net/');
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const meta = await resp.json();
    metaCache.set(tokenUri, meta);
    return meta;
  } catch { return null; }
}
