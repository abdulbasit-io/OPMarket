// ═══════════════════════════════════════════════════════════
// ListNFTModal — three-step: approve NFT → fill form → submit
// ═══════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import {
  isApprovedForAll,
  approveNFTForMarketplace,
  listNFT,
  fetchNFTMetadata,
  getTokenURI,
} from '../utils/contractService';
import {
  CONTRACTS,
  DEFAULT_PAYMENT_TOKEN,
  DEFAULT_PAYMENT_SYMBOL,
  TOKEN_DECIMALS,
} from '../utils/constants';
import { toRaw, truncateAddress } from '../utils/formatters';
import NFTImage from './NFTImage';

const STEP = { APPROVE: 0, FORM: 1, SUBMITTING: 2, DONE: 3 };

export default function ListNFTModal({ nft, onClose, onSuccess }) {
  const { address } = useWallet();

  const [step,     setStep]     = useState(STEP.APPROVE);
  const [meta,     setMeta]     = useState(null);
  const [price,    setPrice]    = useState('');
  const [royalty,  setRoyalty]  = useState('0');
  const [txId,     setTxId]     = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!nft) return;
    (async () => {
      const uri = await getTokenURI(nft.collectionAddr, nft.tokenId);
      if (uri) {
        const m = await fetchNFTMetadata(uri);
        setMeta(m);
      }
      if (address) {
        const approved = await isApprovedForAll(
          nft.collectionAddr, address, CONTRACTS.MARKETPLACE,
        );
        if (approved) setStep(STEP.FORM);
      }
    })();
  }, [nft, address]);

  if (!nft) return null;

  const handleApproveNFT = async () => {
    setError('');
    setLoading(true);
    try {
      await approveNFTForMarketplace(nft.collectionAddr, address);
      setStep(STEP.FORM);
    } catch (e) {
      setError(e.message || 'Approval failed');
    } finally {
      setLoading(false);
    }
  };

  const handleList = async (e) => {
    e.preventDefault();
    if (!price || Number(price) <= 0) {
      setError('Enter a valid price');
      return;
    }
    const royaltyBps = Math.round(Number(royalty) * 100);
    if (royaltyBps > 1000) {
      setError('Royalty cannot exceed 10%');
      return;
    }
    setError('');
    setStep(STEP.SUBMITTING);
    try {
      const rawPrice = toRaw(price, TOKEN_DECIMALS);
      const id = await listNFT(
        address,
        nft.collectionAddr,
        nft.tokenId,
        rawPrice,
        DEFAULT_PAYMENT_TOKEN,
        address,       // royalty recipient = seller by default
        royaltyBps,
      );
      setTxId(id);
      setStep(STEP.DONE);
      onSuccess?.(id);
    } catch (err) {
      setError(err.message || 'Listing failed');
      setStep(STEP.FORM);
    }
  };

  const titles = {
    [STEP.APPROVE]:     'Approve Marketplace',
    [STEP.FORM]:        'List Your NFT',
    [STEP.SUBMITTING]:  'Submitting…',
    [STEP.DONE]:        'NFT Listed!',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3 className="modal-title">{titles[step]}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* NFT preview strip */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, alignItems: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 'var(--radius)', overflow: 'hidden', flexShrink: 0 }}>
              <NFTImage
                src={meta?.image}
                contractAddr={nft.collectionAddr}
                tokenId={nft.tokenId}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {meta?.name || `NFT #${nft.tokenId}`}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                {truncateAddress(nft.collectionAddr)}
              </div>
            </div>
          </div>

          {/* Step indicator */}
          {step <= STEP.FORM && (
            <div className="step-bar" style={{ marginBottom: 20 }}>
              <div className={`step ${step >= STEP.APPROVE ? 'active' : ''}`}>
                <div className="step-circle">1</div>
                <div className="step-label">Approve</div>
              </div>
              <div className="step-line" />
              <div className={`step ${step >= STEP.FORM ? 'active' : ''}`}>
                <div className="step-circle">2</div>
                <div className="step-label">List</div>
              </div>
            </div>
          )}

          {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

          {/* STEP 0 — Approve NFT collection */}
          {step === STEP.APPROVE && (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 20 }}>
                Allow the OPMarket contract to transfer NFTs from this collection on your behalf.
                You only need to do this once per collection.
              </p>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleApproveNFT}
                disabled={loading}
              >
                {loading ? 'Approving…' : 'Approve Collection'}
              </button>
            </>
          )}

          {/* STEP 1 — Price form */}
          {step === STEP.FORM && (
            <form onSubmit={handleList}>
              <div className="form-group">
                <label className="form-label">Price ({DEFAULT_PAYMENT_SYMBOL})</label>
                <input
                  type="number"
                  min="0"
                  step="any"
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
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  className="form-input"
                  placeholder="0"
                  value={royalty}
                  onChange={e => setRoyalty(e.target.value)}
                />
                <div className="form-hint">Royalty is paid to you on secondary sales.</div>
              </div>

              <div style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 'var(--radius)',
                padding: '12px 16px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                marginBottom: 20,
                lineHeight: 1.6,
              }}>
                Platform fee: 2.5% · Royalty: {royalty || 0}% · You receive:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {price ? ((Number(price) * (1 - 0.025 - Number(royalty || 0) / 100)).toFixed(4)) : '—'} {DEFAULT_PAYMENT_SYMBOL}
                </strong>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
              >
                List for Sale
              </button>
            </form>
          )}

          {/* STEP 2 — Submitting */}
          {step === STEP.SUBMITTING && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div className="spinner" style={{ margin: '0 auto 16px' }} />
              <p style={{ color: 'var(--text-secondary)' }}>Broadcasting transaction…</p>
            </div>
          )}

          {/* STEP 3 — Done */}
          {step === STEP.DONE && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎊</div>
              <p style={{ marginBottom: 8 }}>
                <strong>{meta?.name || `NFT #${nft.tokenId}`}</strong> is now listed!
              </p>
              {txId && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: 20 }}>
                  Tx: {txId}
                </p>
              )}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
