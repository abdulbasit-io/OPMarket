import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import ListNFTModal from '../components/ListNFTModal';
import NFTImage from '../components/NFTImage';
import { getOwnedNFTs, fetchNFTMetadata, getTokenURI } from '../utils/contractService';
import { KNOWN_COLLECTIONS } from '../utils/constants';
import { truncateAddress } from '../utils/formatters';

function NFTTile({ nft, onList }) {
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    (async () => {
      const uri = await getTokenURI(nft.collectionAddr, nft.tokenId);
      if (uri) {
        const m = await fetchNFTMetadata(uri);
        setMeta(m);
      }
    })();
  }, [nft.collectionAddr, nft.tokenId]);

  return (
    <article className="card listing-card">
      <div className="listing-card-image">
        <NFTImage
          src={meta?.image}
          alt={meta?.name}
          contractAddr={nft.collectionAddr}
          tokenId={nft.tokenId}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      <div className="listing-card-body">
        <div className="listing-card-header">
          <div>
            <div className="listing-card-name">
              {meta?.name || `NFT #${nft.tokenId}`}
            </div>
            <div className="listing-card-collection">
              {truncateAddress(nft.collectionAddr)}
            </div>
          </div>
          <span className="badge badge-brand" style={{ fontSize: '0.7rem' }}>
            #{String(nft.tokenId)}
          </span>
        </div>
        {meta?.description && (
          <p style={{
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            marginBottom: 12,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {meta.description}
          </p>
        )}
        <div className="listing-card-actions">
          <button
            className="btn btn-primary btn-sm"
            style={{ flex: 1 }}
            onClick={() => onList(nft)}
          >
            List for Sale
          </button>
        </div>
      </div>
    </article>
  );
}

export default function MyNFTsPage() {
  const { isConnected, address, connect } = useWallet();

  const [nfts,      setNfts]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [listTarget, setListTarget] = useState(null);
  const [error,     setError]     = useState('');
  const [successTx, setSuccessTx] = useState('');

  const loadNFTs = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        KNOWN_COLLECTIONS.map(c => getOwnedNFTs(c, address)),
      );
      setNfts(results.flat());
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
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">My NFTs</h1>
            <p className="page-subtitle">
              NFTs in your wallet across known collections.
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

        {KNOWN_COLLECTIONS.length === 0 && (
          <div className="info-banner" style={{ marginBottom: 20 }}>
            No collections configured. Set <code>VITE_BASE_NFT_CONTRACT</code> in your <code>.env</code> to enumerate NFTs.
          </div>
        )}

        {loading ? (
          <div className="nft-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card">
                <div className="skeleton" style={{ height: 200 }} />
                <div style={{ padding: 16 }}>
                  <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 32 }} />
                </div>
              </div>
            ))}
          </div>
        ) : nfts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🖼</div>
            <h3>No NFTs found</h3>
            <p>You don't own any NFTs in the known collections yet.</p>
          </div>
        ) : (
          <div className="nft-grid">
            {nfts.map(nft => (
              <NFTTile
                key={`${nft.collectionAddr}-${nft.tokenId}`}
                nft={nft}
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
