import { useState, useEffect } from 'react';
import NFTImage from './NFTImage';
import { truncateAddress, toHuman } from '../utils/formatters';
import { getCollection, getTokenSymbol } from '../utils/contractService';
import { PAYMENT_TOKENS, TOKEN_DECIMALS } from '../utils/constants';
import { useWallet } from '../context/WalletContext';

// Module-level cache so all cards for the same collection share one fetch
const _collCache = new Map();

async function cachedGetCollection(id) {
  const key = String(id);
  if (_collCache.has(key)) return _collCache.get(key);
  const p = getCollection(id);
  _collCache.set(key, p);
  return p;
}

export default function ListingCard({ listing, onBuy, onCancel }) {
  const { address } = useWallet();
  const [coll,    setColl]    = useState(null);
  const [symbol,  setSymbol]  = useState('tWBTC');
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

        // Resolve collection metadata for image/name
        const collData = await cachedGetCollection(listing.collectionId);
        if (!cancelled) setColl(collData);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [listing.collectionId, listing.paymentToken]);

  const decimals = PAYMENT_TOKENS[listing.paymentToken]?.decimals ?? TOKEN_DECIMALS;
  const image    = coll?.imageURI || null;
  const name     = coll ? `${coll.name} #${listing.tokenId}` : `Collection ${listing.collectionId} #${listing.tokenId}`;
  const collName = coll?.name || `Collection #${String(listing.collectionId)}`;

  return (
    <article className="card listing-card">
      {/* Image */}
      <div className="listing-card-image">
        {loading ? (
          <div className="skeleton" style={{ height: '100%', borderRadius: 'var(--radius)' }} />
        ) : (
          <NFTImage
            src={image}
            alt={name}
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
                : name}
            </div>
            <div className="listing-card-collection">{collName}</div>
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
