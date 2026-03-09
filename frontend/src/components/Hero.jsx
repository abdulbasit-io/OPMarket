import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';

const VISUAL_CARDS = [
  { icon: '🎨', label: 'Create', desc: 'Launch collections' },
  { icon: '💎', label: 'Collect', desc: 'Own unique NFTs' },
  { icon: '⚡', label: 'Trade', desc: 'Instant settlement' },
  { icon: '🔒', label: 'Secure', desc: 'Non-custodial' },
];

export default function Hero() {
  const navigate  = useNavigate();
  const { isConnected, connect } = useWallet();

  return (
    <section className="hero">
      {/* Aurora blobs */}
      <div className="hero-aurora" aria-hidden>
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>

      <div className="hero-inner container">
        {/* Left: copy */}
        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge badge-brand">⚡ Built Natively on Bitcoin L1</span>
          </div>

          <h1 className="hero-title">
            Collect, Trade &amp; Launch
            <br />
            NFTs <span className="hero-title-accent">on Bitcoin L1</span>
          </h1>

          <p className="hero-subtitle">
            The first non-custodial NFT marketplace and launchpad built directly
            on Bitcoin Layer 1 through OPNet. No bridges. No sidechains.
            Just Bitcoin.
          </p>

          <div className="hero-cta">
            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate('/marketplace')}
            >
              Explore Marketplace
            </button>
            {!isConnected && (
              <button className="btn btn-ghost btn-lg" onClick={connect}>
                Connect Wallet
              </button>
            )}
            {isConnected && (
              <button
                className="btn btn-ghost btn-lg"
                onClick={() => navigate('/my-nfts')}
              >
                My NFTs
              </button>
            )}
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">BTC L1</span>
              <span className="hero-stat-label">Settlement Layer</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-value">Non-Custodial</span>
              <span className="hero-stat-label">Your keys, your NFTs</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-value">2.5%</span>
              <span className="hero-stat-label">Platform fee</span>
            </div>
          </div>
        </div>

        {/* Right: visual cards */}
        <div className="hero-visual">
          <div className="hero-visual-grid">
            {VISUAL_CARDS.map((c) => (
              <div key={c.label} className="hero-visual-card">
                <div className="hero-visual-icon">{c.icon}</div>
                <div className="hero-visual-label">{c.label}</div>
                <div className="hero-visual-desc">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Wave divider for smooth transition */}
      <div className="hero-divider" aria-hidden>
        <svg viewBox="0 0 1440 60" preserveAspectRatio="none" fill="none">
          <path
            d="M0 60L1440 60L1440 0C1440 0 1080 50 720 50C360 50 0 0 0 0L0 60Z"
            fill="#F2F6FC"
          />
        </svg>
      </div>
    </section>
  );
}
