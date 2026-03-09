import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the list function call.
 */
export type List = CallResult<
    {
        listingId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the buy function call.
 */
export type Buy = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the cancel function call.
 */
export type Cancel = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setFee function call.
 */
export type SetFee = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the withdrawFees function call.
 */
export type WithdrawFees = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getListing function call.
 */
export type GetListing = CallResult<
    {
        seller: bigint;
        nftContract: bigint;
        tokenId: bigint;
        price: bigint;
        paymentToken: bigint;
        royaltyRecipient: bigint;
        royaltyBps: bigint;
        status: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getListingCount function call.
 */
export type GetListingCount = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPlatformFee function call.
 */
export type GetPlatformFee = CallResult<
    {
        feeBps: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getAccruedFees function call.
 */
export type GetAccruedFees = CallResult<
    {
        accrued: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// INFTMarketplace
// ------------------------------------------------------------------
export interface INFTMarketplace extends IOP_NETContract {
    list(
        nftContract: Address,
        tokenId: bigint,
        price: bigint,
        paymentToken: Address,
        royaltyRecipient: Address,
        royaltyBps: bigint,
    ): Promise<List>;
    buy(listingId: bigint): Promise<Buy>;
    cancel(listingId: bigint): Promise<Cancel>;
    setFee(feeBps: bigint): Promise<SetFee>;
    withdrawFees(token: Address, recipient: Address, amount: bigint): Promise<WithdrawFees>;
    getListing(listingId: bigint): Promise<GetListing>;
    getListingCount(): Promise<GetListingCount>;
    getPlatformFee(): Promise<GetPlatformFee>;
    getAccruedFees(): Promise<GetAccruedFees>;
}
