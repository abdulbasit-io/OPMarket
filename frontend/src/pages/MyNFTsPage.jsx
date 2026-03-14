import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import ListNFTModal from '../components/ListNFTModal';
import NFTImage from '../components/NFTImage';
import { getAllCollections, getLaunchpadBalance } from '../utils/contractService';

// ── Owned Collection Card ──────────────────────────────────

function OwnedCollectionCard({ collection, balance, onList }) {
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [inputError,   setInputError]   = useState('');

  const handleList = () => {
    const tid = tokenIdInput.trim();
    if (!tid || isNaN(Number(tid)) || Number(tid) < 1) {
      setInputError('Enter a valid token ID (e.g. 1).');
      return;
    }
    setInputError('');
    onList({
      collectionId:   collection.id,
      tokenId:        Number(tid),
      collectionName: collection.name,
      imageURI:       collection.imageURI,
    });
  };

  return (
    <article className="card listing-card">
      <div className="listing-card-image">
        <NFTImage
          src={collection.imageURI}
          alt={collection.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      <div className="listing-card-body">
        <div className="listing-card-header">
          <div>
            <div className="listing-card-name">
              {collection.name || `Collection #${collection.id}`}
            </div>
            <div className="listing-card-collection">
              {collection.symbol} · ID #{String(collection.id)}
            </div>
          </div>
          <span className="badge badge-brand" style={{ fontSize: '0.7rem' }}>
            ×{String(balance)}
          </span>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
            List one of your {String(balance)} NFT{balance > 1n ? 's' : ''} — enter token ID:
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              min="1"
              step="1"
              className="form-input"
              placeholder="Token ID, e.g. 1"
              value={tokenIdInput}
              onChange={e => { setTokenIdInput(e.target.value); setInputError(''); }}
              style={{ flex: 1, padding: '6px 10px', fontSize: '0.82rem' }}
            />
            <button
              className="btn btn-primary btn-sm"
              style={{ flexShrink: 0 }}
              onClick={handleList}
            >
              List
            </button>
          </div>
          {inputError && (
            <div style={{ color: 'var(--error)', fontSize: '0.75rem', marginTop: 4 }}>
              {inputError}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function MyNFTsPage() {
  const { isConnected, address, connect } = useWallet();

  const [ownedCollections, setOwnedCollections] = useState([]); // [{ collection, balance }]
  const [loading,          setLoading]          = useState(false);
  const [listTarget,       setListTarget]       = useState(null);
  const [error,            setError]            = useState('');
  const [successTx,        setSuccessTx]        = useState('');

  const loadNFTs = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError('');
    try {
      const collections = await getAllCollections();
      const withBalances = await Promise.all(
        collections.map(async c => ({
          collection: c,
          balance:    await getLaunchpadBalance(c.id, address),
        })),
      );
      setOwnedCollections(withBalances.filter(x => x.balance > 0n));
    } catch (e) {
      setError('Failed to load your NFTs. Check your connection.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { if (isConnected) loadNFTs(); }, [isConnected, loadNFTs]);

  if (!isConnected) {
    return (
      <main className="page-content">
        <div className="container">
          <div className="empty-state" style={{ paddingTop: 80 }}>
            <div className="empty-icon">🔑</div>
            <h3>Connect your wallet</h3>
            <p>Connect OPWallet to see and manage your NFTs.</p>
            <button className="btn btn-primary" onClick={connect} style={{ marginTop: 20 }}>
              Connect OPWallet
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-content">
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">My NFTs</h1>
            <p className="page-subtitle">
              Launchpad NFTs you own — enter a token ID to list one for sale.
            </p>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={loadNFTs}
            disabled={loading}
          >
            ↺ Refresh
          </button>
        </div>

        {successTx && (
          <div className="success-banner" style={{ marginBottom: 16 }}>
            NFT listed successfully · Tx: {successTx}
            <button style={{ marginLeft: 12 }} onClick={() => setSuccessTx('')}>✕</button>
          </div>
        )}
        {error && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="nft-grid">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card">
                <div className="skeleton" style={{ height: 200 }} />
                <div style={{ padding: 16 }}>
                  <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 32 }} />
                </div>
              </div>
            ))}
          </div>
        ) : ownedCollections.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🖼</div>
            <h3>No NFTs found</h3>
            <p>You don't own any launchpad NFTs yet. Mint one from the marketplace!</p>
          </div>
        ) : (
          <div className="nft-grid">
            {ownedCollections.map(({ collection, balance }) => (
              <OwnedCollectionCard
                key={String(collection.id)}
                collection={collection}
                balance={balance}
                onList={setListTarget}
              />
            ))}
          </div>
        )}
      </div>

      {listTarget && (
        <ListNFTModal
          nft={listTarget}
          onClose={() => setListTarget(null)}
          onSuccess={(txId) => {
            setListTarget(null);
            setSuccessTx(txId);
            loadNFTs();
          }}
        />
      )}
    </main>
  );
}
