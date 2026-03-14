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
 * @description Represents the result of the registerCollection function call.
 */
export type RegisterCollection = CallResult<
    {
        collectionId: bigint;
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
    OPNetEvent<TransferredEvent>[]
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
 * @description Represents the result of the marketplaceTransfer function call.
 */
export type MarketplaceTransfer = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the ownerOf function call.
 */
export type OwnerOf = CallResult<
    {
        owner: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the balanceOf function call.
 */
export type BalanceOf = CallResult<
    {
        balance: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCollection function call.
 */
export type GetCollection = CallResult<
    {
        creator: bigint;
        mintPrice: bigint;
        paymentToken: bigint;
        maxSupply: bigint;
        minted: bigint;
        startBlock: bigint;
        endBlock: bigint;
        royaltyBps: bigint;
        maxPerWallet: bigint;
        proceeds: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCollectionCount function call.
 */
export type GetCollectionCount = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCollectionStrings function call.
 */
export type GetCollectionStrings = CallResult<
    {
        name: string;
        symbol: string;
        imageURI: string;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setMarketplace function call.
 */
export type SetMarketplace = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// INFTLaunchpad
// ------------------------------------------------------------------
export interface INFTLaunchpad extends IOP_NETContract {
    registerCollection(
        name: string,
        symbol: string,
        imageURI: string,
        maxSupply: bigint,
        mintPrice: bigint,
        paymentToken: Address,
        startBlock: bigint,
        endBlock: bigint,
        royaltyBps: bigint,
        maxPerWallet: bigint,
    ): Promise<RegisterCollection>;
    mint(collectionId: bigint, quantity: bigint): Promise<Mint>;
    withdraw(collectionId: bigint): Promise<Withdraw>;
    marketplaceTransfer(
        collectionId: bigint,
        tokenId: bigint,
        from: Address,
        to: Address,
    ): Promise<MarketplaceTransfer>;
    ownerOf(collectionId: bigint, tokenId: bigint): Promise<OwnerOf>;
    balanceOf(collectionId: bigint, owner: Address): Promise<BalanceOf>;
    getCollection(collectionId: bigint): Promise<GetCollection>;
    getCollectionCount(): Promise<GetCollectionCount>;
    getCollectionStrings(collectionId: bigint): Promise<GetCollectionStrings>;
    setMarketplace(marketplace: Address): Promise<SetMarketplace>;
}
