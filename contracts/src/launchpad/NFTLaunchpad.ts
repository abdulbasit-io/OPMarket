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
    StoredString,
    StoredU256,
    encodeSelector,
} from '@btc-vision/btc-runtime/runtime';
import { EMPTY_POINTER } from '@btc-vision/btc-runtime/runtime/math/bytes';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';

// ═══════════════════════════════════════════════════════════
// NFTLaunchpad — Ownerless NFT Launchpad (no external contract needed)
// ═══════════════════════════════════════════════════════════
//
// Collections are registered by creators directly on this contract.
// Ownership is tracked internally via StoredMapU256 using composite keys.
// Any Bitcoin-native asset (Ordinals, inscriptions, etc.) can be launched here.
//
// Creator flow:
//   1. Call launchpad.registerCollection(name, symbol, imageURI, maxSupply,
//          mintPrice, paymentToken, startBlock, endBlock, royaltyBps, maxPerWallet)
//   2. Receive collectionId in response
//   3. Users call launchpad.mint(collectionId, quantity) during mint window
//   4. After endBlock, creator calls launchpad.withdraw(collectionId) to collect proceeds
// ═══════════════════════════════════════════════════════════

// ─── Cross-contract selectors ──────────────────────────────
const SEL_TRANSFER_FROM: Selector = encodeSelector('transferFrom');
const SEL_TRANSFER: Selector      = encodeSelector('transfer');

// ─── Global storage pointers ───────────────────────────────
const deployerPtr:    u16 = Blockchain.nextPointer;
const marketplacePtr: u16 = Blockchain.nextPointer;
const collCounterPtr: u16 = Blockchain.nextPointer;

// ─── Per-collection map pointers ───────────────────────────
const collCreatorMapPtr:      u16 = Blockchain.nextPointer;
const collMintPriceMapPtr:    u16 = Blockchain.nextPointer;
const collPayTokenMapPtr:     u16 = Blockchain.nextPointer;
const collMaxSupplyMapPtr:    u16 = Blockchain.nextPointer;
const collMintedMapPtr:       u16 = Blockchain.nextPointer;
const collStartBlockMapPtr:   u16 = Blockchain.nextPointer;
const collEndBlockMapPtr:     u16 = Blockchain.nextPointer;
const collRoyaltyBpsMapPtr:   u16 = Blockchain.nextPointer;
const collMaxPerWalletMapPtr: u16 = Blockchain.nextPointer;
const collProceedsMapPtr:     u16 = Blockchain.nextPointer;
const collNextTokenIdMapPtr:  u16 = Blockchain.nextPointer;

// ─── Per-collection string pointers ────────────────────────
const collNameStrPtr:     u16 = Blockchain.nextPointer;
const collSymbolStrPtr:   u16 = Blockchain.nextPointer;
const collImageURIStrPtr: u16 = Blockchain.nextPointer;

// ─── Ownership & accounting map pointers ───────────────────
const ownershipMapPtr:   u16 = Blockchain.nextPointer;
const balanceMapPtr:     u16 = Blockchain.nextPointer;
const walletMintMapPtr:  u16 = Blockchain.nextPointer;

// ─── Constants ─────────────────────────────────────────────
const MAX_ROYALTY_BPS: u256 = u256.fromU64(1000); // 10% max

// ─── Composite key helper ───────────────────────────────────
function compositeKey(a: u256, b: u256): u256 {
    const buf = new Uint8Array(64);
    const aBytes = a.toUint8Array(true);
    const bBytes = b.toUint8Array(true);
    for (let i = 0; i < 32; i++) buf[i] = aBytes[i];
    for (let i = 0; i < 32; i++) buf[32 + i] = bBytes[i];
    return u256.fromUint8ArrayBE(sha256(buf));
}

@final
export class NFTLaunchpad extends OP_NET {
    // ─── Global state ────────────────────────────────────
    private readonly _deployer:    StoredU256;
    private readonly _marketplace: StoredU256;
    private readonly _collCounter: StoredU256;

    // ─── Per-collection numeric maps ─────────────────────
    private readonly _collCreatorMap:      StoredMapU256;
    private readonly _collMintPriceMap:    StoredMapU256;
    private readonly _collPayTokenMap:     StoredMapU256;
    private readonly _collMaxSupplyMap:    StoredMapU256;
    private readonly _collMintedMap:       StoredMapU256;
    private readonly _collStartBlockMap:   StoredMapU256;
    private readonly _collEndBlockMap:     StoredMapU256;
    private readonly _collRoyaltyBpsMap:   StoredMapU256;
    private readonly _collMaxPerWalletMap: StoredMapU256;
    private readonly _collProceedsMap:     StoredMapU256;
    private readonly _collNextTokenIdMap:  StoredMapU256;

    // ─── Ownership & accounting maps ─────────────────────
    private readonly _ownershipMap:  StoredMapU256;
    private readonly _balanceMap:    StoredMapU256;
    private readonly _walletMintMap: StoredMapU256;

    public constructor() {
        super();
        this._deployer    = new StoredU256(deployerPtr, EMPTY_POINTER);
        this._marketplace = new StoredU256(marketplacePtr, EMPTY_POINTER);
        this._collCounter = new StoredU256(collCounterPtr, EMPTY_POINTER);

        this._collCreatorMap      = new StoredMapU256(collCreatorMapPtr);
        this._collMintPriceMap    = new StoredMapU256(collMintPriceMapPtr);
        this._collPayTokenMap     = new StoredMapU256(collPayTokenMapPtr);
        this._collMaxSupplyMap    = new StoredMapU256(collMaxSupplyMapPtr);
        this._collMintedMap       = new StoredMapU256(collMintedMapPtr);
        this._collStartBlockMap   = new StoredMapU256(collStartBlockMapPtr);
        this._collEndBlockMap     = new StoredMapU256(collEndBlockMapPtr);
        this._collRoyaltyBpsMap   = new StoredMapU256(collRoyaltyBpsMapPtr);
        this._collMaxPerWalletMap = new StoredMapU256(collMaxPerWalletMapPtr);
        this._collProceedsMap     = new StoredMapU256(collProceedsMapPtr);
        this._collNextTokenIdMap  = new StoredMapU256(collNextTokenIdMapPtr);

        this._ownershipMap  = new StoredMapU256(ownershipMapPtr);
        this._balanceMap    = new StoredMapU256(balanceMapPtr);
        this._walletMintMap = new StoredMapU256(walletMintMapPtr);
    }

    // ─── Deployment ────────────────────────────────────────
    // No calldata required. Link the marketplace after deployment via setMarketplace().
    public override onDeployment(_calldata: Calldata): void {
        this._deployer.set(u256.fromUint8ArrayBE(Blockchain.tx.origin));
    }

    public override onUpdate(_calldata: Calldata): void {
        super.onUpdate(_calldata);
    }

    // ─── Auth ───────────────────────────────────────────────
    private requireDeployer(caller: Address): void {
        if (!u256.eq(u256.fromUint8ArrayBE(caller), this._deployer.value)) {
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

    private callTransferFrom(token: Address, from: Address, to: Address, amount: u256): void {
        const cd = new BytesWriter(100);
        cd.writeSelector(SEL_TRANSFER_FROM);
        cd.writeAddress(from);
        cd.writeAddress(to);
        cd.writeU256(amount);
        Blockchain.call(token, cd, true);
    }

    private callTransfer(token: Address, to: Address, amount: u256): void {
        const cd = new BytesWriter(68);
        cd.writeSelector(SEL_TRANSFER);
        cd.writeAddress(to);
        cd.writeU256(amount);
        Blockchain.call(token, cd, true);
    }

    // ─── registerCollection ─────────────────────────────────
    @method(
        { name: 'name',         type: ABIDataTypes.STRING  },
        { name: 'symbol',       type: ABIDataTypes.STRING  },
        { name: 'imageURI',     type: ABIDataTypes.STRING  },
        { name: 'maxSupply',    type: ABIDataTypes.UINT256 },
        { name: 'mintPrice',    type: ABIDataTypes.UINT256 },
        { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
        { name: 'startBlock',   type: ABIDataTypes.UINT256 },
        { name: 'endBlock',     type: ABIDataTypes.UINT256 },
        { name: 'royaltyBps',   type: ABIDataTypes.UINT256 },
        { name: 'maxPerWallet', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'collectionId', type: ABIDataTypes.UINT256 })
    public registerCollection(calldata: Calldata): BytesWriter {
        const name:         string  = calldata.readStringWithLength();
        const symbol:       string  = calldata.readStringWithLength();
        const imageURI:     string  = calldata.readStringWithLength();
        const maxSupply:    u256    = calldata.readU256();
        const mintPrice:    u256    = calldata.readU256();
        const paymentToken: Address = calldata.readAddress();
        const startBlock:   u256    = calldata.readU256();
        const endBlock:     u256    = calldata.readU256();
        const royaltyBps:   u256    = calldata.readU256();
        const maxPerWallet: u256    = calldata.readU256();

        if (name.length === 0)                        throw new Revert('Name required');
        if (symbol.length === 0)                      throw new Revert('Symbol required');
        if (maxSupply.isZero())                        throw new Revert('maxSupply must be > 0');
        if (!u256.lt(startBlock, endBlock))            throw new Revert('startBlock must be < endBlock');
        if (u256.gt(royaltyBps, MAX_ROYALTY_BPS))     throw new Revert('Royalty exceeds 10%');

        const caller: Address = Blockchain.tx.sender;
        const callerHash: u256 = this.addrToU256(caller);

        // Assign collection ID from counter
        const collId: u256 = this._collCounter.value;

        // Store all collection data
        this._collCreatorMap.set(collId, callerHash);
        this._collMintPriceMap.set(collId, mintPrice);
        this._collPayTokenMap.set(collId, this.addrToU256(paymentToken));
        this._collMaxSupplyMap.set(collId, maxSupply);
        this._collMintedMap.set(collId, u256.Zero);
        this._collStartBlockMap.set(collId, startBlock);
        this._collEndBlockMap.set(collId, endBlock);
        this._collRoyaltyBpsMap.set(collId, royaltyBps);
        this._collMaxPerWalletMap.set(collId, maxPerWallet);
        this._collProceedsMap.set(collId, u256.Zero);
        this._collNextTokenIdMap.set(collId, u256.Zero);

        // Store string metadata per collection using index = collId.lo1
        const idx: u64 = collId.lo1;
        const nameStore = new StoredString(collNameStrPtr, idx);
        nameStore.value = name;
        const symbolStore = new StoredString(collSymbolStrPtr, idx);
        symbolStore.value = symbol;
        const imageStore = new StoredString(collImageURIStrPtr, idx);
        imageStore.value = imageURI;

        // Increment counter
        this._collCounter.set(SafeMath.add(collId, u256.One));

        const writer = new BytesWriter(32);
        writer.writeU256(collId);
        return writer;
    }

    // ─── mint ───────────────────────────────────────────────
    @method(
        { name: 'collectionId', type: ABIDataTypes.UINT256 },
        { name: 'quantity',     type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'firstTokenId', type: ABIDataTypes.UINT256 })
    @emit('Transferred')
    public mint(calldata: Calldata): BytesWriter {
        const collId:   u256 = calldata.readU256();
        const quantity: u256 = calldata.readU256();

        if (quantity.isZero()) throw new Revert('Quantity must be > 0');

        // Validate collection is registered
        const creatorHash: u256 = this._collCreatorMap.get(collId);
        if (creatorHash.isZero()) throw new Revert('Collection not registered');

        // Validate mint window
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const startBlock:   u256 = this._collStartBlockMap.get(collId);
        const endBlock:     u256 = this._collEndBlockMap.get(collId);
        if (u256.lt(currentBlock, startBlock)) throw new Revert('Mint has not started');
        if (!u256.lt(currentBlock, endBlock))  throw new Revert('Mint window has closed');

        // Validate supply cap
        const maxSupply: u256 = this._collMaxSupplyMap.get(collId);
        const minted:    u256 = this._collMintedMap.get(collId);
        if (u256.gt(SafeMath.add(minted, quantity), maxSupply)) {
            throw new Revert('Exceeds max supply');
        }

        const buyer:     Address = Blockchain.tx.sender;
        const buyerHash: u256    = this.addrToU256(buyer);

        // Validate per-wallet limit
        const maxPerWallet: u256 = this._collMaxPerWalletMap.get(collId);
        if (!maxPerWallet.isZero()) {
            const walletKey:    u256 = compositeKey(collId, buyerHash);
            const walletMinted: u256 = this._walletMintMap.get(walletKey);
            if (u256.gt(SafeMath.add(walletMinted, quantity), maxPerWallet)) {
                throw new Revert('Exceeds per-wallet mint limit');
            }
        }

        // Collect payment
        const mintPrice:  u256 = this._collMintPriceMap.get(collId);
        const totalCost:  u256 = SafeMath.mul(mintPrice, quantity);
        if (!totalCost.isZero()) {
            const paymentToken: Address = this.u256ToAddr(this._collPayTokenMap.get(collId));
            this.callTransferFrom(paymentToken, buyer, Blockchain.contractAddress, totalCost);
        }

        // Mint tokens — record ownership for each
        const nextTokenId: u256 = this._collNextTokenIdMap.get(collId);
        const firstTokenId: u256 = nextTokenId;

        let i: u256 = u256.Zero;
        while (u256.lt(i, quantity)) {
            const tokenId: u256 = SafeMath.add(nextTokenId, i);
            const ownerKey: u256 = compositeKey(collId, tokenId);
            this._ownershipMap.set(ownerKey, buyerHash);
            i = SafeMath.add(i, u256.One);
        }

        // Update balance
        const balKey:     u256 = compositeKey(collId, buyerHash);
        const oldBalance: u256 = this._balanceMap.get(balKey);
        this._balanceMap.set(balKey, SafeMath.add(oldBalance, quantity));

        // Update wallet mint count if limited
        if (!maxPerWallet.isZero()) {
            const walletKey:    u256 = compositeKey(collId, buyerHash);
            const walletMinted: u256 = this._walletMintMap.get(walletKey);
            this._walletMintMap.set(walletKey, SafeMath.add(walletMinted, quantity));
        }

        // Update minted count and nextTokenId
        this._collMintedMap.set(collId, SafeMath.add(minted, quantity));
        this._collNextTokenIdMap.set(collId, SafeMath.add(nextTokenId, quantity));

        // Update proceeds
        if (!totalCost.isZero()) {
            const proceeds: u256 = this._collProceedsMap.get(collId);
            this._collProceedsMap.set(collId, SafeMath.add(proceeds, totalCost));
        }

        const writer = new BytesWriter(32);
        writer.writeU256(firstTokenId);
        return writer;
    }

    // ─── withdraw ───────────────────────────────────────────
    @method({ name: 'collectionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public withdraw(calldata: Calldata): BytesWriter {
        const collId: u256 = calldata.readU256();

        const creatorHash: u256 = this._collCreatorMap.get(collId);
        if (creatorHash.isZero()) throw new Revert('Collection not registered');

        if (!u256.eq(this.addrToU256(Blockchain.tx.sender), creatorHash)) {
            throw new Revert('Only creator can withdraw');
        }

        const proceeds: u256 = this._collProceedsMap.get(collId);
        if (proceeds.isZero()) throw new Revert('No proceeds to withdraw');

        const paymentToken: Address = this.u256ToAddr(this._collPayTokenMap.get(collId));
        const creator:      Address = this.u256ToAddr(creatorHash);

        // Zero proceeds before transfer (reentrancy guard)
        this._collProceedsMap.set(collId, u256.Zero);
        this.callTransfer(paymentToken, creator, proceeds);

        const writer = new BytesWriter(32);
        writer.writeU256(proceeds);
        return writer;
    }

    // ─── marketplaceTransfer ────────────────────────────────
    // Called exclusively by the registered marketplace contract to execute
    // secondary-market transfers. Verifies current ownership of the token.
    @method(
        { name: 'collectionId', type: ABIDataTypes.UINT256 },
        { name: 'tokenId',      type: ABIDataTypes.UINT256 },
        { name: 'from',         type: ABIDataTypes.ADDRESS },
        { name: 'to',           type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public marketplaceTransfer(calldata: Calldata): BytesWriter {
        const collId:  u256    = calldata.readU256();
        const tokenId: u256    = calldata.readU256();
        const from:    Address = calldata.readAddress();
        const to:      Address = calldata.readAddress();

        // Only the registered marketplace may call this
        const callerHash: u256 = this.addrToU256(Blockchain.tx.sender);
        if (!u256.eq(callerHash, this._marketplace.value)) {
            throw new Revert('Only marketplace');
        }

        const fromHash: u256 = this.addrToU256(from);
        const toHash:   u256 = this.addrToU256(to);

        // Verify current ownership
        const ownerKey:    u256 = compositeKey(collId, tokenId);
        const currentOwner: u256 = this._ownershipMap.get(ownerKey);
        if (!u256.eq(currentOwner, fromHash)) {
            throw new Revert('Not token owner');
        }

        // Transfer ownership
        this._ownershipMap.set(ownerKey, toHash);

        // Update sender balance (subtract 1)
        const fromBalKey: u256 = compositeKey(collId, fromHash);
        const fromBal:    u256 = this._balanceMap.get(fromBalKey);
        if (fromBal.isZero()) throw new Revert('Balance underflow');
        this._balanceMap.set(fromBalKey, SafeMath.sub(fromBal, u256.One));

        // Update receiver balance (add 1)
        const toBalKey: u256 = compositeKey(collId, toHash);
        const toBal:    u256 = this._balanceMap.get(toBalKey);
        this._balanceMap.set(toBalKey, SafeMath.add(toBal, u256.One));

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── ownerOf ────────────────────────────────────────────
    @method(
        { name: 'collectionId', type: ABIDataTypes.UINT256 },
        { name: 'tokenId',      type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'owner', type: ABIDataTypes.UINT256 })
    @view
    public ownerOf(calldata: Calldata): BytesWriter {
        const collId:  u256 = calldata.readU256();
        const tokenId: u256 = calldata.readU256();

        const ownerKey: u256 = compositeKey(collId, tokenId);
        const owner:    u256 = this._ownershipMap.get(ownerKey);

        const writer = new BytesWriter(32);
        writer.writeU256(owner);
        return writer;
    }

    // ─── balanceOf ──────────────────────────────────────────
    @method(
        { name: 'collectionId', type: ABIDataTypes.UINT256 },
        { name: 'owner',        type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'balance', type: ABIDataTypes.UINT256 })
    @view
    public balanceOf(calldata: Calldata): BytesWriter {
        const collId:    u256    = calldata.readU256();
        const ownerAddr: Address = calldata.readAddress();

        const ownerHash: u256 = this.addrToU256(ownerAddr);
        const balKey:    u256 = compositeKey(collId, ownerHash);
        const balance:   u256 = this._balanceMap.get(balKey);

        const writer = new BytesWriter(32);
        writer.writeU256(balance);
        return writer;
    }

    // ─── getCollection ──────────────────────────────────────
    @method({ name: 'collectionId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'creator',       type: ABIDataTypes.UINT256 },
        { name: 'mintPrice',     type: ABIDataTypes.UINT256 },
        { name: 'paymentToken',  type: ABIDataTypes.UINT256 },
        { name: 'maxSupply',     type: ABIDataTypes.UINT256 },
        { name: 'minted',        type: ABIDataTypes.UINT256 },
        { name: 'startBlock',    type: ABIDataTypes.UINT256 },
        { name: 'endBlock',      type: ABIDataTypes.UINT256 },
        { name: 'royaltyBps',    type: ABIDataTypes.UINT256 },
        { name: 'maxPerWallet',  type: ABIDataTypes.UINT256 },
        { name: 'proceeds',      type: ABIDataTypes.UINT256 },
    )
    @view
    public getCollection(calldata: Calldata): BytesWriter {
        const collId: u256 = calldata.readU256();

        const writer = new BytesWriter(320); // 10 × 32 bytes
        writer.writeU256(this._collCreatorMap.get(collId));
        writer.writeU256(this._collMintPriceMap.get(collId));
        writer.writeU256(this._collPayTokenMap.get(collId));
        writer.writeU256(this._collMaxSupplyMap.get(collId));
        writer.writeU256(this._collMintedMap.get(collId));
        writer.writeU256(this._collStartBlockMap.get(collId));
        writer.writeU256(this._collEndBlockMap.get(collId));
        writer.writeU256(this._collRoyaltyBpsMap.get(collId));
        writer.writeU256(this._collMaxPerWalletMap.get(collId));
        writer.writeU256(this._collProceedsMap.get(collId));
        return writer;
    }

    // ─── getCollectionCount ─────────────────────────────────
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    @view
    public getCollectionCount(_: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._collCounter.value);
        return writer;
    }

    // ─── getCollectionStrings ────────────────────────────────
    // Returns name, symbol, and imageURI for a collection.
    @method({ name: 'collectionId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'name',     type: ABIDataTypes.STRING },
        { name: 'symbol',   type: ABIDataTypes.STRING },
        { name: 'imageURI', type: ABIDataTypes.STRING },
    )
    @view
    public getCollectionStrings(calldata: Calldata): BytesWriter {
        const collId: u256 = calldata.readU256();
        const idx: u64 = collId.lo1;

        const name:     string = new StoredString(collNameStrPtr, idx).value;
        const symbol:   string = new StoredString(collSymbolStrPtr, idx).value;
        const imageURI: string = new StoredString(collImageURIStrPtr, idx).value;

        const writer = new BytesWriter(name.length + symbol.length + imageURI.length + 24);
        writer.writeStringWithLength(name);
        writer.writeStringWithLength(symbol);
        writer.writeStringWithLength(imageURI);
        return writer;
    }

    // ─── setMarketplace ─────────────────────────────────────
    @method({ name: 'marketplace', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setMarketplace(calldata: Calldata): BytesWriter {
        this.requireDeployer(Blockchain.tx.sender);
        const marketplace: Address = calldata.readAddress();
        this._marketplace.set(this.addrToU256(marketplace));

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }
}
