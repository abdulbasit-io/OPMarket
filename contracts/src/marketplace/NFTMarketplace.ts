import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    OP_NET,
    Revert,
    SafeMath,
    Selector,
    StoredMapU256,
    StoredU256,
    encodeSelector,
} from '@btc-vision/btc-runtime/runtime';
import { EMPTY_POINTER } from '@btc-vision/btc-runtime/runtime/math/bytes';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';

// ═══════════════════════════════════════════════════════════
// NFTMarketplace — Secondary market for NFTLaunchpad collections
// ═══════════════════════════════════════════════════════════
//
// Works with the self-contained NFTLaunchpad that tracks ownership
// internally. No external NFT contract needed.
//
// Seller flow:
//   1. marketplace.list(collectionId, tokenId, price, paymentToken,
//                       royaltyRecipient, royaltyBps)
//
// Buyer flow:
//   1. paymentToken.increaseAllowance(marketplace, price)
//   2. marketplace.buy(listingId)
//      → launchpad.marketplaceTransfer(collId, tokenId, seller, buyer)
//      → token.transferFrom(buyer → seller, sellerProceeds)
//      → token.transferFrom(buyer → royaltyRecipient, royalty)
//      → token.transferFrom(buyer → marketplace, platformFee)
// ═══════════════════════════════════════════════════════════

// ─── Cross-contract selectors ──────────────────────────────
const SEL_MARKETPLACE_TRANSFER: Selector = encodeSelector('marketplaceTransfer');
const SEL_TRANSFER_FROM: Selector        = encodeSelector('transferFrom');
const SEL_TRANSFER: Selector             = encodeSelector('transfer');

// ─── Global storage pointers ───────────────────────────────
const deployerPtr:       u16 = Blockchain.nextPointer;
const launchpadPtr:      u16 = Blockchain.nextPointer;
const listCountPtr:      u16 = Blockchain.nextPointer;
const platformFeePtr:    u16 = Blockchain.nextPointer;
const feeAccruedPtr:     u16 = Blockchain.nextPointer;

// ─── Per-listing map pointers ──────────────────────────────
const listSellerMapPtr:          u16 = Blockchain.nextPointer;
const listCollIdMapPtr:          u16 = Blockchain.nextPointer;
const listTokenIdMapPtr:         u16 = Blockchain.nextPointer;
const listPriceMapPtr:           u16 = Blockchain.nextPointer;
const listPayTokenMapPtr:        u16 = Blockchain.nextPointer;
const listRoyaltyRecipientMapPtr:u16 = Blockchain.nextPointer;
const listRoyaltyBpsMapPtr:      u16 = Blockchain.nextPointer;
const listStatusMapPtr:          u16 = Blockchain.nextPointer;

// ─── Listing status constants ──────────────────────────────
const STATUS_ACTIVE:    u256 = u256.fromU64(0);
const STATUS_SOLD:      u256 = u256.fromU64(1);
const STATUS_CANCELLED: u256 = u256.fromU64(2);

// ─── Platform constants ────────────────────────────────────
const BASIS_POINTS:   u256 = u256.fromU64(10000);
const MAX_FEE_BPS:    u256 = u256.fromU64(1000); // 10% max
const DEFAULT_FEE:    u256 = u256.fromU64(250);  // 2.5%

// ─── Composite key for listing maps ───────────────────────
// Encodes (listingId, fieldId) as a unique u256 storage key.
function listingKey(listingId: u256, fieldId: u256): u256 {
    const buf = new Uint8Array(64);
    const a = listingId.toUint8Array(true);
    const b = fieldId.toUint8Array(true);
    for (let i = 0; i < 32; i++) buf[i] = a[i];
    for (let i = 0; i < 32; i++) buf[32 + i] = b[i];
    return u256.fromUint8ArrayBE(sha256(buf));
}

// Field IDs (used as the second argument to listingKey)
const FIELD_SELLER:           u256 = u256.fromU64(0);
const FIELD_COLL_ID:          u256 = u256.fromU64(1);
const FIELD_TOKEN_ID:         u256 = u256.fromU64(2);
const FIELD_PRICE:            u256 = u256.fromU64(3);
const FIELD_PAY_TOKEN:        u256 = u256.fromU64(4);
const FIELD_ROYALTY_RECIPIENT:u256 = u256.fromU64(5);
const FIELD_ROYALTY_BPS:      u256 = u256.fromU64(6);
const FIELD_STATUS:           u256 = u256.fromU64(7);

@final
export class NFTMarketplace extends OP_NET {
    private readonly _deployer:     StoredU256;
    private readonly _launchpad:    StoredU256;
    private readonly _listCount:    StoredU256;
    private readonly _platformFee:  StoredU256;
    private readonly _feeAccrued:   StoredU256;

    // Per-listing storage maps (each field in its own map, keyed by listingId)
    private readonly _sellers:          StoredMapU256;
    private readonly _collIds:          StoredMapU256;
    private readonly _tokenIds:         StoredMapU256;
    private readonly _prices:           StoredMapU256;
    private readonly _payTokens:        StoredMapU256;
    private readonly _royaltyRecipients:StoredMapU256;
    private readonly _royaltyBps:       StoredMapU256;
    private readonly _statuses:         StoredMapU256;

    public constructor() {
        super();
        this._deployer    = new StoredU256(deployerPtr,    EMPTY_POINTER);
        this._launchpad   = new StoredU256(launchpadPtr,   EMPTY_POINTER);
        this._listCount   = new StoredU256(listCountPtr,   EMPTY_POINTER);
        this._platformFee = new StoredU256(platformFeePtr, EMPTY_POINTER);
        this._feeAccrued  = new StoredU256(feeAccruedPtr,  EMPTY_POINTER);

        this._sellers           = new StoredMapU256(listSellerMapPtr);
        this._collIds           = new StoredMapU256(listCollIdMapPtr);
        this._tokenIds          = new StoredMapU256(listTokenIdMapPtr);
        this._prices            = new StoredMapU256(listPriceMapPtr);
        this._payTokens         = new StoredMapU256(listPayTokenMapPtr);
        this._royaltyRecipients = new StoredMapU256(listRoyaltyRecipientMapPtr);
        this._royaltyBps        = new StoredMapU256(listRoyaltyBpsMapPtr);
        this._statuses          = new StoredMapU256(listStatusMapPtr);
    }

    // ─── Deployment ────────────────────────────────────────
    // No calldata required. Link the launchpad after deployment via setLaunchpad().
    public override onDeployment(_calldata: Calldata): void {
        this._deployer.set(u256.fromUint8ArrayBE(Blockchain.tx.origin));
        this._platformFee.set(DEFAULT_FEE);
    }

    public override onUpdate(_calldata: Calldata): void {
        super.onUpdate(_calldata);
    }

    // ─── Auth ───────────────────────────────────────────────
    private requireDeployer(caller: Address): void {
        if (!u256.eq(this.addrToU256(caller), this._deployer.value)) {
            throw new Revert('Only deployer');
        }
    }

    // ─── Address helpers ────────────────────────────────────
    private addrToU256(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    private u256ToAddr(v: u256): Address {
        const buf = new Uint8Array(32);
        buf[0]  = u8(v.hi2 >> 56); buf[1]  = u8(v.hi2 >> 48); buf[2]  = u8(v.hi2 >> 40); buf[3]  = u8(v.hi2 >> 32);
        buf[4]  = u8(v.hi2 >> 24); buf[5]  = u8(v.hi2 >> 16); buf[6]  = u8(v.hi2 >> 8);  buf[7]  = u8(v.hi2);
        buf[8]  = u8(v.hi1 >> 56); buf[9]  = u8(v.hi1 >> 48); buf[10] = u8(v.hi1 >> 40); buf[11] = u8(v.hi1 >> 32);
        buf[12] = u8(v.hi1 >> 24); buf[13] = u8(v.hi1 >> 16); buf[14] = u8(v.hi1 >> 8);  buf[15] = u8(v.hi1);
        buf[16] = u8(v.lo2 >> 56); buf[17] = u8(v.lo2 >> 48); buf[18] = u8(v.lo2 >> 40); buf[19] = u8(v.lo2 >> 32);
        buf[20] = u8(v.lo2 >> 24); buf[21] = u8(v.lo2 >> 16); buf[22] = u8(v.lo2 >> 8);  buf[23] = u8(v.lo2);
        buf[24] = u8(v.lo1 >> 56); buf[25] = u8(v.lo1 >> 48); buf[26] = u8(v.lo1 >> 40); buf[27] = u8(v.lo1 >> 32);
        buf[28] = u8(v.lo1 >> 24); buf[29] = u8(v.lo1 >> 16); buf[30] = u8(v.lo1 >> 8);  buf[31] = u8(v.lo1);
        return changetype<Address>(buf);
    }

    // ─── Cross-contract helpers ─────────────────────────────

    // Call launchpad.marketplaceTransfer(collectionId, tokenId, from, to)
    private callMarketplaceTransfer(
        collId:  u256,
        tokenId: u256,
        from:    Address,
        to:      Address,
    ): void {
        const launchpad: Address = this.u256ToAddr(this._launchpad.value);
        // 4 (selector) + 32 + 32 + 32 + 32 = 132 bytes
        const cd = new BytesWriter(132);
        cd.writeSelector(SEL_MARKETPLACE_TRANSFER);
        cd.writeU256(collId);
        cd.writeU256(tokenId);
        cd.writeAddress(from);
        cd.writeAddress(to);
        Blockchain.call(launchpad, cd, true);
    }

    // Call OP20.transferFrom(from, to, amount)
    private callTransferFrom(token: Address, from: Address, to: Address, amount: u256): void {
        const cd = new BytesWriter(100);
        cd.writeSelector(SEL_TRANSFER_FROM);
        cd.writeAddress(from);
        cd.writeAddress(to);
        cd.writeU256(amount);
        Blockchain.call(token, cd, true);
    }

    // Call OP20.transfer(to, amount) — used for fee withdrawal
    private callTransfer(token: Address, to: Address, amount: u256): void {
        const cd = new BytesWriter(68);
        cd.writeSelector(SEL_TRANSFER);
        cd.writeAddress(to);
        cd.writeU256(amount);
        Blockchain.call(token, cd, true);
    }

    // ─── Listing storage helpers ────────────────────────────
    private storeL(listId: u256, field: u256, map: StoredMapU256, value: u256): void {
        map.set(listingKey(listId, field), value);
    }

    private readL(listId: u256, field: u256, map: StoredMapU256): u256 {
        return map.get(listingKey(listId, field));
    }

    // ─── list ───────────────────────────────────────────────
    // Creator/owner lists a launchpad NFT for secondary sale.
    // royaltyRecipient: pass zero address for no royalty.
    @method(
        { name: 'collectionId',     type: ABIDataTypes.UINT256 },
        { name: 'tokenId',          type: ABIDataTypes.UINT256 },
        { name: 'price',            type: ABIDataTypes.UINT256 },
        { name: 'paymentToken',     type: ABIDataTypes.ADDRESS },
        { name: 'royaltyRecipient', type: ABIDataTypes.ADDRESS },
        { name: 'royaltyBps',       type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'listingId', type: ABIDataTypes.UINT256 })
    public list(calldata: Calldata): BytesWriter {
        const collId:           u256    = calldata.readU256();
        const tokenId:          u256    = calldata.readU256();
        const price:            u256    = calldata.readU256();
        const paymentToken:     Address = calldata.readAddress();
        const royaltyRecipient: Address = calldata.readAddress();
        const royaltyBps:       u256    = calldata.readU256();

        if (price.isZero()) throw new Revert('Price must be > 0');
        if (u256.gt(royaltyBps, u256.fromU64(1000))) throw new Revert('Royalty exceeds 10%');

        const seller: Address = Blockchain.tx.sender;
        const listId: u256    = this._listCount.value;

        this.storeL(listId, FIELD_SELLER,            this._sellers,           this.addrToU256(seller));
        this.storeL(listId, FIELD_COLL_ID,           this._collIds,           collId);
        this.storeL(listId, FIELD_TOKEN_ID,           this._tokenIds,          tokenId);
        this.storeL(listId, FIELD_PRICE,              this._prices,            price);
        this.storeL(listId, FIELD_PAY_TOKEN,          this._payTokens,         this.addrToU256(paymentToken));
        this.storeL(listId, FIELD_ROYALTY_RECIPIENT,  this._royaltyRecipients, this.addrToU256(royaltyRecipient));
        this.storeL(listId, FIELD_ROYALTY_BPS,        this._royaltyBps,        royaltyBps);
        this.storeL(listId, FIELD_STATUS,             this._statuses,          STATUS_ACTIVE);

        this._listCount.set(SafeMath.add(listId, u256.One));

        const writer = new BytesWriter(32);
        writer.writeU256(listId);
        return writer;
    }

    // ─── buy ────────────────────────────────────────────────
    // Buyer pays OP20. Ownership transferred via launchpad.marketplaceTransfer.
    // Buyer must have called paymentToken.increaseAllowance(marketplace, price) first.
    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public buy(calldata: Calldata): BytesWriter {
        const listId: u256 = calldata.readU256();

        const status: u256 = this.readL(listId, FIELD_STATUS, this._statuses);
        if (!u256.eq(status, STATUS_ACTIVE)) throw new Revert('Listing not active');

        const buyer: Address = Blockchain.tx.sender;

        const sellerHash:           u256 = this.readL(listId, FIELD_SELLER,            this._sellers);
        const collId:               u256 = this.readL(listId, FIELD_COLL_ID,           this._collIds);
        const tokenId:              u256 = this.readL(listId, FIELD_TOKEN_ID,           this._tokenIds);
        const price:                u256 = this.readL(listId, FIELD_PRICE,              this._prices);
        const payTokenHash:         u256 = this.readL(listId, FIELD_PAY_TOKEN,          this._payTokens);
        const royaltyRecipientHash: u256 = this.readL(listId, FIELD_ROYALTY_RECIPIENT,  this._royaltyRecipients);
        const royaltyBps:           u256 = this.readL(listId, FIELD_ROYALTY_BPS,        this._royaltyBps);

        if (u256.eq(this.addrToU256(buyer), sellerHash)) throw new Revert('Cannot buy own listing');

        const seller:           Address = this.u256ToAddr(sellerHash);
        const paymentToken:     Address = this.u256ToAddr(payTokenHash);
        const royaltyRecipient: Address = this.u256ToAddr(royaltyRecipientHash);

        // Fee breakdown
        const platformFee: u256 = SafeMath.div(SafeMath.mul(price, this._platformFee.value), BASIS_POINTS);
        const royaltyFee:  u256 = royaltyBps.isZero()
            ? u256.Zero
            : SafeMath.div(SafeMath.mul(price, royaltyBps), BASIS_POINTS);
        const sellerProceeds: u256 = SafeMath.sub(SafeMath.sub(price, platformFee), royaltyFee);

        // Step 1: Transfer NFT ownership via launchpad
        this.callMarketplaceTransfer(collId, tokenId, seller, buyer);

        // Step 2: Pay seller
        if (!sellerProceeds.isZero()) {
            this.callTransferFrom(paymentToken, buyer, seller, sellerProceeds);
        }

        // Step 3: Pay royalty recipient
        if (!royaltyFee.isZero() && !royaltyRecipientHash.isZero()) {
            this.callTransferFrom(paymentToken, buyer, royaltyRecipient, royaltyFee);
        }

        // Step 4: Collect platform fee into marketplace
        if (!platformFee.isZero()) {
            this.callTransferFrom(paymentToken, buyer, Blockchain.contractAddress, platformFee);
            this._feeAccrued.set(SafeMath.add(this._feeAccrued.value, platformFee));
        }

        // Mark sold
        this.storeL(listId, FIELD_STATUS, this._statuses, STATUS_SOLD);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── cancel ─────────────────────────────────────────────
    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public cancel(calldata: Calldata): BytesWriter {
        const listId: u256 = calldata.readU256();

        const status: u256 = this.readL(listId, FIELD_STATUS, this._statuses);
        if (!u256.eq(status, STATUS_ACTIVE)) throw new Revert('Listing not active');

        const sellerHash: u256 = this.readL(listId, FIELD_SELLER, this._sellers);
        if (!u256.eq(this.addrToU256(Blockchain.tx.sender), sellerHash)) {
            throw new Revert('Only seller can cancel');
        }

        this.storeL(listId, FIELD_STATUS, this._statuses, STATUS_CANCELLED);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── getListing ─────────────────────────────────────────
    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'seller',           type: ABIDataTypes.UINT256 },
        { name: 'collectionId',     type: ABIDataTypes.UINT256 },
        { name: 'tokenId',          type: ABIDataTypes.UINT256 },
        { name: 'price',            type: ABIDataTypes.UINT256 },
        { name: 'paymentToken',     type: ABIDataTypes.UINT256 },
        { name: 'royaltyRecipient', type: ABIDataTypes.UINT256 },
        { name: 'royaltyBps',       type: ABIDataTypes.UINT256 },
        { name: 'status',           type: ABIDataTypes.UINT256 },
    )
    @view
    public getListing(calldata: Calldata): BytesWriter {
        const listId: u256 = calldata.readU256();

        const writer = new BytesWriter(256);
        writer.writeU256(this.readL(listId, FIELD_SELLER,            this._sellers));
        writer.writeU256(this.readL(listId, FIELD_COLL_ID,           this._collIds));
        writer.writeU256(this.readL(listId, FIELD_TOKEN_ID,           this._tokenIds));
        writer.writeU256(this.readL(listId, FIELD_PRICE,              this._prices));
        writer.writeU256(this.readL(listId, FIELD_PAY_TOKEN,          this._payTokens));
        writer.writeU256(this.readL(listId, FIELD_ROYALTY_RECIPIENT,  this._royaltyRecipients));
        writer.writeU256(this.readL(listId, FIELD_ROYALTY_BPS,        this._royaltyBps));
        writer.writeU256(this.readL(listId, FIELD_STATUS,             this._statuses));
        return writer;
    }

    // ─── getListingCount ────────────────────────────────────
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    @view
    public getListingCount(_: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._listCount.value);
        return writer;
    }

    // ─── setLaunchpad (deployer only) ───────────────────────
    @method({ name: 'launchpad', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setLaunchpad(calldata: Calldata): BytesWriter {
        this.requireDeployer(Blockchain.tx.sender);
        this._launchpad.set(this.addrToU256(calldata.readAddress()));
        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── setFee (deployer only) ──────────────────────────────
    @method({ name: 'feeBps', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setFee(calldata: Calldata): BytesWriter {
        this.requireDeployer(Blockchain.tx.sender);
        const feeBps: u256 = calldata.readU256();
        if (u256.gt(feeBps, MAX_FEE_BPS)) throw new Revert('Fee exceeds 10%');
        this._platformFee.set(feeBps);
        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── withdrawFees (deployer only) ───────────────────────
    @method(
        { name: 'token',     type: ABIDataTypes.ADDRESS },
        { name: 'recipient', type: ABIDataTypes.ADDRESS },
        { name: 'amount',    type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public withdrawFees(calldata: Calldata): BytesWriter {
        this.requireDeployer(Blockchain.tx.sender);
        const token:     Address = calldata.readAddress();
        const recipient: Address = calldata.readAddress();
        const amount:    u256    = calldata.readU256();
        if (amount.isZero()) throw new Revert('Amount must be > 0');
        this.callTransfer(token, recipient, amount);
        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── getPlatformFee ─────────────────────────────────────
    @method()
    @returns({ name: 'feeBps', type: ABIDataTypes.UINT256 })
    @view
    public getPlatformFee(_: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._platformFee.value);
        return writer;
    }
}
