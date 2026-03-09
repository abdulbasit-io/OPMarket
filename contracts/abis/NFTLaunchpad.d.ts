import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the register function call.
 */
export type Register = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the mint function call.
 */
export type Mint = CallResult<
    {
        firstTokenId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the withdraw function call.
 */
export type Withdraw = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCollection function call.
 */
export type GetCollection = CallResult<
    {
        creator: bigint;
        paymentToken: bigint;
        mintPrice: bigint;
        maxSupply: bigint;
        minted: bigint;
        startBlock: bigint;
        endBlock: bigint;
        royaltyBps: bigint;
        proceeds: bigint;
        maxPerWallet: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getMinted function call.
 */
export type GetMinted = CallResult<
    {
        minted: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getWalletMintCount function call.
 */
export type GetWalletMintCount = CallResult<
    {
        minted: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// INFTLaunchpad
// ------------------------------------------------------------------
export interface INFTLaunchpad extends IOP_NETContract {
    register(
        nftContract: Address,
        mintPrice: bigint,
        paymentToken: Address,
        maxSupply: bigint,
        startBlock: bigint,
        endBlock: bigint,
        royaltyBps: bigint,
        maxPerWallet: bigint,
    ): Promise<Register>;
    mint(nftContract: Address, quantity: bigint): Promise<Mint>;
    withdraw(nftContract: Address): Promise<Withdraw>;
    getCollection(nftContract: Address): Promise<GetCollection>;
    getMinted(nftContract: Address): Promise<GetMinted>;
    getWalletMintCount(nftContract: Address, wallet: Address): Promise<GetWalletMintCount>;
}
