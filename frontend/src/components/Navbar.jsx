import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import WalletButton from './WalletButton';

const LINKS = [
  { to: '/',            label: 'Home'        },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/launch',      label: 'Launch'      },
  { to: '/my-nfts',     label: 'My NFTs'     },
];

export default function Navbar() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="navbar">
      <div className="navbar-inner container">
        {/* Logo */}
        <Link to="/" className="navbar-logo" onClick={() => setMenuOpen(false)}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
            <rect width="28" height="28" rx="8" fill="#0054C2" />
            <path
              d="M7 20L14 8l7 12H7z"
              fill="white"
              fillOpacity="0.9"
            />
            <circle cx="14" cy="8" r="2.5" fill="white" />
          </svg>
          <span>OPMarket</span>
        </Link>

        {/* Desktop nav */}
        <nav className="navbar-links">
          {LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`navbar-link${pathname === to ? ' active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Wallet + hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="navbar-wallet-desktop">
            <WalletButton />
          </div>
          <button
            className="navbar-hamburger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            <span /><span /><span />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="navbar-mobile">
          {LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`navbar-mobile-link${pathname === to ? ' active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
          <div style={{ padding: '8px 0' }}>
            <WalletButton />
          </div>
        </div>
      )}
    </header>
  );
}
