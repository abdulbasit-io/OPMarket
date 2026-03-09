import { useState, useEffect, useCallback } from 'react';
import ListingCard from '../components/ListingCard';
import BuyModal from '../components/BuyModal';
import { getAllActiveListings, cancelListing } from '../utils/contractService';
import { useWallet } from '../context/WalletContext';

const SORT_OPTIONS = [
  { value: 'recent',     label: 'Most Recent'   },
  { value: 'price-asc',  label: 'Price: Low–High' },
  { value: 'price-desc', label: 'Price: High–Low' },
];

function sortListings(listings, sort) {
  const arr = [...listings];
  if (sort === 'price-asc')  return arr.sort((a, b) => (a.price < b.price ? -1 : 1));
  if (sort === 'price-desc') return arr.sort((a, b) => (a.price > b.price ? -1 : 1));
  return arr; // 'recent' = contract order (id ascending, newest first)
}

export default function MarketplacePage() {
  const { isConnected, address, refreshBalance } = useWallet();

  const [listings,   setListings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [sort,       setSort]       = useState('recent');
  const [buyTarget,  setBuyTarget]  = useState(null);
  const [cancelTx,   setCancelTx]   = useState('');
  const [error,      setError]      = useState('');

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const all = await getAllActiveListings();
      setListings(all);
    } catch (e) {
      setError('Failed to load listings. Is your RPC reachable?');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadListings(); }, [loadListings]);

  const handleCancelListing = async (listing) => {
    if (!isConnected) return;
    try {
      const id = await cancelListing(address, listing.id);
      setCancelTx(id);
      await loadListings();
      await refreshBalance();
    } catch (e) {
      setError(e.message || 'Cancel failed');
    }
  };

  const sorted = sortListings(listings, sort);

  return (
    <main className="page-marketplace">
      <div className="container">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Marketplace</h1>
            <p className="page-subtitle">Bitcoin L1 NFT listings — non-custodial, on-chain.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              className="form-select"
              value={sort}
              onChange={e => setSort(e.target.value)}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              className="btn btn-ghost btn-sm"
              onClick={loadListings}
              disabled={loading}
              title="Refresh"
            >
              ↺
            </button>
          </div>
        </div>

        {/* Status banner */}
        {cancelTx && (
          <div className="success-banner" style={{ marginBottom: 16 }}>
            Listing cancelled · Tx: {cancelTx}
            <button style={{ marginLeft: 12 }} onClick={() => setCancelTx('')}>✕</button>
          </div>
        )}
        {error && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            {error}
            <button style={{ marginLeft: 12 }} onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="nft-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card listing-card-skeleton">
                <div className="skeleton" style={{ height: 240 }} />
                <div style={{ padding: '14px 16px' }}>
                  <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 12, width: '50%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🖼</div>
            <h3>No listings yet</h3>
            <p>Be the first to list an NFT on Bitcoin L1.</p>
          </div>
        ) : (
          <div className="nft-grid">
            {sorted.map(l => (
              <ListingCard
                key={l.id}
                listing={l}
                onBuy={setBuyTarget}
                onCancel={handleCancelListing}
              />
            ))}
          </div>
        )}
      </div>

      {buyTarget && (
        <BuyModal
          listing={buyTarget}
          onClose={() => setBuyTarget(null)}
          onSuccess={() => { setBuyTarget(null); loadListings(); refreshBalance(); }}
        />
      )}
    </main>
  );
}
