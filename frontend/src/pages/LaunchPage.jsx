// ═══════════════════════════════════════════════════════════
// LaunchPage — Register a collection on NFTLaunchpad
// ═══════════════════════════════════════════════════════════
//
// No NFT contract needed. Just fill in metadata + mint settings.
// The launchpad tracks ownership internally.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { registerCollection } from '../utils/contractService';
import { getBlockNumber } from '../utils/opnetProvider';
import { CONTRACTS, TOKEN_DECIMALS } from '../utils/constants';
import { toRaw } from '../utils/formatters';

// OPNet testnet: ~10 s/block → 360 blocks/hr
const BLOCKS_PER_HOUR = 360;

const DURATION_PRESETS = [
  { label: '1h',     hours: 1   },
  { label: '6h',     hours: 6   },
  { label: '12h',    hours: 12  },
  { label: '24h',    hours: 24  },
  { label: '48h',    hours: 48  },
  { label: '72h',    hours: 72  },
  { label: 'Custom', hours: null },
];

// Token choices — shown as a selector on the form
const TOKEN_OPTIONS = [
  ...(CONTRACTS.WBTC_TOKEN ? [{ label: 'tWBTC', address: CONTRACTS.WBTC_TOKEN }] : []),
  { label: 'Custom', address: '' },
];

const DEFAULT_TOKEN = TOKEN_OPTIONS[0] ?? { label: 'Custom', address: '' };

const EMPTY_FORM = {
  name:          '',
  symbol:        '',
  imageURI:      '',
  maxSupply:     '1000',
  mintPrice:     '0',
  durationHours: '24',
  royaltyPct:    '5',
  maxPerWallet:  '0',
  // Token selector
  tokenChoice:   DEFAULT_TOKEN.label,   // 'tWBTC' | 'Custom'
  customToken:   '',
};

export default function LaunchPage() {
  const { isConnected, address, connect } = useWallet();

  const [form,         setForm]         = useState(EMPTY_FORM);
  const [currentBlock, setCurrentBlock] = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [result,       setResult]       = useState(null); // { txId, collectionId }

  useEffect(() => {
    getBlockNumber().then(n => { if (n) setCurrentBlock(Number(n)); });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedToken = TOKEN_OPTIONS.find(t => t.label === form.tokenChoice) ?? TOKEN_OPTIONS[0];
  const paymentTokenAddr = form.tokenChoice === 'Custom'
    ? form.customToken
    : selectedToken.address;
  const paymentSymbol = form.tokenChoice === 'Custom' ? 'tokens' : form.tokenChoice;

  const durationBlocks = Math.ceil(Number(form.durationHours || 0) * BLOCKS_PER_HOUR);
  const startBlock = (currentBlock || 0) + 2;
  const endBlock   = startBlock + durationBlocks;

  const handleLaunch = async () => {
    setError('');
    if (!form.name)   return setError('Collection name is required.');
    if (!form.symbol) return setError('Symbol is required.');
    if (Number(form.maxSupply) <= 0) return setError('Max supply must be > 0.');
    if (Number(form.durationHours) <= 0) return setError('Duration must be > 0.');
    if (Number(form.royaltyPct) > 10) return setError('Royalty cannot exceed 10%.');
    if (!paymentTokenAddr) return setError('Payment token address is required.');
    if (!CONTRACTS.LAUNCHPAD) return setError('VITE_LAUNCHPAD_CONTRACT not set in .env');

    setLoading(true);
    try {
      // Re-fetch block number at launch time in case page-load fetch failed
      let block = currentBlock;
      if (!block) {
        block = await getBlockNumber();
        if (block) setCurrentBlock(Number(block));
      }
      if (!block) throw new Error('Could not fetch current block. Check your connection and try again.');

      const dBlocks   = Math.ceil(Number(form.durationHours || 0) * BLOCKS_PER_HOUR);
      const sBlock    = Number(block) + 2;
      const eBlock    = sBlock + dBlocks;

      const mintPriceRaw = toRaw(form.mintPrice || '0', TOKEN_DECIMALS);
      const royaltyBps   = Math.round(Number(form.royaltyPct) * 100);

      const { txId, collectionId } = await registerCollection(address, {
        name:         form.name,
        symbol:       form.symbol.toUpperCase(),
        imageURI:     form.imageURI || '',
        maxSupply:    form.maxSupply,
        mintPrice:    mintPriceRaw,
        paymentToken: paymentTokenAddr,
        startBlock:   sBlock,
        endBlock:     eBlock,
        royaltyBps:   royaltyBps,
        maxPerWallet: form.maxPerWallet || 0,
      });

      setResult({ txId, collectionId });
    } catch (e) {
      setError(e.message || 'Launch failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <main className="page-content">
        <div className="container container--sm">
          <div className="empty-state" style={{ paddingTop: 80 }}>
            <div className="empty-icon">🔑</div>
            <h3 className="empty-title">Connect your wallet</h3>
            <p className="empty-desc">Connect OPWallet to launch a collection.</p>
            <button className="btn btn-primary" onClick={connect}>Connect OPWallet</button>
          </div>
        </div>
      </main>
    );
  }

  if (result) {
    return (
      <main className="page-content">
        <div className="container container--sm">
          <div className="card" style={{ padding: '32px', maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🚀</div>
            <h2 style={{ marginBottom: 8 }}>Collection Launched!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              <strong>{form.name}</strong> is registered and live. Buyers can now mint during the window.
            </p>

            {result.collectionId !== null && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, textAlign: 'left' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Collection ID</div>
                <code style={{ fontSize: '1.1rem', color: 'var(--brand-light)', fontWeight: 700 }}>
                  #{String(result.collectionId)}
                </code>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
                  Save this ID — buyers use it to mint and it identifies your collection everywhere.
                </div>
              </div>
            )}

            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', textAlign: 'left', marginBottom: 24 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Transaction ID</div>
              <code style={{ wordBreak: 'break-all', fontSize: '0.75rem' }}>{result.txId}</code>
            </div>

            <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '12px 16px', textAlign: 'left', marginBottom: 24, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Mint window:</strong> blocks #{startBlock.toLocaleString()} → #{endBlock.toLocaleString()}
              {' '}(~{form.durationHours}h from now).
              After the window closes, visit your collection page to <strong>Withdraw</strong> your {paymentSymbol} proceeds.
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {result.collectionId !== null && (
                <Link to={`/collection/${result.collectionId}`} className="btn btn-primary">
                  View Collection →
                </Link>
              )}
              <button className="btn btn-ghost" onClick={() => { setResult(null); setForm(EMPTY_FORM); }}>
                Launch Another
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const field = (label, key, placeholder, hint, extra = {}) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        placeholder={placeholder}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        {...extra}
      />
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );

  return (
    <main className="page-content">
      <div className="container container--sm">
        <div className="page-header">
          <div>
            <h1 className="page-title">Launch a Collection</h1>
            <p className="page-subtitle">
              No contract deployment needed. Fill in your collection details and go live instantly.
            </p>
          </div>
        </div>

        <div className="card" style={{ padding: '28px 32px', maxWidth: 680, margin: '0 auto' }}>
          {error && (
            <div className="error-banner" style={{ marginBottom: 20 }}>
              {error}
              <button style={{ marginLeft: 'auto' }} onClick={() => setError('')}>✕</button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Collection Identity ────────────────────── */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
                Collection Identity
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                {field('Name *', 'name', 'e.g. Bitcoin Punks', '')}
                {field('Symbol *', 'symbol', 'e.g. PUNK', '')}
              </div>
              {field('Image URI', 'imageURI', 'https://... or ipfs://...', 'URL pointing to your collection image or metadata folder.')}
            </div>

            {/* ── Mint Settings ──────────────────────────── */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
                Mint Settings
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {field('Max Supply *', 'maxSupply', '1000', '', { type: 'number', min: 1 })}
                {field('Max Per Wallet', 'maxPerWallet', '0 = unlimited', '', { type: 'number', min: 0 })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {field(`Mint Price (${paymentSymbol})`, 'mintPrice', '0 = free mint', '0 = free mint', { type: 'number', min: 0, step: 'any' })}
                {field('Royalty % (max 10%)', 'royaltyPct', '5', 'On secondary sales', { type: 'number', min: 0, max: 10, step: 0.1 })}
              </div>
            </div>

            {/* ── Mint Window ────────────────────────────── */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Mint Window
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {DURATION_PRESETS.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    className={`btn btn-ghost${
                      p.hours !== null && form.durationHours === String(p.hours) ? ' btn-ghost--active' : ''
                    }`}
                    style={{ padding: '4px 14px', fontSize: '0.8rem' }}
                    onClick={() => p.hours !== null && set('durationHours', String(p.hours))}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                type="number" min="0.1" step="0.5"
                className="form-input"
                placeholder="Hours"
                value={form.durationHours}
                onChange={e => set('durationHours', e.target.value)}
              />
              {currentBlock && form.durationHours && Number(form.durationHours) > 0 && (
                <div className="form-hint">
                  Starts at block #{startBlock.toLocaleString()}, ends at #{endBlock.toLocaleString()}
                  {' '}(~{form.durationHours}h · {durationBlocks.toLocaleString()} blocks)
                </div>
              )}
            </div>

            {/* ── Payment Token ──────────────────────────── */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Payment Token
              </div>

              {/* Token selector pills */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {TOKEN_OPTIONS.map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    className={`btn btn-ghost${form.tokenChoice === opt.label ? ' btn-ghost--active' : ''}`}
                    style={{ padding: '6px 18px', fontSize: '0.85rem' }}
                    onClick={() => set('tokenChoice', opt.label)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Custom address input */}
              {form.tokenChoice === 'Custom' ? (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <input
                    className="form-input"
                    placeholder="0x contract hash or opt1s... address"
                    value={form.customToken}
                    onChange={e => set('customToken', e.target.value)}
                  />
                  <div className="form-hint">
                    Any OP20 token. Use its <code>0x</code> contract hash from the OPNet explorer.
                  </div>
                </div>
              ) : (
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  padding: '10px 14px',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  wordBreak: 'break-all',
                }}>
                  {selectedToken.address || 'Not configured'}
                </div>
              )}

              {/* tWBTC faucet hint */}
              {form.tokenChoice === 'tWBTC' && (
                <div style={{
                  marginTop: 10,
                  padding: '10px 14px',
                  background: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.2)',
                  borderRadius: 'var(--r-md)',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}>
                  <span>Buyers pay with tWBTC. Get test tokens before minting.</span>
                  <Link to="/faucet" className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
                    Get tWBTC →
                  </Link>
                </div>
              )}
            </div>

            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              onClick={handleLaunch}
              disabled={loading}
            >
              {loading ? 'Launching…' : 'Launch Collection'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
