import { useState, useEffect } from 'react';
import NFTImage from './NFTImage';
import { truncateAddress, formatPrice, toHuman } from '../utils/formatters';
import { getTokenURI, fetchNFTMetadata, getTokenSymbol } from '../utils/contractService';
import { PAYMENT_TOKENS, TOKEN_DECIMALS } from '../utils/constants';
import { useWallet } from '../context/WalletContext';

export default function ListingCard({ listing, onBuy, onCancel }) {
  const { address } = useWallet();
  const [meta,   setMeta]   = useState(null);
  const [symbol, setSymbol] = useState('HODL');
  const [loading, setLoading] = useState(true);

  const isMine = address && listing.seller &&
    listing.seller.toLowerCase() === address.toLowerCase();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Resolve payment token symbol
        const known = PAYMENT_TOKENS[listing.paymentToken];
        if (known) {
          setSymbol(known.symbol);
        } else if (listing.paymentToken) {
          const sym = await getTokenSymbol(listing.paymentToken);
          if (!cancelled) setSymbol(sym);
        }

        // Resolve NFT metadata
        const uri = await getTokenURI(listing.nftContract, listing.tokenId);
        if (uri) {
          const m = await fetchNFTMetadata(uri);
          if (!cancelled) setMeta(m);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [listing.nftContract, listing.tokenId, listing.paymentToken]);

  const decimals = listing.paymentToken
    ? (PAYMENT_TOKENS[listing.paymentToken]?.decimals ?? TOKEN_DECIMALS)
    : TOKEN_DECIMALS;

  return (
    <article className="card listing-card">
      {/* Image */}
      <div className="listing-card-image">
        {loading ? (
          <div className="skeleton" style={{ height: '100%', borderRadius: 'var(--radius)' }} />
        ) : (
          <NFTImage
            src={meta?.image}
            alt={meta?.name || `#${listing.tokenId}`}
            contractAddr={listing.nftContract}
            tokenId={listing.tokenId}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>

      {/* Body */}
      <div className="listing-card-body">
        <div className="listing-card-header">
          <div>
            <div className="listing-card-name">
              {loading
                ? <span className="skeleton" style={{ width: 120, height: 16, display: 'inline-block' }} />
                : (meta?.name || `NFT #${listing.tokenId}`)}
            </div>
            <div className="listing-card-collection">
              {truncateAddress(listing.nftContract)}
            </div>
          </div>
          <span className="badge badge-brand" style={{ fontSize: '0.7rem' }}>
            #{String(listing.tokenId)}
          </span>
        </div>

        <div className="price-row">
          <span className="price-label">Price</span>
          <span className="price-value">
            {toHuman(listing.price, decimals)} <span className="price-symbol">{symbol}</span>
          </span>
        </div>

        {listing.royaltyBps > 0 && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            {(listing.royaltyBps / 100).toFixed(1)}% royalty
          </div>
        )}

        <div className="listing-card-seller">
          Seller: <span className="address-chip">{truncateAddress(listing.seller, 6, 4)}</span>
        </div>

        {/* Actions */}
        <div className="listing-card-actions">
          {isMine ? (
            <button
              className="btn btn-ghost btn-sm"
              style={{ flex: 1, color: 'var(--error)' }}
              onClick={() => onCancel?.(listing)}
            >
              Cancel Listing
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              style={{ flex: 1 }}
              onClick={() => onBuy?.(listing)}
            >
              Buy Now
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
