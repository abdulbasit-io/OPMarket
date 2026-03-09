import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type TransferredEvent = {
    readonly operator: Address;
    readonly from: Address;
    readonly to: Address;
    readonly amount: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the mintTo function call.
 */
export type MintTo = CallResult<
    {
        firstTokenId: bigint;
    },
    OPNetEvent<TransferredEvent>[]
>;

/**
 * @description Represents the result of the mint function call.
 */
export type Mint = CallResult<
    {
        firstTokenId: bigint;
    },
    OPNetEvent<TransferredEvent>[]
>;

/**
 * @description Represents the result of the openMinting function call.
 */
export type OpenMinting = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setMinter function call.
 */
export type SetMinter = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setMaxPerWallet function call.
 */
export type SetMaxPerWallet = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getMinter function call.
 */
export type GetMinter = CallResult<
    {
        minter: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isMintingOpen function call.
 */
export type IsMintingOpen = CallResult<
    {
        open: boolean;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IBaseNFT
// ------------------------------------------------------------------
export interface IBaseNFT extends IOP_NETContract {
    mintTo(to: Address, quantity: bigint): Promise<MintTo>;
    mint(quantity: bigint): Promise<Mint>;
    openMinting(): Promise<OpenMinting>;
    setMinter(minter: Address): Promise<SetMinter>;
    setMaxPerWallet(maxPerWallet: bigint): Promise<SetMaxPerWallet>;
    getMinter(): Promise<GetMinter>;
    isMintingOpen(): Promise<IsMintingOpen>;
}
