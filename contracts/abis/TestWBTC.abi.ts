import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const TestWBTCAbi = [
    {
        name: 'faucet',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...OP_NET_ABI,
];

export default TestWBTCAbi;
