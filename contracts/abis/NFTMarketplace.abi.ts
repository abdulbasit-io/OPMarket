import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const NFTMarketplaceEvents = [];

export const NFTMarketplaceAbi = [
    {
        name: 'list',
        inputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
            { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
            { name: 'royaltyRecipient', type: ABIDataTypes.ADDRESS },
            { name: 'royaltyBps', type: ABIDataTypes.UINT256 },
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
        constant: true,
        inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'seller', type: ABIDataTypes.UINT256 },
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
            { name: 'paymentToken', type: ABIDataTypes.UINT256 },
            { name: 'royaltyRecipient', type: ABIDataTypes.UINT256 },
            { name: 'royaltyBps', type: ABIDataTypes.UINT256 },
            { name: 'status', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getListingCount',
        constant: true,
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
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'recipient', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPlatformFee',
        constant: true,
        inputs: [],
        outputs: [{ name: 'feeBps', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...NFTMarketplaceEvents,
    ...OP_NET_ABI,
];

export default NFTMarketplaceAbi;
