# NFT Marketplace + Launchpad on OPNet

## Overview

A two-product suite built on Bitcoin L1 via OPNet:

1. **NFT Marketplace** — fixed-price trading of OP721 NFTs, paid in any OP20 token
2. **NFT Launchpad** — creator registration, public mint coordination, and proceeds distribution

Combined into one frontend with shared contracts. No backend or indexer required — all state lives on-chain.

---

## Critical Architecture Constraint

OPNet has no `CREATE`/`CREATE2` equivalent. **Contracts cannot deploy other contracts.** This rules out the Ethereum factory pattern (one launchpad contract spawning collection contracts on the fly).

### Solution: Registry Model

- Creators deploy their own OP721 contract from a standard template
- They register it with the launchpad contract
- The launchpad coordinates minting and holds proceeds in escrow
- Collections remain portable — they work with any marketplace, not just this one

---

## Product 1: NFT Marketplace

### Mechanism

Uses the **approval model** — non-custodial. The marketplace never holds the NFT.

```
1. Seller: nftContract.setApprovalForAll(marketplaceAddress, true)
2. Seller: marketplace.list(nftContract, tokenId, price, paymentToken)
3. Buyer:  marketplace.buy(listingId)
           → marketplace calls nftContract.transferFrom(seller, buyer, tokenId)
           → marketplace calls paymentToken.transferFrom(buyer, seller, price - fees)
           → atomic, single OPNet transaction
```

The listing record stored in the marketplace contract contains:
- seller address
- NFT contract address
- token ID
- price
- payment token address
- royalty recipient + bps (from collection registration)

### Contract State

```
listings: Map<u256, Listing>     // listingId → listing struct
platformFeeBps: u16              // e.g. 250 = 2.5%
royalties: Map<Address, u16>     // nftContract → royalty bps
royaltyRecipient: Map<Address, Address>
```

### Feature Scope

| Feature | MVP | Phase 2 |
|---|---|---|
| Fixed-price listings | Yes | — |
| OP20 payment (any token) | Yes | — |
| Platform fee (bps) | Yes | — |
| Creator royalties | Yes | — |
| Cancel listing | Yes | — |
| Auctions | No | Yes |
| Offers / bids | No | Yes |

> Auctions and offers require locking OP20 bid funds in escrow — doable but deferred to Phase 2.

---

## Product 2: NFT Launchpad

### Creator Flow

```
1. Creator deploys BaseNFT.ts (standard OP721 template)
2. Creator calls launchpad.register(
       nftContract,
       mintPrice,       // in OP20 tokens
       paymentToken,    // any deployed OP20
       maxSupply,
       startBlock,
       endBlock,
       royaltyBps
   )
3. Creator calls nftContract.grantRole(MINTER_ROLE, launchpadAddress)
4. Mint window opens at startBlock
5. Users call launchpad.mint(nftContract, quantity)
   → launchpad verifies payment, calls nftContract.mintTo(buyer, nextTokenId)
   → OP20 held in launchpad escrow
6. Creator calls launchpad.withdraw(nftContract) after mint ends
```

### Contract State

```
collections: Map<Address, CollectionConfig>
// CollectionConfig {
//   creator, paymentToken, mintPrice,
//   maxSupply, minted, startBlock, endBlock,
//   royaltyBps, proceeds
// }
```

### Feature Scope

| Feature | MVP | Phase 2 |
|---|---|---|
| Collection registration | Yes | — |
| Timed mint window (blocks) | Yes | — |
| OP20 mint payment | Yes | — |
| Proceeds escrow + withdraw | Yes | — |
| Per-wallet mint limit | Yes | — |
| Allowlist / whitelist phase | No | Yes |
| Reveal mechanic (hidden URI) | No | Yes |
| Refunds if mint fails | No | Yes |

---

## Contracts to Build

### 1. `BaseNFT.ts` (AssemblyScript)

Standard OP721 template that creators deploy for each collection.

- Extends `OP721`
- Minter role (only launchpad can mint after registration)
- `tokenURI(tokenId)` returning `baseURI + tokenId`
- Royalty info stored (bps + recipient)
- Owner can update base URI (for reveal)
- Upgradeable via OPNet's native bytecode replacement

### 2. `NFTLaunchpad.ts` (AssemblyScript)

- `register(nftContract, mintPrice, paymentToken, maxSupply, startBlock, endBlock, royaltyBps)`
- `mint(nftContract, quantity)` — validates window, payment, supply cap; calls mintTo
- `withdraw(nftContract)` — releases proceeds to creator
- `getCollection(nftContract)` — read collection config
- `getMinted(nftContract)` — read current mint count

### 3. `NFTMarketplace.ts` (AssemblyScript)

- `list(nftContract, tokenId, price, paymentToken)` — creates listing
- `buy(listingId)` — atomic NFT/OP20 swap
- `cancel(listingId)` — seller removes listing
- `setFee(bps)` — owner sets platform fee
- `getListing(listingId)` — read listing
- `getListingsByCollection(nftContract)` — enumerate listings
- `withdraw()` — owner claims accumulated platform fees

---

## Frontend

### Pages / Tabs

```
/launch       → Launch wizard + registered collection pages
/marketplace  → Browse all NFTs for sale
/collection/:addr  → Individual collection (mint page or marketplace view)
/my-nfts      → Wallet's owned NFTs + list-for-sale UI
```

### Launch Wizard (multi-step form)

1. Collection details — name, symbol, description, base URI (IPFS/Arweave)
2. Mint config — max supply, price, payment token, start/end block, per-wallet limit
3. Deploy — user deploys BaseNFT via OPWallet, then calls launchpad.register
4. Grant minter role — user calls nftContract.grantRole(MINTER_ROLE, launchpad)
5. Done — collection page goes live

### Marketplace Browse

- Grid of listed NFTs (image from tokenURI, name, price, payment token)
- Filter by collection, sort by price / recently listed
- One-click buy (approve + buy in sequence if not already approved)
- Floor price and 24h volume per collection (computed from on-chain events)

### My NFTs

- All OP721 tokens owned by connected wallet (read from registered collections)
- List for sale (approve + list)
- Delist / update price
- Transfer to another address

---

## No Backend Required

All data is read directly from OPNet via `JSONRpcProvider`:

| Data | Source |
|---|---|
| Collection config | `launchpad.getCollection(addr)` |
| Active listings | `marketplace.getListing(id)` + event scan |
| Owned NFTs | `nftContract.balanceOf` + `tokenOfOwnerByIndex` |
| Mint progress | `launchpad.getMinted(addr)` vs `maxSupply` |
| Token metadata | `nftContract.tokenURI(id)` → fetch from IPFS/Arweave |

---

## Build Order

### Phase 1 — Marketplace first

The marketplace is simpler and immediately useful even with manually deployed NFTs. Validates that atomic OP721/OP20 swaps work on testnet before adding launchpad complexity.

1. Write and deploy `NFTMarketplace.ts`
2. Write a test OP721 collection (manual deploy)
3. Build marketplace frontend (browse, buy, list)
4. Test end-to-end on OPNet testnet

### Phase 2 — Launchpad

1. Write `BaseNFT.ts` template
2. Write and deploy `NFTLaunchpad.ts`
3. Build launch wizard frontend
4. Wire launchpad collections into marketplace (auto-display, verified badge)

### Phase 3 — Polish

- Auctions and offers
- Allowlist / whitelist mint phase
- Reveal mechanic
- Collection analytics (volume, floor, owners)
- Mobile-responsive UI

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| No OP20 payment token widely distributed | Use HODL (existing deployed OP20) as default payment token for MVP |
| No metadata standard defined for OP721 | Define `tokenURI` convention (IPFS/Arweave CID + token ID suffix) — set the standard |
| Royalty enforcement is on-contract only | Acceptable for MVP — same position early OpenSea was in |
| No block-to-date conversion | Display block numbers; approximate: current block + N ≈ N × 10 min |
| Creator must do two transactions (deploy + register) | Guide them through it in the wizard UI — not unusual for NFT creators |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Smart contracts | AssemblyScript → WASM (OPNet runtime) |
| Contract interaction | `@btc-vision/opnet` — getContract → simulate → sendTransaction |
| Wallet | OPWallet (only supported wallet on OPNet) |
| Frontend | React + Vite + TypeScript |
| Metadata storage | IPFS via web3.storage or Pinata |
| Network | OPNet testnet (Signet fork) → mainnet |
| Hosting | Vercel |
