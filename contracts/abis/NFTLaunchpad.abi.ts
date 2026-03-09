import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const NFTLaunchpadEvents = [];

export const NFTLaunchpadAbi = [
    {
        name: 'register',
        inputs: [
            { name: 'nftContract', type: ABIDataTypes.ADDRESS },
            { name: 'mintPrice', type: ABIDataTypes.UINT256 },
            { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
            { name: 'maxSupply', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
            { name: 'royaltyBps', type: ABIDataTypes.UINT256 },
            { name: 'maxPerWallet', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'mint',
        inputs: [
            { name: 'nftContract', type: ABIDataTypes.ADDRESS },
            { name: 'quantity', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'firstTokenId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'withdraw',
        inputs: [{ name: 'nftContract', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getCollection',
        constant: true,
        inputs: [{ name: 'nftContract', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'creator', type: ABIDataTypes.UINT256 },
            { name: 'paymentToken', type: ABIDataTypes.UINT256 },
            { name: 'mintPrice', type: ABIDataTypes.UINT256 },
            { name: 'maxSupply', type: ABIDataTypes.UINT256 },
            { name: 'minted', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
            { name: 'royaltyBps', type: ABIDataTypes.UINT256 },
            { name: 'proceeds', type: ABIDataTypes.UINT256 },
            { name: 'maxPerWallet', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getMinted',
        constant: true,
        inputs: [{ name: 'nftContract', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'minted', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getWalletMintCount',
        constant: true,
        inputs: [
            { name: 'nftContract', type: ABIDataTypes.ADDRESS },
            { name: 'wallet', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'minted', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...NFTLaunchpadEvents,
    ...OP_NET_ABI,
];

export default NFTLaunchpadAbi;
