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
// NFTLaunchpad — OP721 Collection Registration & Mint Coordination
// ═══════════════════════════════════════════════════════════
//
// Creator flow:
//   1. Deploy BaseNFT.ts (standard OP721 template)
//   2. Call launchpad.register(nftContract, mintPrice, paymentToken,
//                              maxSupply, startBlock, endBlock, royaltyBps, maxPerWallet)
//   3. Call nftContract.setMinter(launchpadAddress)
//   4. Mint window opens at startBlock — users call launchpad.mint(nftContract, quantity)
//   5. After endBlock — creator calls launchpad.withdraw(nftContract) to collect proceeds
//
// Payment: OP20 tokens pulled from buyer via transferFrom.
// Launchpad must have MINTER_ROLE on the NFT contract (set via setMinter).
// ═══════════════════════════════════════════════════════════

// ─── Cross-contract selectors ──────────────────────────────
const SEL_MINT_TO:       Selector = encodeSelector('mintTo');
const SEL_TRANSFER_FROM: Selector = encodeSelector('transferFrom');
const SEL_TRANSFER:      Selector = encodeSelector('transfer');

// ─── Global storage pointers ───────────────────────────────
const deployerPointer: u16 = Blockchain.nextPointer;

// ─── Collection storage layout ─────────────────────────────
// Keyed by lower 12 bits of the NFT contract address hash → 4096 buckets.
// 10 fields per collection → max pointer: 100 + 4095*10 + 9 = 41 059 (fits in u16).
//
// NOTE: Two different NFT contracts whose address hashes share the same lower
//       12 bits will collide into the same storage slot. For MVP testnet usage
//       the probability is negligible (1/4096 per pair). An on-chain existence
//       check (creator != 0) prevents silent overwrites.
const COLLECTION_BASE:      u16 = 100;
const SLOTS_PER_COLLECTION: u16 = 10;

// Field offsets within a collection's storage block
const F_CREATOR:        u16 = 0; // u256 hash of creator address
const F_PAYMENT_TOKEN:  u16 = 1; // u256 hash of OP20 payment token
const F_MINT_PRICE:     u16 = 2; // mint price per NFT (raw token units)
const F_MAX_SUPPLY:     u16 = 3; // max NFTs this collection can mint
const F_MINTED:         u16 = 4; // total minted so far
const F_START_BLOCK:    u16 = 5; // mint window opens at this block (u64 stored as u256)
const F_END_BLOCK:      u16 = 6; // mint window closes at this block (u64 stored as u256)
const F_ROYALTY_BPS:    u16 = 7; // royalty in basis points (0–1000)
const F_PROCEEDS:       u16 = 8; // accumulated OP20 proceeds held in escrow
const F_MAX_PER_WALLET: u16 = 9; // max mints per wallet (0 = unlimited)

// ─── Per-wallet mint count storage ─────────────────────────
// Key: lower 13 bits of (nftContractHash.lo1 XOR walletHash.lo1) → 8192 buckets.
// Max pointer: 42 000 + 8 191 = 50 191 (fits in u16).
const WALLET_MINT_BASE: u16 = 42000;

// ─── Constants ─────────────────────────────────────────────
const MAX_ROYALTY_BPS: u256 = u256.fromU64(1000); // 10% max

@final
export class NFTLaunchpad extends OP_NET {
    private readonly _deployer: StoredU256;

    public constructor() {
        super();
        this._deployer = new StoredU256(deployerPointer, EMPTY_POINTER);
    }

    public override onDeployment(_calldata: Calldata): void {
        this._deployer.set(u256.fromUint8ArrayBE(Blockchain.tx.origin));
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

    // ─── Address helpers ───────────────────────────────────
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

    // ─── Collection storage helpers ────────────────────────
    private collectionPointer(nftHash: u256, field: u16): u16 {
        const slot: u16 = <u16>(nftHash.lo1 & 0xFFF);
        return COLLECTION_BASE + slot * SLOTS_PER_COLLECTION + field;
    }

    private storeCollField(nftHash: u256, field: u16, value: u256): void {
        new StoredU256(this.collectionPointer(nftHash, field), EMPTY_POINTER).set(value);
    }

    private readCollField(nftHash: u256, field: u16): u256 {
        return new StoredU256(this.collectionPointer(nftHash, field), EMPTY_POINTER).value;
    }

    // ─── Per-wallet mint count helpers ─────────────────────
    private walletMintPointer(nftHash: u256, walletHash: u256): u16 {
        const combined: u16 = <u16>((nftHash.lo1 ^ walletHash.lo1) & 0x1FFF);
        return WALLET_MINT_BASE + combined;
    }

    private getWalletMintedCount(nftHash: u256, walletHash: u256): u256 {
        return new StoredU256(this.walletMintPointer(nftHash, walletHash), EMPTY_POINTER).value;
    }

    private incrementWalletMinted(nftHash: u256, walletHash: u256, qty: u256): void {
        const s = new StoredU256(this.walletMintPointer(nftHash, walletHash), EMPTY_POINTER);
        s.set(SafeMath.add(s.value, qty));
    }

    // ─── Cross-contract calls ──────────────────────────────

    // BaseNFT.mintTo(to, quantity) → firstTokenId
    // Launchpad must be set as minter via nftContract.setMinter(launchpadAddress)
    private callMintTo(nftContract: Address, to: Address, quantity: u256): u256 {
        // 4 (selector) + 32 (to) + 32 (quantity) = 68 bytes
        const cd = new BytesWriter(68);
        cd.writeSelector(SEL_MINT_TO);
        cd.writeAddress(to);
        cd.writeU256(quantity);
        const result = Blockchain.call(nftContract, cd, true);
        if (result.data.byteLength < 32) return u256.Zero;
        return result.data.readU256();
    }

    // OP20.transferFrom(from, to, amount)
    private callTransferFrom(token: Address, from: Address, to: Address, amount: u256): void {
        // 4 + 32 + 32 + 32 = 100 bytes
        const cd = new BytesWriter(100);
        cd.writeSelector(SEL_TRANSFER_FROM);
        cd.writeAddress(from);
        cd.writeAddress(to);
        cd.writeU256(amount);
        Blockchain.call(token, cd, true);
    }

    // OP20.transfer(to, amount) — called from launchpad as sender (holds the proceeds)
    private callTransfer(token: Address, to: Address, amount: u256): void {
        // 4 + 32 + 32 = 68 bytes
        const cd = new BytesWriter(68);
        cd.writeSelector(SEL_TRANSFER);
        cd.writeAddress(to);
        cd.writeU256(amount);
        Blockchain.call(token, cd, true);
    }

    // ─── register ──────────────────────────────────────────
    // Creator registers a BaseNFT collection with the launchpad.
    // Must call nftContract.setMinter(launchpadAddress) after this.
    //
    // startBlock: first block where minting is allowed
    // endBlock:   first block where minting is no longer allowed
    // maxPerWallet: 0 = unlimited
    @method(
        { name: 'nftContract',  type: ABIDataTypes.ADDRESS },
        { name: 'mintPrice',    type: ABIDataTypes.UINT256 },
        { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
        { name: 'maxSupply',    type: ABIDataTypes.UINT256 },
        { name: 'startBlock',   type: ABIDataTypes.UINT256 },
        { name: 'endBlock',     type: ABIDataTypes.UINT256 },
        { name: 'royaltyBps',   type: ABIDataTypes.UINT256 },
        { name: 'maxPerWallet', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public register(calldata: Calldata): BytesWriter {
        const nftContract:  Address = calldata.readAddress();
        const mintPrice:    u256    = calldata.readU256();
        const paymentToken: Address = calldata.readAddress();
        const maxSupply:    u256    = calldata.readU256();
        const startBlock:   u256    = calldata.readU256();
        const endBlock:     u256    = calldata.readU256();
        const royaltyBps:   u256    = calldata.readU256();
        const maxPerWallet: u256    = calldata.readU256();

        if (maxSupply.isZero())                        throw new Revert('maxSupply must be > 0');
        if (u256.gt(royaltyBps, MAX_ROYALTY_BPS))      throw new Revert('Royalty exceeds 10%');
        if (!u256.lt(startBlock, endBlock))            throw new Revert('startBlock must be < endBlock');

        const nftHash: u256 = this.addrToU256(nftContract);

        // Prevent re-registration: creator slot non-zero means already registered
        if (!this.readCollField(nftHash, F_CREATOR).isZero()) {
            throw new Revert('Collection already registered');
        }

        this.storeCollField(nftHash, F_CREATOR,        this.addrToU256(Blockchain.tx.sender));
        this.storeCollField(nftHash, F_PAYMENT_TOKEN,  this.addrToU256(paymentToken));
        this.storeCollField(nftHash, F_MINT_PRICE,     mintPrice);
        this.storeCollField(nftHash, F_MAX_SUPPLY,     maxSupply);
        this.storeCollField(nftHash, F_MINTED,         u256.Zero);
        this.storeCollField(nftHash, F_START_BLOCK,    startBlock);
        this.storeCollField(nftHash, F_END_BLOCK,      endBlock);
        this.storeCollField(nftHash, F_ROYALTY_BPS,    royaltyBps);
        this.storeCollField(nftHash, F_PROCEEDS,       u256.Zero);
        this.storeCollField(nftHash, F_MAX_PER_WALLET, maxPerWallet);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── mint ──────────────────────────────────────────────
    // User mints `quantity` NFTs from a registered collection.
    // Buyer must have approved launchpad to spend their payment tokens:
    //   paymentToken.approve(launchpadAddress, mintPrice * quantity)
    //
    // Returns the firstTokenId minted (forwarded from BaseNFT.mintTo).
    @method(
        { name: 'nftContract', type: ABIDataTypes.ADDRESS },
        { name: 'quantity',    type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'firstTokenId', type: ABIDataTypes.UINT256 })
    public mint(calldata: Calldata): BytesWriter {
        const nftContract: Address = calldata.readAddress();
        const quantity:    u256    = calldata.readU256();

        if (quantity.isZero()) throw new Revert('Quantity must be > 0');

        const nftHash: u256 = this.addrToU256(nftContract);

        const creatorHash: u256 = this.readCollField(nftHash, F_CREATOR);
        if (creatorHash.isZero()) throw new Revert('Collection not registered');

        // ── Validate mint window ────────────────────────────
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const startBlock:   u256 = this.readCollField(nftHash, F_START_BLOCK);
        const endBlock:     u256 = this.readCollField(nftHash, F_END_BLOCK);

        if (u256.lt(currentBlock, startBlock)) throw new Revert('Mint has not started');
        if (!u256.lt(currentBlock, endBlock))  throw new Revert('Mint window has closed');

        // ── Validate supply cap ─────────────────────────────
        const maxSupply:  u256 = this.readCollField(nftHash, F_MAX_SUPPLY);
        const minted:     u256 = this.readCollField(nftHash, F_MINTED);

        if (u256.gt(SafeMath.add(minted, quantity), maxSupply)) {
            throw new Revert('Exceeds max supply');
        }

        // ── Validate per-wallet limit ───────────────────────
        const buyer:      Address = Blockchain.tx.sender;
        const buyerHash:  u256    = this.addrToU256(buyer);
        const maxPerWallet: u256  = this.readCollField(nftHash, F_MAX_PER_WALLET);

        if (!maxPerWallet.isZero()) {
            const walletMinted: u256 = this.getWalletMintedCount(nftHash, buyerHash);
            if (u256.gt(SafeMath.add(walletMinted, quantity), maxPerWallet)) {
                throw new Revert('Exceeds per-wallet mint limit');
            }
        }

        // ── Collect payment ─────────────────────────────────
        const mintPrice: u256 = this.readCollField(nftHash, F_MINT_PRICE);
        const totalCost: u256 = SafeMath.mul(mintPrice, quantity);

        if (!totalCost.isZero()) {
            const paymentToken: Address = this.u256ToAddr(this.readCollField(nftHash, F_PAYMENT_TOKEN));
            // Pull payment from buyer into launchpad escrow
            this.callTransferFrom(paymentToken, buyer, Blockchain.contractAddress, totalCost);
        }

        // ── Mint NFTs ───────────────────────────────────────
        const firstTokenId: u256 = this.callMintTo(nftContract, buyer, quantity);

        // ── Update state ────────────────────────────────────
        this.storeCollField(nftHash, F_MINTED, SafeMath.add(minted, quantity));

        if (!totalCost.isZero()) {
            const proceeds: u256 = this.readCollField(nftHash, F_PROCEEDS);
            this.storeCollField(nftHash, F_PROCEEDS, SafeMath.add(proceeds, totalCost));
        }

        if (!maxPerWallet.isZero()) {
            this.incrementWalletMinted(nftHash, buyerHash, quantity);
        }

        const writer = new BytesWriter(32);
        writer.writeU256(firstTokenId);
        return writer;
    }

    // ─── withdraw ──────────────────────────────────────────
    // Creator withdraws accumulated OP20 proceeds after the mint ends.
    // Can be called any time after the mint window closes (endBlock passed).
    // Proceeds are zeroed before the transfer to prevent reentrancy.
    @method({ name: 'nftContract', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public withdraw(calldata: Calldata): BytesWriter {
        const nftContract: Address = calldata.readAddress();
        const nftHash:     u256    = this.addrToU256(nftContract);

        const creatorHash: u256 = this.readCollField(nftHash, F_CREATOR);
        if (creatorHash.isZero()) throw new Revert('Collection not registered');

        if (!u256.eq(this.addrToU256(Blockchain.tx.sender), creatorHash)) {
            throw new Revert('Only creator can withdraw');
        }

        const proceeds: u256 = this.readCollField(nftHash, F_PROCEEDS);
        if (proceeds.isZero()) throw new Revert('No proceeds to withdraw');

        const paymentToken: Address = this.u256ToAddr(this.readCollField(nftHash, F_PAYMENT_TOKEN));
        const creator:      Address = this.u256ToAddr(creatorHash);

        // Zero proceeds before transfer (reentrancy guard)
        this.storeCollField(nftHash, F_PROCEEDS, u256.Zero);

        this.callTransfer(paymentToken, creator, proceeds);

        const writer = new BytesWriter(32);
        writer.writeU256(proceeds);
        return writer;
    }

    // ─── getCollection ─────────────────────────────────────
    @method({ name: 'nftContract', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'creator',       type: ABIDataTypes.UINT256 },
        { name: 'paymentToken',  type: ABIDataTypes.UINT256 },
        { name: 'mintPrice',     type: ABIDataTypes.UINT256 },
        { name: 'maxSupply',     type: ABIDataTypes.UINT256 },
        { name: 'minted',        type: ABIDataTypes.UINT256 },
        { name: 'startBlock',    type: ABIDataTypes.UINT256 },
        { name: 'endBlock',      type: ABIDataTypes.UINT256 },
        { name: 'royaltyBps',    type: ABIDataTypes.UINT256 },
        { name: 'proceeds',      type: ABIDataTypes.UINT256 },
        { name: 'maxPerWallet',  type: ABIDataTypes.UINT256 },
    )
    @view
    public getCollection(calldata: Calldata): BytesWriter {
        const nftHash: u256 = this.addrToU256(calldata.readAddress());

        const writer = new BytesWriter(320); // 10 × 32 bytes
        writer.writeU256(this.readCollField(nftHash, F_CREATOR));
        writer.writeU256(this.readCollField(nftHash, F_PAYMENT_TOKEN));
        writer.writeU256(this.readCollField(nftHash, F_MINT_PRICE));
        writer.writeU256(this.readCollField(nftHash, F_MAX_SUPPLY));
        writer.writeU256(this.readCollField(nftHash, F_MINTED));
        writer.writeU256(this.readCollField(nftHash, F_START_BLOCK));
        writer.writeU256(this.readCollField(nftHash, F_END_BLOCK));
        writer.writeU256(this.readCollField(nftHash, F_ROYALTY_BPS));
        writer.writeU256(this.readCollField(nftHash, F_PROCEEDS));
        writer.writeU256(this.readCollField(nftHash, F_MAX_PER_WALLET));
        return writer;
    }

    // ─── getMinted ─────────────────────────────────────────
    @method({ name: 'nftContract', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'minted', type: ABIDataTypes.UINT256 })
    @view
    public getMinted(calldata: Calldata): BytesWriter {
        const nftHash: u256 = this.addrToU256(calldata.readAddress());
        const writer = new BytesWriter(32);
        writer.writeU256(this.readCollField(nftHash, F_MINTED));
        return writer;
    }

    // ─── getWalletMintCount ────────────────────────────────
    // Returns how many NFTs `wallet` has minted from `nftContract` via this launchpad.
    @method(
        { name: 'nftContract', type: ABIDataTypes.ADDRESS },
        { name: 'wallet',      type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'minted', type: ABIDataTypes.UINT256 })
    @view
    public getWalletMintCount(calldata: Calldata): BytesWriter {
        const nftHash:    u256 = this.addrToU256(calldata.readAddress());
        const walletHash: u256 = this.addrToU256(calldata.readAddress());
        const writer = new BytesWriter(32);
        writer.writeU256(this.getWalletMintedCount(nftHash, walletHash));
        return writer;
    }
}
