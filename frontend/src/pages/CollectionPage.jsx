// ═══════════════════════════════════════════════════════════
// CollectionPage — Individual collection view
// Route: /collection/:id  (collectionId)
// ═══════════════════════════════════════════════════════════
//
// Shows:
//   - Collection header (name, image, progress, status)
//   - Mint card (approve token → mint)
//   - Creator withdraw card
//   - NFTs from this collection listed on the marketplace

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import NFTImage from '../components/NFTImage';
import ListingCard from '../components/ListingCard';
import BuyModal from '../components/BuyModal';
import {
  getCollection,
  getTokenSymbol,
  getTokenAllowance,
  getTokenBalance,
  approveTokenForLaunchpad,
  mintFromLaunchpad,
  withdrawProceeds,
  getAllActiveListings,
} from '../utils/contractService';
import { getBlockNumber } from '../utils/opnetProvider';
import { CONTRACTS, PAYMENT_TOKENS, TOKEN_DECIMALS } from '../utils/constants';
import { truncateAddress, toHuman } from '../utils/formatters';

// ── Helpers ───────────────────────────────────────────────

function blockStatus(current, start, end) {
  const now = BigInt(current || 0);
  if (now < start)  return 'upcoming';
  if (now >= end)   return 'ended';
  return 'active';
}

function blocksToTime(blocks) {
  if (!blocks || blocks <= 0) return '';
  const mins = Math.round(Number(blocks) * 10);
  if (mins < 60)   return `~${mins}m`;
  if (mins < 1440) return `~${Math.round(mins / 60)}h`;
  return `~${Math.round(mins / 1440)}d`;
}

function StatusBadge({ status }) {
  if (status === 'active')   return <span className="badge badge-success">Live</span>;
  if (status === 'upcoming') return <span className="badge badge-blue">Upcoming</span>;
  return <span className="badge badge-muted">Ended</span>;
}

function MintProgress({ minted, maxSupply }) {
  const pct = maxSupply > 0n ? Number((minted * 100n) / maxSupply) : 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <span>{minted.toLocaleString()} minted</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand)', borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ textAlign: 'right', marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        of {maxSupply.toLocaleString()} max
      </div>
    </div>
  );
}

// ── Mint Card ─────────────────────────────────────────────

const MINT_STEP = { IDLE: 0, APPROVE: 1, MINTING: 2, DONE: 3 };

function MintCard({ collection, currentBlock, walletAddr, onSuccess }) {
  const [qty,      setQty]      = useState(1);
  const [mintStep, setMintStep] = useState(MINT_STEP.IDLE);
  const [txId,     setTxId]     = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [symbol,   setSymbol]   = useState('tWBTC');
  const [decimals, setDecimals] = useState(TOKEN_DECIMALS);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [tokenBalance, setTokenBalance]   = useState(null);

  useEffect(() => {
    if (!collection?.paymentToken) return;
    const known = PAYMENT_TOKENS[collection.paymentToken];
    if (known) { setSymbol(known.symbol); setDecimals(known.decimals); return; }
    getTokenSymbol(collection.paymentToken).then(s => setSymbol(s || '???'));
  }, [collection?.paymentToken]);

  useEffect(() => {
    if (!walletAddr || !collection?.paymentToken || !CONTRACTS.LAUNCHPAD) return;
    const totalCost = collection.mintPrice * BigInt(qty);
    if (totalCost === 0n) { setNeedsApproval(false); return; }
    getTokenAllowance(collection.paymentToken, walletAddr, CONTRACTS.LAUNCHPAD).then(allowance => {
      setNeedsApproval(allowance < totalCost);
    });
    getTokenBalance(collection.paymentToken, walletAddr).then(bal => setTokenBalance(bal));
  }, [walletAddr, collection, qty]);

  const totalCost = collection ? collection.mintPrice * BigInt(qty) : 0n;
  const status    = collection ? blockStatus(currentBlock, collection.startBlock, collection.endBlock) : 'ended';
  const canMint   = status === 'active' && !!walletAddr;

  const handleApprove = async () => {
    setError('');
    setLoading(true);
    setMintStep(MINT_STEP.APPROVE);
    try {
      await approveTokenForLaunchpad(collection.paymentToken, totalCost, walletAddr);
      setNeedsApproval(false);
      setMintStep(MINT_STEP.IDLE);
    } catch (e) {
      setError(e.message || 'Approval failed');
      setMintStep(MINT_STEP.IDLE);
    } finally {
      setLoading(false);
    }
  };

  const handleMint = async () => {
    setError('');
    setLoading(true);
    setMintStep(MINT_STEP.MINTING);
    try {
      const id = await mintFromLaunchpad(walletAddr, collection.id, qty);
      setTxId(id);
      setMintStep(MINT_STEP.DONE);
      onSuccess?.();
    } catch (e) {
      setError(e.message || 'Mint failed');
      setMintStep(MINT_STEP.IDLE);
    } finally {
      setLoading(false);
    }
  };

  if (mintStep === MINT_STEP.DONE) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
        <p style={{ fontWeight: 700, marginBottom: 8 }}>Minted successfully!</p>
        {txId && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 16 }}>Tx: {txId}</p>}
        <button className="btn btn-ghost btn-sm" onClick={() => { setMintStep(MINT_STEP.IDLE); setTxId(''); }}>
          Mint More
        </button>
      </div>
    );
  }

  return (
    <div>
      <MintProgress minted={collection?.minted ?? 0n} maxSupply={collection?.maxSupply ?? 0n} />

      {status === 'upcoming' && currentBlock && (
        <div className="alert alert-info" style={{ marginBottom: 16, fontSize: '0.82rem' }}>
          Mint starts at block #{collection.startBlock.toLocaleString()} — in {blocksToTime(Number(collection.startBlock) - currentBlock)}
        </div>
      )}
      {status === 'ended' && (
        <div className="alert alert-info" style={{ marginBottom: 16, fontSize: '0.82rem' }}>
          Mint window has closed.
        </div>
      )}

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

      {canMint && collection?.minted < collection?.maxSupply && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <label className="form-label" style={{ whiteSpace: 'nowrap' }}>Quantity</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
              <input
                type="number" min="1" step="1"
                className="form-input"
                style={{ textAlign: 'center', width: 60 }}
                value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => setQty(q => q + 1)}>+</button>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r-md)', padding: '12px 16px', marginBottom: 16, fontSize: '0.82rem' }}>
            <div className="price-row" style={{ paddingTop: 0 }}>
              <span className="price-label">Price per NFT</span>
              <span className="price-value">{toHuman(collection.mintPrice, decimals)} {symbol}</span>
            </div>
            <div className="price-row price-row--total">
              <span className="price-label">Total</span>
              <span className="price-value">{toHuman(totalCost, decimals)} {symbol}</span>
            </div>
          </div>

          {/* Low balance hint for tWBTC */}
          {collection.paymentToken === CONTRACTS.WBTC_TOKEN &&
           tokenBalance !== null && tokenBalance < totalCost && (
            <div style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 'var(--r-md)',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}>
              <span>Your tWBTC balance is low.</span>
              <Link to="/faucet" className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
                Get tWBTC →
              </Link>
            </div>
          )}

          {needsApproval ? (
            <button className="btn btn-primary btn-full" onClick={handleApprove} disabled={loading}>
              {loading && mintStep === MINT_STEP.APPROVE ? 'Approving…' : `Approve ${symbol}`}
            </button>
          ) : (
            <button className="btn btn-primary btn-full" onClick={handleMint} disabled={loading}>
              {loading && mintStep === MINT_STEP.MINTING ? 'Minting…' : `Mint ${qty} NFT${qty > 1 ? 's' : ''}`}
            </button>
          )}
        </>
      )}

      {collection?.minted >= collection?.maxSupply && collection?.maxSupply > 0n && (
        <div className="alert alert-info" style={{ textAlign: 'center' }}>Sold out</div>
      )}

      {!walletAddr && status === 'active' && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>
          Connect OPWallet to mint.
        </p>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────

export default function CollectionPage() {
  const { id }                            = useParams();
  const { address, isConnected, connect } = useWallet();

  const [collection,   setCollection]   = useState(null);
  const [currentBlock, setCurrentBlock] = useState(null);
  const [listings,     setListings]     = useState([]);
  const [buyTarget,    setBuyTarget]    = useState(null);
  const [symbol,       setSymbol]       = useState('tWBTC');
  const [decimals,     setDecimals]     = useState(TOKEN_DECIMALS);
  const [loading,      setLoading]      = useState(true);
  const [withdrawing,  setWithdrawing]  = useState(false);
  const [withdrawTx,   setWithdrawTx]  = useState('');
  const [error,        setError]        = useState('');

  const load = useCallback(async () => {
    if (id == null) return;
    setLoading(true);
    try {
      const [coll, block, allListings] = await Promise.all([
        getCollection(id),
        getBlockNumber(),
        getAllActiveListings(),
      ]);
      setCollection(coll);
      setCurrentBlock(block ? Number(block) : null);
      setListings(allListings.filter(l => String(l.collectionId) === String(id)));
      if (coll?.paymentToken) {
        const known = PAYMENT_TOKENS[coll.paymentToken];
        if (known) { setSymbol(known.symbol); setDecimals(known.decimals); }
        else { getTokenSymbol(coll.paymentToken).then(s => { if (s) setSymbol(s); }); }
      }
    } catch (e) {
      setError('Failed to load collection.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const isCreator = collection && address &&
    collection.creator?.toLowerCase() === address.toLowerCase();

  const handleWithdraw = async () => {
    setError('');
    setWithdrawing(true);
    try {
      const txId = await withdrawProceeds(address, id);
      setWithdrawTx(txId);
      await load();
    } catch (e) {
      setError(e.message || 'Withdraw failed');
    } finally {
      setWithdrawing(false);
    }
  };

  const status = collection && currentBlock
    ? blockStatus(currentBlock, collection.startBlock, collection.endBlock)
    : null;

  // ── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <main className="page-content">
        <div className="container">
          <div style={{ paddingTop: 48 }}>
            <div className="skeleton" style={{ height: 200, borderRadius: 'var(--r-lg)', marginBottom: 24 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
              <div className="skeleton" style={{ height: 360, borderRadius: 'var(--r-lg)' }} />
              <div className="skeleton" style={{ height: 360, borderRadius: 'var(--r-lg)' }} />
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Not found ────────────────────────────────────────────
  if (!collection?.isRegistered) {
    return (
      <main className="page-content">
        <div className="container">
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3 className="empty-title">Collection not found</h3>
            <p className="empty-desc">
              Collection <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>#{id}</code>
              {' '}is not registered with the OPMarket launchpad.
            </p>
            <Link to="/launch" className="btn btn-primary" style={{ marginTop: 8 }}>
              Launch a Collection
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-content" style={{ paddingBottom: 64 }}>
      <div className="container">

        {/* ── Collection Header ─────────────────────────── */}
        <div style={{ paddingTop: 32, marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
            {/* Collection image */}
            <div style={{ width: 72, height: 72, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
              <NFTImage
                src={collection.imageURI}
                alt={collection.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
                <h1 className="page-title" style={{ marginBottom: 0 }}>
                  {collection.name || 'Unnamed Collection'}
                </h1>
                {status && <StatusBadge status={status} />}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                {collection.symbol} · Collection #{id}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 20 }}>
            {error}
            <button style={{ marginLeft: 'auto' }} onClick={() => setError('')}>✕</button>
          </div>
        )}
        {withdrawTx && (
          <div className="success-banner" style={{ marginBottom: 20 }}>
            Proceeds withdrawn · Tx: {withdrawTx}
            <button style={{ marginLeft: 'auto' }} onClick={() => setWithdrawTx('')}>✕</button>
          </div>
        )}

        {/* ── Two-column layout ─────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,340px) 1fr', gap: 24, marginBottom: 48, alignItems: 'start' }}>

          {/* LEFT: Mint card */}
          <div className="card" style={{ padding: '24px 24px 20px' }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 20 }}>Mint</h2>

            {!isConnected ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: '0.875rem' }}>
                  Connect OPWallet to mint.
                </p>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={connect}>
                  Connect Wallet
                </button>
              </div>
            ) : (
              <MintCard
                collection={collection}
                currentBlock={currentBlock}
                walletAddr={address}
                onSuccess={load}
              />
            )}
          </div>

          {/* RIGHT: Collection info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 20 }}>Details</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                {[
                  { label: 'Mint Price',       value: `${toHuman(collection.mintPrice, decimals)} ${symbol}` },
                  { label: 'Max Supply',        value: collection.maxSupply.toLocaleString() },
                  { label: 'Minted',            value: collection.minted.toLocaleString() },
                  { label: 'Per-Wallet Limit',  value: collection.maxPerWallet > 0n ? collection.maxPerWallet.toLocaleString() : 'Unlimited' },
                  { label: 'Royalty',           value: `${(collection.royaltyBps / 100).toFixed(1)}%` },
                  { label: 'Start Block',       value: `#${collection.startBlock.toLocaleString()}` },
                  { label: 'End Block',         value: `#${collection.endBlock.toLocaleString()}` },
                  { label: 'Payment Token',     value: truncateAddress(collection.paymentToken, 8, 6) },
                ].map(({ label, value }) => (
                  <div key={label} className="price-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 0' }}>
                    <span className="price-label">{label}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div className="form-hint" style={{ marginBottom: 4 }}>Creator</div>
                <div className="address-pill">{truncateAddress(collection.creator, 10, 8)}</div>
              </div>
            </div>

            {/* Creator withdraw */}
            {isCreator && (
              <div className="card" style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Proceeds</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand-pale)' }}>
                      {toHuman(collection.proceeds, decimals)} {symbol}
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleWithdraw}
                    disabled={withdrawing || collection.proceeds === 0n}
                  >
                    {withdrawing ? 'Withdrawing…' : 'Withdraw'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Listed NFTs from this collection ─────────── */}
        <div>
          <div className="section-header">
            <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>
              Listed for Sale
              {listings.length > 0 && (
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 10 }}>
                  {listings.length} listing{listings.length !== 1 ? 's' : ''}
                </span>
              )}
            </h2>
            <Link to="/marketplace" className="btn btn-ghost btn-sm">View all →</Link>
          </div>

          {listings.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 0' }}>
              <div className="empty-icon" style={{ fontSize: '2.5rem' }}>🏷</div>
              <p style={{ color: 'var(--text-secondary)' }}>No NFTs from this collection are currently listed.</p>
            </div>
          ) : (
            <div className="nft-grid">
              {listings.map(l => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  onBuy={setBuyTarget}
                  onCancel={null}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {buyTarget && (
        <BuyModal
          listing={buyTarget}
          onClose={() => setBuyTarget(null)}
          onSuccess={() => { setBuyTarget(null); load(); }}
        />
      )}
    </main>
  );
}
