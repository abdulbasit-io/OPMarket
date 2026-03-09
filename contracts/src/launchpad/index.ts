import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { NFTLaunchpad } from './NFTLaunchpad';

// DO NOT TOUCH THIS.
Blockchain.contract = (): NFTLaunchpad => {
    return new NFTLaunchpad();
};

// VERY IMPORTANT
export * from '@btc-vision/btc-runtime/runtime/exports';

// VERY IMPORTANT
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
