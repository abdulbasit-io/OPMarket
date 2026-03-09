// ═══════════════════════════════════════════════════════════
// OPMarket — On-Chain Contract Service
// ═══════════════════════════════════════════════════════════
// Flow: getContract → contract.method() → simulation.sendTransaction
// TransactionFactory auto-routes to OPWallet via window.opnet.web3.
// NEVER call window.opnet directly. NEVER construct PSBTs.

import { getContract } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { CONTRACTS, LISTING_STATUS, TOKEN_DECIMALS } from './constants';
import { getProvider, getNetworkConfig } from './opnetProvider';
import { u256ToOpNetAddress } from './formatters';

import marketplaceABI from '../../../contracts/abis/NFTMarketplace.abi.json';
import baseNFTABI     from '../../../contracts/abis/BaseNFT.abi.json';
import op721ABI       from '../../../contracts/abis/OP721.abi.json';
import op20ABI        from '../../../contracts/abis/OP20.abi.json';
import launchpadABI   from '../../../contracts/abis/NFTLaunchpad.abi.json';

// ── ABI normalisation ─────────────────────────────────────
function normalise(abi) {
  const fns = abi.functions || abi;
  return Array.isArray(fns)
    ? fns.map(fn => ({ ...fn, type: (fn.type || 'function').toLowerCase() }))
    : fns;
}

const MARKET_ABI    = normalise(marketplaceABI);
const NFT_ABI       = normalise(op721ABI);
const OP20_ABI      = normalise(op20ABI);
const LAUNCHPAD_ABI = normalise(launchpadABI);
const BASE_NFT_ABI  = normalise(baseNFTABI);

// ── Contract factories ────────────────────────────────────

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

// Cache resolved Address objects to avoid repeated RPC lookups per session.
const _addrCache = new Map();

// Resolve any OPNet address (opt1s...) or hex pubkey (0x02.../0x03...) to an Address object.
//
// Accepted formats:
//   opt1s...         — bech32 contract/wallet address  → looked up via getPublicKeyInfo
//   0x02... / 0x03.. — 33-byte compressed public key   → decoded directly
//
// NOT accepted:
//   0xc82f...        — 32-byte contract hash from the explorer.
//                      Use the opt1s... bech32 address shown on the explorer instead.
async function toAddress(addrOrHex) {
  if (!addrOrHex) throw new Error('Empty address provided.');
  if (_addrCache.has(addrOrHex)) return _addrCache.get(addrOrHex);

  const hex = addrOrHex.startsWith('0x') ? addrOrHex.slice(2) : addrOrHex;

  // 33-byte compressed public key (66 hex chars, starts with 02 or 03)
  if (hex.length === 66 && (hex.startsWith('02') || hex.startsWith('03'))) {
    const resolved = Address.fromString(addrOrHex);
    _addrCache.set(addrOrHex, resolved);
    return resolved;
  }

  // 32-byte hash — this is a contract ID from the explorer, not a public key.
  if (hex.length === 64) {
    throw new Error(
      `"${addrOrHex.slice(0, 12)}..." looks like a contract hash from the explorer. ` +
      `Please use the opt1s... bech32 address instead — it's shown on the same explorer page.`
    );
  }

  // Bech32 address (opt1s... / bc1q... etc.) — look up the on-chain public key via RPC.
  const p = getProvider();
  try {
    const info = await p.getPublicKeyInfo(addrOrHex, false);
    if (info) {
      _addrCache.set(addrOrHex, info);
      return info;
    }
  } catch (e) {
    console.warn('[contractService] getPublicKeyInfo failed for', addrOrHex, e);
  }

  throw new Error(
    `Public key for "${addrOrHex}" not found on-chain. ` +
    `If this is a freshly deployed contract, paste its 33-byte hex public key (0x02... or 0x03...) instead.`
  );
}

async function resolveAddress(senderBech32) {
  const p = getProvider();

  // Attempt 1: RPC lookup (works for wallets with on-chain history)
  try {
    const info = await p.getPublicKeyInfo(senderBech32, false);
    if (info) return info;
  } catch { /* fresh wallet — fall through */ }

  // Attempt 2: Read keys directly from OPWallet
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
  const sender = await resolveAddress(senderBech32);
  if (!sender) return {
    contract: null,
    error: 'Could not resolve your wallet public key. Make sure OPWallet is unlocked and has sent at least one transaction on this network.',
  };
  try {
    return { contract: getContract(address, abi, p, getNetworkConfig(), sender), error: null };
  } catch (e) {
    console.warn('[contractService] writeContract failed:', address, e);
    return { contract: null, error: e.message || 'Failed to load contract' };
  }
}

// ── Generic execute helper ────────────────────────────────
async function executeOnChain(contractAddress, abi, method, args, senderAddress) {
  if (typeof window === 'undefined' || !window.opnet?.web3) {
    throw new Error('OPWallet not detected. Install OPWallet to submit transactions.');
  }
  const { contract: c, error: contractError } = await writeContract(contractAddress, abi, senderAddress);
  if (!c) throw new Error(contractError);

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
  return receipt.transactionId;
}

// ── Listing data model ────────────────────────────────────
function normaliseListing(id, props) {
  const seller           = u256ToOpNetAddress(props.seller);
  const nftContract      = u256ToOpNetAddress(props.nftContract);
  const paymentToken     = u256ToOpNetAddress(props.paymentToken);
  const royaltyRecipient = u256ToOpNetAddress(props.royaltyRecipient);

  return {
    id,
    seller,
    sellerHash:      props.seller?.toString()   || '0',
    nftContract,
    nftContractHash: props.nftContract?.toString() || '0',
    tokenId:         BigInt(props.tokenId  ?? 0),
    price:           BigInt(props.price    ?? 0),
    paymentToken,
    paymentTokenHash: props.paymentToken?.toString() || '0',
    royaltyRecipient,
    royaltyBps:      Number(props.royaltyBps ?? 0),
    status:          BigInt(props.status   ?? 0),
    isActive:        BigInt(props.status   ?? 0) === LISTING_STATUS.ACTIVE,
  };
}

// ── Read: Marketplace ─────────────────────────────────────

export async function getListingCount() {
  const c = readContract(CONTRACTS.MARKETPLACE, MARKET_ABI);
  if (!c) return 0;
  try {
    const r = await c.getListingCount();
    return Number(r?.properties?.count ?? 0);
  } catch (e) {
    console.warn('[contractService] getListingCount failed:', e);
    return 0;
  }
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

// ── Read: OP721 (NFT collections) ─────────────────────────

export async function getNFTBalance(collectionAddr, ownerAddr) {
  const c = readContract(collectionAddr, NFT_ABI);
  if (!c) return 0n;
  try {
    const r = await c.balanceOf(ownerAddr);
    return BigInt(r?.properties?.balance ?? 0);
  } catch {
    return 0n;
  }
}

export async function getTokenOfOwnerByIndex(collectionAddr, ownerAddr, index) {
  const c = readContract(collectionAddr, NFT_ABI);
  if (!c) return null;
  try {
    const r = await c.tokenOfOwnerByIndex(ownerAddr, BigInt(index));
    return BigInt(r?.properties?.tokenId ?? 0);
  } catch {
    return null;
  }
}

export async function getTokenURI(collectionAddr, tokenId) {
  const c = readContract(collectionAddr, NFT_ABI);
  if (!c) return null;
  try {
    const r = await c.tokenURI(BigInt(tokenId));
    return r?.properties?.uri || null;
  } catch {
    return null;
  }
}

export async function isApprovedForAll(collectionAddr, ownerAddr, operatorAddr) {
  const c = readContract(collectionAddr, NFT_ABI);
  if (!c) return false;
  try {
    const r = await c.isApprovedForAll(ownerAddr, operatorAddr);
    return Boolean(r?.properties?.approved);
  } catch {
    return false;
  }
}

// Get all NFTs owned by an address in a given collection
export async function getOwnedNFTs(collectionAddr, ownerAddr) {
  const balance = await getNFTBalance(collectionAddr, ownerAddr);
  if (!balance) return [];
  const tokens = [];
  for (let i = 0; i < Number(balance); i++) {
    const tokenId = await getTokenOfOwnerByIndex(collectionAddr, ownerAddr, i);
    if (tokenId !== null) {
      tokens.push({ collectionAddr, tokenId });
    }
  }
  return tokens;
}

// ── Read: OP20 (payment tokens) ───────────────────────────

export async function getTokenBalance(tokenAddr, ownerAddr) {
  const c = readContract(tokenAddr, OP20_ABI);
  if (!c || !ownerAddr) return null;
  try {
    const r = await c.balanceOf(ownerAddr);
    return BigInt(r?.properties?.balance ?? 0);
  } catch {
    return null;
  }
}

export async function getTokenAllowance(tokenAddr, ownerAddr, spenderAddr) {
  const c = readContract(tokenAddr, OP20_ABI);
  if (!c) return 0n;
  try {
    const r = await c.allowance(ownerAddr, spenderAddr);
    return BigInt(r?.properties?.remaining ?? 0);
  } catch {
    return 0n;
  }
}

export async function getTokenSymbol(tokenAddr) {
  const c = readContract(tokenAddr, OP20_ABI);
  if (!c) return '???';
  try {
    const r = await c.symbol();
    return r?.properties?.symbol || '???';
  } catch {
    return '???';
  }
}

// ── Metadata fetcher ──────────────────────────────────────
// Fetches ERC-721-style JSON metadata from a tokenURI.
// OPWallet requires: { name, description, image }
const metaCache = new Map();

export async function fetchNFTMetadata(tokenUri) {
  if (!tokenUri) return null;
  if (metaCache.has(tokenUri)) return metaCache.get(tokenUri);
  try {
    // Convert IPFS URIs to HTTP gateway
    const url = tokenUri
      .replace('ipfs://', 'https://ipfs.io/ipfs/')
      .replace('ar://', 'https://arweave.net/');
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const meta = await resp.json();
    metaCache.set(tokenUri, meta);
    return meta;
  } catch {
    return null;
  }
}

// ── Write: NFT approval ───────────────────────────────────

export async function approveNFTForMarketplace(collectionAddr, senderAddr) {
  return executeOnChain(
    collectionAddr,
    NFT_ABI,
    'setApprovalForAll',
    [await toAddress(CONTRACTS.MARKETPLACE), true],
    senderAddr,
  );
}

// ── Write: OP20 approval ──────────────────────────────────

export async function approveTokenForMarketplace(tokenAddr, amount, senderAddr) {
  return executeOnChain(
    tokenAddr,
    OP20_ABI,
    'increaseAllowance',
    [await toAddress(CONTRACTS.MARKETPLACE), BigInt(amount)],
    senderAddr,
  );
}

// ── Write: Marketplace ────────────────────────────────────

export async function listNFT(
  senderAddr,
  nftContract,
  tokenId,
  price,
  paymentToken,
  royaltyRecipient,
  royaltyBps,
) {
  return executeOnChain(
    CONTRACTS.MARKETPLACE,
    MARKET_ABI,
    'list',
    [
      await toAddress(nftContract),
      BigInt(tokenId),
      BigInt(price),
      await toAddress(paymentToken),
      await toAddress(royaltyRecipient || CONTRACTS.MARKETPLACE),
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

// ── Write: BaseNFT ────────────────────────────────────────

export async function mintNFT(collectionAddr, senderAddr, toAddr, quantity) {
  return executeOnChain(
    collectionAddr,
    BASE_NFT_ABI,
    'mintTo',
    [toAddr, BigInt(quantity)],
    senderAddr,
  );
}

// ── Read: OP721 metadata ───────────────────────────────────

export async function getNFTName(collectionAddr) {
  const c = readContract(collectionAddr, NFT_ABI);
  if (!c) return null;
  try {
    const r = await c.name();
    return r?.properties?.name || null;
  } catch { return null; }
}

export async function getNFTCollectionInfo(collectionAddr) {
  const c = readContract(collectionAddr, NFT_ABI);
  if (!c) return null;
  try {
    const r = await c.collectionInfo();
    return r?.properties || null;
  } catch { return null; }
}

// ── Read: Launchpad ────────────────────────────────────────

export async function getCollection(nftContractAddr) {
  const c = readContract(CONTRACTS.LAUNCHPAD, LAUNCHPAD_ABI);
  if (!c) return null;
  try {
    const r = await c.getCollection(nftContractAddr);
    if (!r?.properties) return null;
    const p = r.properties;
    return {
      creator:      u256ToOpNetAddress(p.creator),
      paymentToken: u256ToOpNetAddress(p.paymentToken),
      mintPrice:    BigInt(p.mintPrice  ?? 0),
      maxSupply:    BigInt(p.maxSupply  ?? 0),
      minted:       BigInt(p.minted    ?? 0),
      startBlock:   BigInt(p.startBlock ?? 0),
      endBlock:     BigInt(p.endBlock  ?? 0),
      royaltyBps:   Number(p.royaltyBps ?? 0),
      proceeds:     BigInt(p.proceeds  ?? 0),
      maxPerWallet: BigInt(p.maxPerWallet ?? 0),
      isRegistered: BigInt(p.creator ?? 0) !== 0n,
    };
  } catch (e) {
    console.warn('[contractService] getCollection failed:', e);
    return null;
  }
}

export async function getLaunchpadMinted(nftContractAddr) {
  const c = readContract(CONTRACTS.LAUNCHPAD, LAUNCHPAD_ABI);
  if (!c) return 0n;
  try {
    const r = await c.getMinted(nftContractAddr);
    return BigInt(r?.properties?.minted ?? 0);
  } catch { return 0n; }
}

export async function getWalletMintCount(nftContractAddr, walletAddr) {
  const c = readContract(CONTRACTS.LAUNCHPAD, LAUNCHPAD_ABI);
  if (!c) return 0n;
  try {
    const r = await c.getWalletMintCount(nftContractAddr, walletAddr);
    return BigInt(r?.properties?.minted ?? 0);
  } catch { return 0n; }
}

// ── Write: Launchpad ───────────────────────────────────────

export async function registerCollection(
  senderAddr,
  nftContract,
  mintPrice,
  paymentToken,
  maxSupply,
  startBlock,
  endBlock,
  royaltyBps,
  maxPerWallet,
) {
  return executeOnChain(
    CONTRACTS.LAUNCHPAD,
    LAUNCHPAD_ABI,
    'register',
    [
      await toAddress(nftContract),
      BigInt(mintPrice),
      await toAddress(paymentToken),
      BigInt(maxSupply),
      BigInt(startBlock),
      BigInt(endBlock),
      BigInt(royaltyBps),
      BigInt(maxPerWallet),
    ],
    senderAddr,
  );
}

export async function mintFromLaunchpad(senderAddr, nftContract, quantity) {
  return executeOnChain(
    CONTRACTS.LAUNCHPAD,
    LAUNCHPAD_ABI,
    'mint',
    [await toAddress(nftContract), BigInt(quantity)],
    senderAddr,
  );
}

export async function withdrawProceeds(senderAddr, nftContract) {
  return executeOnChain(
    CONTRACTS.LAUNCHPAD,
    LAUNCHPAD_ABI,
    'withdraw',
    [await toAddress(nftContract)],
    senderAddr,
  );
}

export async function setNFTMinter(collectionAddr, senderAddr, minterAddr) {
  return executeOnChain(
    collectionAddr,
    BASE_NFT_ABI,
    'setMinter',
    [await toAddress(minterAddr)],
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
