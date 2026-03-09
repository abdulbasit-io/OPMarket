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
    StoredU256,
    encodeSelector,
} from '@btc-vision/btc-runtime/runtime';
import { EMPTY_POINTER } from '@btc-vision/btc-runtime/runtime/math/bytes';

// ═══════════════════════════════════════════════════════════
// NFTMarketplace — Non-Custodial OP721 NFT Exchange
// ═══════════════════════════════════════════════════════════
//
// Approval model — marketplace never holds the NFT.
//
// Seller flow:
//   1. nftContract.setApprovalForAll(marketplace, true)
//   2. marketplace.list(nftContract, tokenId, price, paymentToken, royaltyRecipient, royaltyBps)
//
// Buyer flow:
//   1. paymentToken.approve(marketplace, price)   ← full listing price
//   2. marketplace.buy(listingId)
//      → transferFrom seller→buyer (NFT)
//      → transferFrom buyer→seller (OP20 proceeds)
//      → transferFrom buyer→royaltyRecipient (royalty, if any)
//      → transferFrom buyer→marketplace (platform fee)
//
// Cross-contract selectors use OPNet's SHA256-based scheme.
// Confirmed from OPNetTransform build logs (incident INC-mmg6faj1):
//   transferFrom → 0x4b6685e7
//   transfer     → 0x3b88ef57
// isApprovedForAll and approve are computed via encodeSelector at compile time.
// ═══════════════════════════════════════════════════════════

// ─── Cross-contract selectors (SHA256-based, OPNet) ────────
// Using encodeSelector from btc-runtime which computes SHA256 of the method name.
// Do NOT hardcode Ethereum keccak256 selectors here.
const SEL_TRANSFER_FROM: Selector       = encodeSelector('transferFrom');     // 0x4b6685e7
const SEL_TRANSFER: Selector            = encodeSelector('transfer');          // 0x3b88ef57
const SEL_IS_APPROVED_FOR_ALL: Selector = encodeSelector('isApprovedForAll'); // 0x67da1fb2

// ─── Global storage pointers ───────────────────────────────
const deployerPointer: u16      = Blockchain.nextPointer;
const listingCounterPointer: u16 = Blockchain.nextPointer;
const platformFeeBpsPointer: u16 = Blockchain.nextPointer;
const platformFeeAccruedPointer: u16 = Blockchain.nextPointer;

// ─── Per-listing storage (8 slots each) ────────────────────
const LISTING_BASE_POINTER: u16 = 100; // leaves room for global pointers above
const SLOTS_PER_LISTING: u16    = 8;

// Field offsets within a listing's storage block
const F_SELLER:            u16 = 0; // u256 hash of seller address
const F_NFT_CONTRACT:      u16 = 1; // u256 hash of NFT contract address
const F_TOKEN_ID:          u16 = 2; // tokenId (u256)
const F_PRICE:             u16 = 3; // price in paymentToken units
const F_PAYMENT_TOKEN:     u16 = 4; // u256 hash of OP20 payment token address
const F_ROYALTY_RECIPIENT: u16 = 5; // u256 hash of royalty recipient (zero = no royalty)
const F_ROYALTY_BPS:       u16 = 6; // royalty in basis points (0–1000, max 10%)
const F_STATUS:            u16 = 7; // 0=active, 1=sold, 2=cancelled

// Listing status constants
const STATUS_ACTIVE:    u256 = u256.fromU64(0);
const STATUS_SOLD:      u256 = u256.fromU64(1);
const STATUS_CANCELLED: u256 = u256.fromU64(2);

// Platform constants
const BASIS_POINTS: u256      = u256.fromU64(10000);
const MAX_FEE_BPS: u256       = u256.fromU64(1000);  // 10% max platform fee
const MAX_ROYALTY_BPS: u256   = u256.fromU64(1000);  // 10% max royalty
const DEFAULT_FEE_BPS: u256   = u256.fromU64(250);   // 2.5% default

@final
export class NFTMarketplace extends OP_NET {
    private readonly _deployer:          StoredU256;
    private readonly _listingCounter:    StoredU256;
    private readonly _platformFeeBps:    StoredU256;
    private readonly _platformFeeAccrued: StoredU256;

    public constructor() {
        super();
        this._deployer           = new StoredU256(deployerPointer, EMPTY_POINTER);
        this._listingCounter     = new StoredU256(listingCounterPointer, EMPTY_POINTER);
        this._platformFeeBps     = new StoredU256(platformFeeBpsPointer, EMPTY_POINTER);
        this._platformFeeAccrued = new StoredU256(platformFeeAccruedPointer, EMPTY_POINTER);
    }

    // ─── Deployment ────────────────────────────────────────
    public override onDeployment(_calldata: Calldata): void {
        this._deployer.set(u256.fromUint8ArrayBE(Blockchain.tx.origin));
        this._platformFeeBps.set(DEFAULT_FEE_BPS);
    }

    public override onUpdate(_calldata: Calldata): void {
        super.onUpdate(_calldata);
    }

    // ─── Auth ──────────────────────────────────────────────
    private requireDeployer(caller: Address): void {
        if (!u256.eq(u256.fromUint8ArrayBE(caller), this._deployer.value)) {
            throw new Revert('Only deployer');
        }
    }

    // ─── Address ↔ u256 helpers ────────────────────────────
    // Store address as u256 (same pattern as utilisBTC)
    private addrToU256(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    // Recover Address from stored u256 (reverse of fromUint8ArrayBE)
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

    // ─── Listing storage helpers ───────────────────────────
    private listingPointer(listingId: u64, field: u16): u16 {
        return LISTING_BASE_POINTER + <u16>(listingId * <u64>SLOTS_PER_LISTING) + field;
    }

    private storeField(listingId: u64, field: u16, value: u256): void {
        const s = new StoredU256(this.listingPointer(listingId, field), EMPTY_POINTER);
        s.set(value);
    }

    private readField(listingId: u64, field: u16): u256 {
        const s = new StoredU256(this.listingPointer(listingId, field), EMPTY_POINTER);
        return s.value;
    }

    // ─── Cross-contract call helpers ───────────────────────

    // OP721: transferFrom(from, to, tokenId)
    // Requires seller has called setApprovalForAll(marketplace, true)
    private callNFTTransferFrom(
        nftContract: Address,
        from: Address,
        to: Address,
        tokenId: u256,
    ): void {
        // 4 (selector) + 32 (from) + 32 (to) + 32 (tokenId) = 100 bytes
        const cd = new BytesWriter(100);
        cd.writeSelector(SEL_TRANSFER_FROM);
        cd.writeAddress(from);
        cd.writeAddress(to);
        cd.writeU256(tokenId);
        Blockchain.call(nftContract, cd, true);
    }

    // OP20: transferFrom(from, to, amount)
    // Requires buyer has called approve(marketplace, amount)
    private callTokenTransferFrom(
        token: Address,
        from: Address,
        to: Address,
        amount: u256,
    ): void {
        // 4 + 32 + 32 + 32 = 100 bytes
        const cd = new BytesWriter(100);
        cd.writeSelector(SEL_TRANSFER_FROM);
        cd.writeAddress(from);
        cd.writeAddress(to);
        cd.writeU256(amount);
        Blockchain.call(token, cd, true);
    }

    // OP721: isApprovedForAll(owner, operator) → bool
    private callIsApprovedForAll(
        nftContract: Address,
        owner: Address,
        operator: Address,
    ): bool {
        // 4 + 32 + 32 = 68 bytes
        const cd = new BytesWriter(68);
        cd.writeSelector(SEL_IS_APPROVED_FOR_ALL);
        cd.writeAddress(owner);
        cd.writeAddress(operator);
        const result = Blockchain.call(nftContract, cd, true);
        if (result.data.byteLength < 1) return false;
        return result.data.readBoolean();
    }

    // ─── list ──────────────────────────────────────────────
    // Seller lists an NFT for sale. Seller must have already called
    // nftContract.setApprovalForAll(marketplace, true).
    //
    // royaltyRecipient: zero address if no royalty
    // royaltyBps: 0–1000 (max 10%)
    @method(
        { name: 'nftContract',      type: ABIDataTypes.ADDRESS },
        { name: 'tokenId',          type: ABIDataTypes.UINT256 },
        { name: 'price',            type: ABIDataTypes.UINT256 },
        { name: 'paymentToken',     type: ABIDataTypes.ADDRESS },
        { name: 'royaltyRecipient', type: ABIDataTypes.ADDRESS },
        { name: 'royaltyBps',       type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'listingId', type: ABIDataTypes.UINT256 })
    public list(calldata: Calldata): BytesWriter {
        const nftContract:      Address = calldata.readAddress();
        const tokenId:          u256    = calldata.readU256();
        const price:            u256    = calldata.readU256();
        const paymentToken:     Address = calldata.readAddress();
        const royaltyRecipient: Address = calldata.readAddress();
        const royaltyBps:       u256    = calldata.readU256();

        if (price.isZero()) throw new Revert('Price must be > 0');
        if (u256.gt(royaltyBps, MAX_ROYALTY_BPS)) throw new Revert('Royalty exceeds 10%');

        const seller: Address = Blockchain.tx.sender;

        // Verify marketplace is approved to move seller's NFTs
        const approved: bool = this.callIsApprovedForAll(
            nftContract,
            seller,
            Blockchain.contractAddress,
        );
        if (!approved) throw new Revert('Marketplace not approved: call setApprovalForAll first');

        // Assign listing ID
        const listingId: u64 = this._listingCounter.value.toU64();
        this._listingCounter.set(SafeMath.add(this._listingCounter.value, u256.One));

        // Store listing
        this.storeField(listingId, F_SELLER,            this.addrToU256(seller));
        this.storeField(listingId, F_NFT_CONTRACT,      this.addrToU256(nftContract));
        this.storeField(listingId, F_TOKEN_ID,          tokenId);
        this.storeField(listingId, F_PRICE,             price);
        this.storeField(listingId, F_PAYMENT_TOKEN,     this.addrToU256(paymentToken));
        this.storeField(listingId, F_ROYALTY_RECIPIENT, this.addrToU256(royaltyRecipient));
        this.storeField(listingId, F_ROYALTY_BPS,       royaltyBps);
        this.storeField(listingId, F_STATUS,            STATUS_ACTIVE);

        const writer = new BytesWriter(32);
        writer.writeU256(u256.fromU64(listingId));
        return writer;
    }

    // ─── buy ───────────────────────────────────────────────
    // Atomic NFT + OP20 swap.
    // Buyer must have approved marketplace for the full listing price before calling.
    //
    // Payment breakdown:
    //   platformFee    = price * platformFeeBps / 10000
    //   royaltyFee     = price * royaltyBps / 10000
    //   sellerProceeds = price - platformFee - royaltyFee
    //
    // All transferFrom calls use buyer as `from` so buyer needs one single
    // approve(marketplace, price) — marketplace pulls the exact amounts.
    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public buy(calldata: Calldata): BytesWriter {
        const listingIdU256: u256 = calldata.readU256();
        const listingId: u64 = listingIdU256.toU64();

        // Validate listing is active
        const status: u256 = this.readField(listingId, F_STATUS);
        if (!u256.eq(status, STATUS_ACTIVE)) throw new Revert('Listing not active');

        const buyer: Address = Blockchain.tx.sender;

        // Read listing data
        const sellerHash:            u256 = this.readField(listingId, F_SELLER);
        const nftContractHash:       u256 = this.readField(listingId, F_NFT_CONTRACT);
        const tokenId:               u256 = this.readField(listingId, F_TOKEN_ID);
        const price:                 u256 = this.readField(listingId, F_PRICE);
        const paymentTokenHash:      u256 = this.readField(listingId, F_PAYMENT_TOKEN);
        const royaltyRecipientHash:  u256 = this.readField(listingId, F_ROYALTY_RECIPIENT);
        const royaltyBps:            u256 = this.readField(listingId, F_ROYALTY_BPS);

        // Prevent self-buy
        if (u256.eq(this.addrToU256(buyer), sellerHash)) {
            throw new Revert('Cannot buy own listing');
        }

        // Reconstruct addresses
        const seller:           Address = this.u256ToAddr(sellerHash);
        const nftContract:      Address = this.u256ToAddr(nftContractHash);
        const paymentToken:     Address = this.u256ToAddr(paymentTokenHash);
        const royaltyRecipient: Address = this.u256ToAddr(royaltyRecipientHash);

        // Calculate fee split
        const platformFee: u256 = SafeMath.div(
            SafeMath.mul(price, this._platformFeeBps.value),
            BASIS_POINTS,
        );
        const royaltyFee: u256 = royaltyBps.isZero()
            ? u256.Zero
            : SafeMath.div(SafeMath.mul(price, royaltyBps), BASIS_POINTS);

        const sellerProceeds: u256 = SafeMath.sub(
            SafeMath.sub(price, platformFee),
            royaltyFee,
        );

        // ── Atomic swap ──────────────────────────────────────
        // Step 1: Transfer NFT from seller to buyer
        this.callNFTTransferFrom(nftContract, seller, buyer, tokenId);

        // Step 2: Transfer seller proceeds (buyer → seller)
        if (!sellerProceeds.isZero()) {
            this.callTokenTransferFrom(paymentToken, buyer, seller, sellerProceeds);
        }

        // Step 3: Transfer royalty (buyer → royaltyRecipient), if applicable
        if (!royaltyFee.isZero() && !royaltyRecipientHash.isZero()) {
            this.callTokenTransferFrom(paymentToken, buyer, royaltyRecipient, royaltyFee);
        }

        // Step 4: Collect platform fee (buyer → marketplace)
        if (!platformFee.isZero()) {
            this.callTokenTransferFrom(paymentToken, buyer, Blockchain.contractAddress, platformFee);
            this._platformFeeAccrued.set(
                SafeMath.add(this._platformFeeAccrued.value, platformFee),
            );
        }

        // Mark listing as sold
        this.storeField(listingId, F_STATUS, STATUS_SOLD);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── cancel ────────────────────────────────────────────
    // Seller removes their active listing (NFT stays in their wallet — non-custodial)
    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public cancel(calldata: Calldata): BytesWriter {
        const listingId: u64 = calldata.readU256().toU64();

        const status: u256 = this.readField(listingId, F_STATUS);
        if (!u256.eq(status, STATUS_ACTIVE)) throw new Revert('Listing not active');

        const sellerHash: u256 = this.readField(listingId, F_SELLER);
        if (!u256.eq(this.addrToU256(Blockchain.tx.sender), sellerHash)) {
            throw new Revert('Only seller can cancel');
        }

        this.storeField(listingId, F_STATUS, STATUS_CANCELLED);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── setFee (deployer only) ────────────────────────────
    @method({ name: 'feeBps', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setFee(calldata: Calldata): BytesWriter {
        this.requireDeployer(Blockchain.tx.sender);
        const feeBps: u256 = calldata.readU256();
        if (u256.gt(feeBps, MAX_FEE_BPS)) throw new Revert('Fee exceeds 10%');
        this._platformFeeBps.set(feeBps);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── withdrawFees (deployer only) ─────────────────────
    // Withdraw accumulated platform fees to a recipient address.
    // The marketplace holds OP20 tokens from platform fees. We call transfer
    // on the payment token — but fees can be in multiple tokens.
    // For MVP: deployer specifies which token to withdraw.
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

        // Call OP20.transfer(recipient, amount) from marketplace context
        // (marketplace is the sender in the OP20 call — it owns these tokens)
        const cd = new BytesWriter(68);
        cd.writeSelector(SEL_TRANSFER);
        cd.writeAddress(recipient);
        cd.writeU256(amount);
        Blockchain.call(token, cd, true);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── getListing ────────────────────────────────────────
    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'seller',            type: ABIDataTypes.UINT256 },
        { name: 'nftContract',       type: ABIDataTypes.UINT256 },
        { name: 'tokenId',           type: ABIDataTypes.UINT256 },
        { name: 'price',             type: ABIDataTypes.UINT256 },
        { name: 'paymentToken',      type: ABIDataTypes.UINT256 },
        { name: 'royaltyRecipient',  type: ABIDataTypes.UINT256 },
        { name: 'royaltyBps',        type: ABIDataTypes.UINT256 },
        { name: 'status',            type: ABIDataTypes.UINT256 },
    )
    @view
    public getListing(calldata: Calldata): BytesWriter {
        const listingId: u64 = calldata.readU256().toU64();

        const writer = new BytesWriter(256); // 8 × 32 bytes
        writer.writeU256(this.readField(listingId, F_SELLER));
        writer.writeU256(this.readField(listingId, F_NFT_CONTRACT));
        writer.writeU256(this.readField(listingId, F_TOKEN_ID));
        writer.writeU256(this.readField(listingId, F_PRICE));
        writer.writeU256(this.readField(listingId, F_PAYMENT_TOKEN));
        writer.writeU256(this.readField(listingId, F_ROYALTY_RECIPIENT));
        writer.writeU256(this.readField(listingId, F_ROYALTY_BPS));
        writer.writeU256(this.readField(listingId, F_STATUS));
        return writer;
    }

    // ─── getListingCount ───────────────────────────────────
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    @view
    public getListingCount(_: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._listingCounter.value);
        return writer;
    }

    // ─── getPlatformFee ────────────────────────────────────
    @method()
    @returns({ name: 'feeBps', type: ABIDataTypes.UINT256 })
    @view
    public getPlatformFee(_: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._platformFeeBps.value);
        return writer;
    }

    // ─── getAccruedFees ────────────────────────────────────
    @method()
    @returns({ name: 'accrued', type: ABIDataTypes.UINT256 })
    @view
    public getAccruedFees(_: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._platformFeeAccrued.value);
        return writer;
    }
}
