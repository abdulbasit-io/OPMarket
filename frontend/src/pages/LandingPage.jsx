import { useNavigate } from 'react-router-dom';
import Hero from '../components/Hero';
import { PLATFORM_FEE_BPS } from '../utils/constants';

const FEATURES = [
  {
    icon: '₿',
    title: 'True Bitcoin L1',
    body: 'All trades settle on Bitcoin Layer 1 via OPNet smart contracts — no bridges, no sidechains, no wrapped assets.',
  },
  {
    icon: '🔒',
    title: 'Non-Custodial',
    body: 'NFTs stay in your wallet until the moment of sale. The marketplace never holds your assets.',
  },
  {
    icon: '🎨',
    title: 'Creator Royalties',
    body: 'Set permanent on-chain royalties at listing time. Creators earn on every secondary sale, automatically.',
  },
  {
    icon: '⚡',
    title: 'Instant Finality',
    body: 'OPNet transactions finalize as fast as Bitcoin blocks — no layer-2 delays or confirmation games.',
  },
  {
    icon: '💎',
    title: `${(PLATFORM_FEE_BPS / 100).toFixed(1)}% Platform Fee`,
    body: 'One of the lowest fees in the NFT space. More proceeds go directly to creators and sellers.',
  },
  {
    icon: '🌐',
    title: 'Open Standard',
    body: 'OP721-compatible NFT collections. Any OP721 token works with OPMarket out of the box.',
  },
];

const HOW_IT_WORKS = [
  { n: '01', title: 'Connect OPWallet',    body: 'Install OPWallet and connect to get your opt1... Bitcoin address.'  },
  { n: '02', title: 'Browse or List',      body: 'Explore active listings or list your OP721 NFTs in seconds.'       },
  { n: '03', title: 'Approve & Transact', body: 'Approve the marketplace once per collection, then buy or sell.'    },
  { n: '04', title: 'Settle on Bitcoin',   body: 'The transaction is recorded permanently on Bitcoin Layer 1.'        },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <main>
      <Hero />

      {/* Features */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Why Choose OPMarket?</h2>
            <p className="section-subtitle">
              Built for collectors, creators, and traders who demand true Bitcoin-native ownership.
            </p>
          </div>
          <div className="features-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="card feature-card">
                <div className="feature-icon">{f.icon}</div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section section-alt">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">Four simple steps to trade on Bitcoin.</p>
          </div>
          <div className="how-grid">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.n} className="how-step">
                <div className="how-step-number">{step.n}</div>
                <h3 className="how-step-title">{step.title}</h3>
                <p className="how-step-body">{step.body}</p>
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="how-step-arrow" aria-hidden>→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="section">
        <div className="container">
          <div className="cta-banner">
            <h2 className="cta-title">Start Trading Bitcoin NFTs Today</h2>
            <p className="cta-body">
              Browse the marketplace, list your collection, or launch a new drop — all settled on Bitcoin L1.
            </p>
            <div className="cta-actions">
              <button
                className="btn btn-primary btn-lg"
                onClick={() => navigate('/marketplace')}
              >
                Open Marketplace
              </button>
              <a
                href="https://faucet.opnet.org"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-lg"
              >
                Get Testnet Tokens
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
