// ═══════════════════════════════════════════════════════════
// ListNFTModal — list a launchpad NFT on the secondary market
// ═══════════════════════════════════════════════════════════
// No NFT contract approval needed (marketplace uses launchpad.marketplaceTransfer).
// Just fill in price and submit.
import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { listNFT } from '../utils/contractService';
import { DEFAULT_PAYMENT_TOKEN, DEFAULT_PAYMENT_SYMBOL, TOKEN_DECIMALS } from '../utils/constants';
import { toRaw } from '../utils/formatters';
import NFTImage from './NFTImage';

export default function ListNFTModal({ nft, onClose, onSuccess }) {
  // nft: { collectionId, tokenId, collectionName, imageURI }
  const { address } = useWallet();

  const [price,   setPrice]   = useState('');
  const [royalty, setRoyalty] = useState('5');
  const [txId,    setTxId]    = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  if (!nft) return null;

  const handleList = async (e) => {
    e.preventDefault();
    if (!price || Number(price) <= 0) return setError('Enter a valid price.');
    const royaltyBps = Math.round(Number(royalty || 0) * 100);
    if (royaltyBps > 1000) return setError('Royalty cannot exceed 10%.');
    setError('');
    setLoading(true);
    try {
      const rawPrice = toRaw(price, TOKEN_DECIMALS);
      const id = await listNFT(
        address,
        nft.collectionId,
        nft.tokenId,
        rawPrice,
        DEFAULT_PAYMENT_TOKEN,
        address,        // royalty recipient = seller
        royaltyBps,
      );
      setTxId(id);
      setDone(true);
      onSuccess?.(id);
    } catch (err) {
      setError(err.message || 'Listing failed');
    } finally {
      setLoading(false);
    }
  };

  const name = nft.collectionName
    ? `${nft.collectionName} #${nft.tokenId}`
    : `Collection ${nft.collectionId} #${nft.tokenId}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3 className="modal-title">{done ? 'Listed!' : 'List for Sale'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* NFT preview */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, alignItems: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 'var(--radius)', overflow: 'hidden', flexShrink: 0 }}>
              <NFTImage src={nft.imageURI} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Collection #{String(nft.collectionId)} · Token #{String(nft.tokenId)}
              </div>
            </div>
          </div>

          {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

          {!done ? (
            <form onSubmit={handleList}>
              <div className="form-group">
                <label className="form-label">Price ({DEFAULT_PAYMENT_SYMBOL})</label>
                <input
                  type="number" min="0" step="any"
                  className="form-input"
                  placeholder="e.g. 100"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Royalty % (max 10%)</label>
                <input
                  type="number" min="0" max="10" step="0.1"
                  className="form-input"
                  placeholder="5"
                  value={royalty}
                  onChange={e => setRoyalty(e.target.value)}
                />
                <div className="form-hint">Paid to you on each resale.</div>
              </div>

              <div style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius)',
                padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)',
                marginBottom: 20, lineHeight: 1.6,
              }}>
                Platform fee: 2.5% · Royalty: {royalty || 0}% · You receive:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {price ? (Number(price) * (1 - 0.025 - Number(royalty || 0) / 100)).toFixed(4) : '—'} {DEFAULT_PAYMENT_SYMBOL}
                </strong>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Listing…' : 'List for Sale'}
              </button>
            </form>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎊</div>
              <p style={{ marginBottom: 8 }}><strong>{name}</strong> is now listed!</p>
              {txId && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: 20 }}>
                  Tx: {txId}
                </p>
              )}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
