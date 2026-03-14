import { Link } from 'react-router-dom';
import NFTImage from './NFTImage';
import { toHuman } from '../utils/formatters';
import { TOKEN_DECIMALS } from '../utils/constants';

function MintProgress({ minted, maxSupply }) {
  const pct = maxSupply > 0n ? Number((minted * 100n) / maxSupply) : 0;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <span>{minted.toLocaleString()} minted</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand)', borderRadius: 99 }} />
      </div>
      <div style={{ textAlign: 'right', marginTop: 4, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        of {maxSupply.toLocaleString()} max
      </div>
    </div>
  );
}

export default function CollectionCard({ collection, symbol = 'tokens', decimals = TOKEN_DECIMALS }) {
  return (
    <article className="card listing-card">
      {/* Image */}
      <div className="listing-card-image">
        <NFTImage
          src={collection.imageURI}
          alt={collection.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {/* Body */}
      <div className="listing-card-body">
        <div className="listing-card-header">
          <div>
            <div className="listing-card-name" style={{ marginBottom: 2 }}>
              {collection.name || `Collection #${collection.id}`}
            </div>
            <div className="listing-card-collection">
              {collection.symbol}
            </div>
          </div>
          <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
            #{String(collection.id)}
          </span>
        </div>

        <div className="price-row" style={{ marginTop: 12 }}>
          <span className="price-label">Mint Price</span>
          <span className="price-value">
            {toHuman(collection.mintPrice, decimals)} <span className="price-symbol">{symbol}</span>
          </span>
        </div>

        <MintProgress minted={collection.minted} maxSupply={collection.maxSupply} />

        <div className="listing-card-actions" style={{ marginTop: 16 }}>
          <Link
            to={`/collection/${collection.id}`}
            className="btn btn-primary btn-sm"
            style={{ width: '100%', textAlign: 'center' }}
          >
            View Collection
          </Link>
        </div>
      </div>
    </article>
  );
}
