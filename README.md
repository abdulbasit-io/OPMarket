# OPMarket — Bitcoin NFT Marketplace & Launchpad

A non-custodial NFT marketplace and launchpad built natively on Bitcoin Layer 1 via OPNet. No bridges, no sidechains — just Bitcoin.

## Architecture

```
contracts/          # OPNet smart contracts (AssemblyScript)
├── src/nft/        # OP721 NFT token contract
├── src/marketplace/# Marketplace contract (list, buy, cancel)
└── src/launchpad/  # Launchpad contract (mint drops)

frontend/           # React + Vite web app
├── src/components/ # Navbar, Hero, Footer, ListingCard, etc.
├── src/pages/      # Landing, Marketplace, Launch, MyNFTs
├── src/context/    # WalletContext (OPNet wallet integration)
└── src/utils/      # Contract service, formatters
```

## Smart Contracts

Three AssemblyScript contracts compiled for OPNet:

| Contract | Purpose |
|----------|---------|
| **BaseNFT** | OP721-compatible NFT with royalties and metadata |
| **Marketplace** | Non-custodial listing, buying, and cancellation with 2.5% fee |
| **Launchpad** | Timed mint drops with configurable price, supply, and duration |

### Build Contracts

```bash
cd contracts
npm install
npm run build          # builds all three
npm run build:nft      # or individually
```

## Frontend

React 18 app with Vite. Connects to OPNet testnet via the OPNet browser wallet extension.

### Setup

```bash
cd frontend
npm install
cp .env.example .env   # or configure contract addresses
npm run dev            # starts on http://localhost:5173
```

### Environment Variables

```env
VITE_LAUNCHPAD_CONTRACT=<deployed launchpad address>
VITE_MARKETPLACE_CONTRACT=<deployed marketplace address>
VITE_BASE_NFT_CONTRACT=<deployed nft address>
VITE_HODL_TOKEN_CONTRACT=<HODL token address>
```

### Key Pages

- **/** — Landing page with features and how-it-works
- **/marketplace** — Browse and buy listed NFTs
- **/launch** — Register and launch an NFT collection
- **/my-nfts** — View and manage owned NFTs

## Tech Stack

- **Contracts**: AssemblyScript + `@btc-vision/btc-runtime`
- **Frontend**: React 18, React Router, Vite
- **Blockchain**: OPNet (Bitcoin L1) — `opnet` SDK, `@btc-vision/transaction`

## License

MIT
