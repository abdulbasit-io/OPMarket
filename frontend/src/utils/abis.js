// ── Contract ABIs ─────────────────────────────────────────
// Defined inline using ABIDataTypes / BitcoinAbiTypes from opnet
// so Vite resolves everything within the frontend module tree.
import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

// ── NFTLaunchpad ──────────────────────────────────────────
export const NFTLaunchpadAbi = [
  {
    name: 'registerCollection',
    inputs: [
      { name: 'name',         type: ABIDataTypes.STRING  },
      { name: 'symbol',       type: ABIDataTypes.STRING  },
      { name: 'imageURI',     type: ABIDataTypes.STRING  },
      { name: 'maxSupply',    type: ABIDataTypes.UINT256 },
      { name: 'mintPrice',    type: ABIDataTypes.UINT256 },
      { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
      { name: 'startBlock',   type: ABIDataTypes.UINT256 },
      { name: 'endBlock',     type: ABIDataTypes.UINT256 },
      { name: 'royaltyBps',   type: ABIDataTypes.UINT256 },
      { name: 'maxPerWallet', type: ABIDataTypes.UINT256 },
    ],
    outputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'mint',
    inputs: [
      { name: 'collectionId', type: ABIDataTypes.UINT256 },
      { name: 'quantity',     type: ABIDataTypes.UINT256 },
    ],
    outputs: [{ name: 'firstTokenId', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'withdraw',
    inputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'marketplaceTransfer',
    inputs: [
      { name: 'collectionId', type: ABIDataTypes.UINT256 },
      { name: 'tokenId',      type: ABIDataTypes.UINT256 },
      { name: 'from',         type: ABIDataTypes.ADDRESS },
      { name: 'to',           type: ABIDataTypes.ADDRESS },
    ],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'ownerOf',
    inputs: [
      { name: 'collectionId', type: ABIDataTypes.UINT256 },
      { name: 'tokenId',      type: ABIDataTypes.UINT256 },
    ],
    outputs: [{ name: 'owner', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'balanceOf',
    inputs: [
      { name: 'collectionId', type: ABIDataTypes.UINT256 },
      { name: 'owner',        type: ABIDataTypes.ADDRESS },
    ],
    outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'getCollection',
    inputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
    outputs: [
      { name: 'creator',      type: ABIDataTypes.UINT256 },
      { name: 'mintPrice',    type: ABIDataTypes.UINT256 },
      { name: 'paymentToken', type: ABIDataTypes.UINT256 },
      { name: 'maxSupply',    type: ABIDataTypes.UINT256 },
      { name: 'minted',       type: ABIDataTypes.UINT256 },
      { name: 'startBlock',   type: ABIDataTypes.UINT256 },
      { name: 'endBlock',     type: ABIDataTypes.UINT256 },
      { name: 'royaltyBps',   type: ABIDataTypes.UINT256 },
      { name: 'maxPerWallet', type: ABIDataTypes.UINT256 },
      { name: 'proceeds',     type: ABIDataTypes.UINT256 },
    ],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'getCollectionCount',
    inputs: [],
    outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'getCollectionStrings',
    inputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
    outputs: [
      { name: 'name',     type: ABIDataTypes.STRING },
      { name: 'symbol',   type: ABIDataTypes.STRING },
      { name: 'imageURI', type: ABIDataTypes.STRING },
    ],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'setMarketplace',
    inputs: [{ name: 'marketplace', type: ABIDataTypes.ADDRESS }],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'Transferred',
    values: [
      { name: 'operator', type: ABIDataTypes.ADDRESS },
      { name: 'from',     type: ABIDataTypes.ADDRESS },
      { name: 'to',       type: ABIDataTypes.ADDRESS },
      { name: 'amount',   type: ABIDataTypes.UINT256 },
    ],
    type: BitcoinAbiTypes.Event,
  },
  ...OP_NET_ABI,
];

// ── NFTMarketplace ────────────────────────────────────────
export const NFTMarketplaceAbi = [
  {
    name: 'list',
    inputs: [
      { name: 'collectionId',     type: ABIDataTypes.UINT256 },
      { name: 'tokenId',          type: ABIDataTypes.UINT256 },
      { name: 'price',            type: ABIDataTypes.UINT256 },
      { name: 'paymentToken',     type: ABIDataTypes.ADDRESS },
      { name: 'royaltyRecipient', type: ABIDataTypes.ADDRESS },
      { name: 'royaltyBps',       type: ABIDataTypes.UINT256 },
    ],
    outputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'buy',
    inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'cancel',
    inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'getListing',
    inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }],
    outputs: [
      { name: 'seller',           type: ABIDataTypes.UINT256 },
      { name: 'collectionId',     type: ABIDataTypes.UINT256 },
      { name: 'tokenId',          type: ABIDataTypes.UINT256 },
      { name: 'price',            type: ABIDataTypes.UINT256 },
      { name: 'paymentToken',     type: ABIDataTypes.UINT256 },
      { name: 'royaltyRecipient', type: ABIDataTypes.UINT256 },
      { name: 'royaltyBps',       type: ABIDataTypes.UINT256 },
      { name: 'status',           type: ABIDataTypes.UINT256 },
    ],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'getListingCount',
    inputs: [],
    outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'setLaunchpad',
    inputs: [{ name: 'launchpad', type: ABIDataTypes.ADDRESS }],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'setFee',
    inputs: [{ name: 'feeBps', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'withdrawFees',
    inputs: [
      { name: 'token',     type: ABIDataTypes.ADDRESS },
      { name: 'recipient', type: ABIDataTypes.ADDRESS },
      { name: 'amount',    type: ABIDataTypes.UINT256 },
    ],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'getPlatformFee',
    inputs: [],
    outputs: [{ name: 'feeBps', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  ...OP_NET_ABI,
];

// ── OP20 ──────────────────────────────────────────────────
export const OP20Abi = [
  {
    name: 'symbol',
    inputs: [],
    outputs: [{ name: 'symbol', type: ABIDataTypes.STRING }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'decimals',
    inputs: [],
    outputs: [{ name: 'decimals', type: ABIDataTypes.UINT8 }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
    outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'allowance',
    inputs: [
      { name: 'owner',   type: ABIDataTypes.ADDRESS },
      { name: 'spender', type: ABIDataTypes.ADDRESS },
    ],
    outputs: [{ name: 'remaining', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  {
    name: 'increaseAllowance',
    inputs: [
      { name: 'spender', type: ABIDataTypes.ADDRESS },
      { name: 'amount',  type: ABIDataTypes.UINT256 },
    ],
    outputs: [],
    type: BitcoinAbiTypes.Function,
  },
  ...OP_NET_ABI,
];

// ── TestWBTC faucet ───────────────────────────────────────
export const TestWBTCAbi = [
  {
    name: 'faucet',
    inputs: [],
    outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
    type: BitcoinAbiTypes.Function,
  },
  ...OP_NET_ABI,
];
