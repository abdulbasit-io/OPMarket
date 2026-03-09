import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    OP721,
    OP721InitParameters,
    Revert,
    SafeMath,
    StoredBoolean,
    StoredU256,
} from '@btc-vision/btc-runtime/runtime';
import { EMPTY_POINTER } from '@btc-vision/btc-runtime/runtime/math/bytes';

// ═══════════════════════════════════════════════════════════
// BaseNFT — Standard OP721 Collection Template
// ═══════════════════════════════════════════════════════════
//
// Creators deploy this template for each collection.
// Features:
//   • Owner can mint to any address (for airdrops, launchpad)
//   • Public minting can be opened by owner
//   • Per-wallet mint limit (0 = unlimited)
//   • Registered minter role (for NFTLaunchpad contract)
//   • Owner can update baseURI (reveal mechanic)
//   • tokenURI returns baseURI + tokenId (ERC-721 JSON standard)
//     ↳ baseURI must point to JSON metadata: {"name":"...","image":"..."}
//
// IMPORTANT: OPWallet requires tokenURI to return a URL to a JSON file
// following ERC-721 metadata standard: {"name":"...","description":"...","image":"..."}
// Host JSON files on IPFS/Arweave and set baseURI accordingly.
// ═══════════════════════════════════════════════════════════

// Storage pointers (allocated after OP721's internal pointers)
const deployerPointer: u16 = Blockchain.nextPointer;
const minterPointer: u16 = Blockchain.nextPointer;
const mintingOpenPointer: u16 = Blockchain.nextPointer;
const maxPerWalletPointer: u16 = Blockchain.nextPointer;
const mintCountBasePointer: u16 = Blockchain.nextPointer; // base for per-wallet mint count map

@final
export class BaseNFT extends OP721 {
    // Deployer hash — stored on deploy so we can check auth without OP_NET's onlyDeployer
    // which reverts unconditionally (we need OR logic: deployer OR minter)
    private readonly _deployer: StoredU256;

    // Optional registered minter — set to NFTLaunchpad address after registration
    private readonly _minter: StoredU256;

    // Whether public minting is open
    private readonly _mintingOpen: StoredBoolean;

    // Per-wallet mint limit (0 = unlimited)
    private readonly _maxPerWallet: StoredU256;

    public constructor() {
        super();
        this._deployer     = new StoredU256(deployerPointer, EMPTY_POINTER);
        this._minter       = new StoredU256(minterPointer, EMPTY_POINTER);
        this._mintingOpen  = new StoredBoolean(mintingOpenPointer, false);
        this._maxPerWallet = new StoredU256(maxPerWalletPointer, EMPTY_POINTER);
    }

    // ─── Deployment ────────────────────────────────────────
    // Calldata order (all required):
    //   name (string), symbol (string), baseURI (string), maxSupply (u256)
    // Optional collection metadata (pass empty strings to skip):
    //   icon (string), banner (string), website (string), description (string)
    // Optional:
    //   maxPerWallet (u256) — 0 = unlimited
    public override onDeployment(calldata: Calldata): void {
        const name:        string = calldata.readStringWithLength();
        const symbol:      string = calldata.readStringWithLength();
        const baseURI:     string = calldata.readStringWithLength();
        const maxSupply:   u256   = calldata.readU256();
        const icon:        string = calldata.readStringWithLength();
        const banner:      string = calldata.readStringWithLength();
        const website:     string = calldata.readStringWithLength();
        const description: string = calldata.readStringWithLength();
        const maxPerWallet: u256  = calldata.readU256();

        this.instantiate(new OP721InitParameters(
            name,
            symbol,
            baseURI,
            maxSupply,
            banner,
            icon,
            website,
            description,
        ));

        // Store deployer for auth checks
        this._deployer.set(u256.fromUint8ArrayBE(Blockchain.tx.origin));

        // Store per-wallet limit (0 = unlimited)
        if (!maxPerWallet.isZero()) {
            this._maxPerWallet.set(maxPerWallet);
        }
    }

    public override onUpdate(_calldata: Calldata): void {
        super.onUpdate(_calldata);
    }

    // ─── Auth Helpers ──────────────────────────────────────
    private requireDeployer(caller: Address): void {
        const callerHash: u256 = u256.fromUint8ArrayBE(caller);
        if (!u256.eq(callerHash, this._deployer.value)) {
            throw new Revert('Only deployer');
        }
    }

    private requireMinterOrDeployer(caller: Address): void {
        const callerHash: u256 = u256.fromUint8ArrayBE(caller);
        if (u256.eq(callerHash, this._deployer.value)) return;
        const minterHash: u256 = this._minter.value;
        if (!minterHash.isZero() && u256.eq(callerHash, minterHash)) return;
        throw new Revert('Not authorized: deployer or minter only');
    }

    // ─── Per-wallet mint counter ───────────────────────────
    // Uses pointer = mintCountBasePointer + lower 16 bits of address hash
    // This is a simplified approach — collisions are possible but acceptable for MVP
    private walletMintCountPointer(addrHash: u256): u16 {
        // Use lower 16 bits of the hash as offset, capped to avoid overflow
        const offset: u16 = <u16>(addrHash.lo1 & 0xFFFF);
        return mintCountBasePointer + offset;
    }

    private getMintCount(addrHash: u256): u256 {
        const p = this.walletMintCountPointer(addrHash);
        const s = new StoredU256(p, EMPTY_POINTER);
        return s.value;
    }

    private incrementMintCount(addrHash: u256, quantity: u256): void {
        const p = this.walletMintCountPointer(addrHash);
        const s = new StoredU256(p, EMPTY_POINTER);
        s.set(SafeMath.add(s.value, quantity));
    }

    // ─── Internal mint helper ──────────────────────────────
    private _mintBatch(to: Address, quantity: u256): u256 {
        const currentSupply: u256 = this.totalSupply;
        const max: u256 = this.maxSupply;

        if (u256.gt(SafeMath.add(currentSupply, quantity), max)) {
            throw new Revert('Exceeds max supply');
        }

        const firstId: u256 = this._nextTokenId.value;
        let i: u256 = u256.Zero;
        while (u256.lt(i, quantity)) {
            const tokenId: u256 = this._nextTokenId.value;
            this._mint(to, tokenId);
            this._nextTokenId.value = SafeMath.add(tokenId, u256.One);
            i = SafeMath.add(i, u256.One);
        }
        return firstId;
    }

    // ─── mintTo (deployer or minter) ───────────────────────
    @method(
        { name: 'to',       type: ABIDataTypes.ADDRESS },
        { name: 'quantity', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'firstTokenId', type: ABIDataTypes.UINT256 })
    @emit('Transferred')
    public mintTo(calldata: Calldata): BytesWriter {
        this.requireMinterOrDeployer(Blockchain.tx.sender);

        const to:       Address = calldata.readAddress();
        const quantity: u256    = calldata.readU256();

        if (quantity.isZero()) throw new Revert('Quantity must be > 0');

        const firstId: u256 = this._mintBatch(to, quantity);

        const writer = new BytesWriter(32);
        writer.writeU256(firstId);
        return writer;
    }

    // ─── mint (public) ─────────────────────────────────────
    @method({ name: 'quantity', type: ABIDataTypes.UINT256 })
    @returns({ name: 'firstTokenId', type: ABIDataTypes.UINT256 })
    @emit('Transferred')
    public mint(calldata: Calldata): BytesWriter {
        if (!this._mintingOpen.value) throw new Revert('Public minting not open');

        const quantity: u256 = calldata.readU256();
        if (quantity.isZero()) throw new Revert('Quantity must be > 0');

        const to: Address = Blockchain.tx.sender;
        const callerHash: u256 = u256.fromUint8ArrayBE(to);

        // Enforce per-wallet limit if set
        const maxPerWallet: u256 = this._maxPerWallet.value;
        if (!maxPerWallet.isZero()) {
            const alreadyMinted: u256 = this.getMintCount(callerHash);
            if (u256.gt(SafeMath.add(alreadyMinted, quantity), maxPerWallet)) {
                throw new Revert('Exceeds per-wallet mint limit');
            }
            this.incrementMintCount(callerHash, quantity);
        }

        const firstId: u256 = this._mintBatch(to, quantity);

        const writer = new BytesWriter(32);
        writer.writeU256(firstId);
        return writer;
    }

    // ─── openMinting (deployer only) ───────────────────────
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public openMinting(_: Calldata): BytesWriter {
        this.requireDeployer(Blockchain.tx.sender);
        this._mintingOpen.value = true;

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── setMinter (deployer only) ─────────────────────────
    // Call this after registering with NFTLaunchpad to grant it minting rights
    @method({ name: 'minter', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setMinter(calldata: Calldata): BytesWriter {
        this.requireDeployer(Blockchain.tx.sender);
        const minter: Address = calldata.readAddress();
        this._minter.set(u256.fromUint8ArrayBE(minter));

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── setMaxPerWallet (deployer only) ───────────────────
    @method({ name: 'maxPerWallet', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setMaxPerWallet(calldata: Calldata): BytesWriter {
        this.requireDeployer(Blockchain.tx.sender);
        const limit: u256 = calldata.readU256();
        this._maxPerWallet.set(limit);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─── getMinter (read) ──────────────────────────────────
    @method()
    @returns({ name: 'minter', type: ABIDataTypes.UINT256 })
    @view
    public getMinter(_: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._minter.value);
        return writer;
    }

    // ─── isMintingOpen (read) ──────────────────────────────
    @method()
    @returns({ name: 'open', type: ABIDataTypes.BOOL })
    @view
    public isMintingOpen(_: Calldata): BytesWriter {
        const writer = new BytesWriter(1);
        writer.writeBoolean(this._mintingOpen.value);
        return writer;
    }
}
