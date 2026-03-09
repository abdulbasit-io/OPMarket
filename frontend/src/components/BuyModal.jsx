// ═══════════════════════════════════════════════════════════
// BuyModal — two-step: approve token → buy
// ═══════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import {
  getTokenAllowance,
  approveTokenForMarketplace,
  buyNFT,
  getTokenSymbol,
  fetchNFTMetadata,
  getTokenURI,
} from '../utils/contractService';
import { CONTRACTS, PAYMENT_TOKENS, TOKEN_DECIMALS } from '../utils/constants';
import { toHuman, truncateAddress } from '../utils/formatters';
import NFTImage from './NFTImage';

const STEP = { IDLE: 0, APPROVE: 1, BUY: 2, DONE: 3 };

export default function BuyModal({ listing, onClose, onSuccess }) {
  const { address, refreshBalance } = useWallet();

  const [meta,     setMeta]     = useState(null);
  const [symbol,   setSymbol]   = useState('HODL');
  const [decimals, setDecimals] = useState(TOKEN_DECIMALS);
  const [step,     setStep]     = useState(STEP.IDLE);
  const [txId,     setTxId]     = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);

  // Resolve metadata + allowance on mount
  useEffect(() => {
    if (!listing) return;
    (async () => {
      const known = PAYMENT_TOKENS[listing.paymentToken];
      const sym = known?.symbol ?? await getTokenSymbol(listing.paymentToken);
      const dec = known?.decimals ?? TOKEN_DECIMALS;
      setSymbol(sym);
      setDecimals(dec);

      const uri = await getTokenURI(listing.nftContract, listing.tokenId);
      if (uri) {
        const m = await fetchNFTMetadata(uri);
        setMeta(m);
      }

      if (address && listing.paymentToken) {
        const allowance = await getTokenAllowance(
          listing.paymentToken, address, CONTRACTS.MARKETPLACE,
        );
        setNeedsApproval(allowance < listing.price);
      }
    })();
  }, [listing, address]);

  if (!listing) return null;

  const handleApprove = async () => {
    setError('');
    setLoading(true);
    try {
      await approveTokenForMarketplace(
        listing.paymentToken,
        listing.price,
        address,
      );
      setNeedsApproval(false);
      setStep(STEP.BUY);
    } catch (e) {
      setError(e.message || 'Approval failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = async () => {
    setError('');
    setLoading(true);
    try {
      const id = await buyNFT(address, listing.id);
      setTxId(id);
      setStep(STEP.DONE);
      await refreshBalance();
      onSuccess?.(id);
    } catch (e) {
      setError(e.message || 'Purchase failed');
    } finally {
      setLoading(false);
    }
  };

  const currentStep = needsApproval ? 1 : 2;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {step === STEP.DONE ? 'Purchase Complete!' : 'Buy NFT'}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {step !== STEP.DONE && (
            <>
              {/* NFT preview */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                <div style={{ width: 80, height: 80, borderRadius: 'var(--radius)', overflow: 'hidden', flexShrink: 0 }}>
                  <NFTImage
                    src={meta?.image}
                    contractAddr={listing.nftContract}
                    tokenId={listing.tokenId}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {meta?.name || `NFT #${listing.tokenId}`}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    {truncateAddress(listing.nftContract)}
                  </div>
                  <div className="price-row" style={{ marginTop: 8 }}>
                    <span className="price-value">
                      {toHuman(listing.price, decimals)} {symbol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Step bar */}
              {needsApproval && (
                <div className="step-bar" style={{ marginBottom: 20 }}>
                  <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
                    <div className="step-circle">1</div>
                    <div className="step-label">Approve Token</div>
                  </div>
                  <div className="step-line" />
                  <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
                    <div className="step-circle">2</div>
                    <div className="step-label">Confirm Buy</div>
                  </div>
                </div>
              )}

              {error && (
                <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>
              )}

              {!address ? (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                  Connect your wallet to purchase this NFT.
                </p>
              ) : needsApproval ? (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 16 }}>
                    First, approve the marketplace to spend your {symbol} tokens for this purchase.
                  </p>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={handleApprove}
                    disabled={loading}
                  >
                    {loading ? 'Approving…' : `Approve ${symbol}`}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 16 }}>
                    Confirm the purchase. Your {symbol} will be transferred to the seller.
                  </p>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={handleBuy}
                    disabled={loading}
                  >
                    {loading ? 'Processing…' : 'Confirm Purchase'}
                  </button>
                </>
              )}
            </>
          )}

          {step === STEP.DONE && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎉</div>
              <p style={{ marginBottom: 8 }}>
                <strong>{meta?.name || `NFT #${listing.tokenId}`}</strong> is yours!
              </p>
              {txId && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: 20 }}>
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
