import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const BaseNFTEvents = [
    {
        name: 'Transferred',
        values: [
            { name: 'operator', type: ABIDataTypes.ADDRESS },
            { name: 'from', type: ABIDataTypes.ADDRESS },
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const BaseNFTAbi = [
    {
        name: 'mintTo',
        inputs: [
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'quantity', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'firstTokenId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'mint',
        inputs: [{ name: 'quantity', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'firstTokenId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'openMinting',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setMinter',
        inputs: [{ name: 'minter', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setMaxPerWallet',
        inputs: [{ name: 'maxPerWallet', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getMinter',
        constant: true,
        inputs: [],
        outputs: [{ name: 'minter', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isMintingOpen',
        constant: true,
        inputs: [],
        outputs: [{ name: 'open', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    ...BaseNFTEvents,
    ...OP_NET_ABI,
];

export default BaseNFTAbi;
