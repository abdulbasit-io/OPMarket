// ═══════════════════════════════════════════════════════════
// LaunchPage — NFT Collection Launch Wizard
// ═══════════════════════════════════════════════════════════
//
// Wizard steps:
//   1. CONFIG  — enter deployed BaseNFT address + mint settings
//   2. REGISTER — call launchpad.register()
//   3. SET_MINTER — call nftContract.setMinter(launchpadAddress)
//   4. DONE
//
// Prerequisites (user must have done before starting):
//   - Deployed a BaseNFT contract via `opnet deploy`
//   - Have the contract address ready (opt1...)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import {
  registerCollection,
  setNFTMinter,
  getNFTName,
} from '../utils/contractService';
import { getBlockNumber } from '../utils/opnetProvider';
import { CONTRACTS, DEFAULT_PAYMENT_TOKEN, DEFAULT_PAYMENT_SYMBOL, TOKEN_DECIMALS } from '../utils/constants';
import { toRaw } from '../utils/formatters';

const STEP = { CONFIG: 0, REGISTER: 1, SET_MINTER: 2, DONE: 3 };

const STEP_LABELS = ['Configure', 'Register', 'Set Minter', 'Done'];

function StepBar({ current }) {
  return (
    <div className="step-bar" style={{ marginBottom: 32 }}>
      {STEP_LABELS.map((label, i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEP_LABELS.length - 1 ? 1 : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={`step-circle ${i < current ? 'done' : i === current ? 'active' : ''}`}
              style={i < current ? {
                background: 'rgba(0,84,194,0.2)',
                borderColor: 'var(--brand-mid)',
                color: 'var(--brand-pale)',
                width: 28, height: 28, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-sm)',
                fontWeight: 700, border: '1px solid', flexShrink: 0
              } : undefined}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <span className={`step-label ${i === current ? 'active' : i < current ? 'done' : ''}`}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && <div className="step-line" style={{ flex: 1, margin: '0 12px' }} />}
        </div>
      ))}
    </div>
  );
}

// Blocks per hour on OPNet testnet (~10 s/block → 360 blocks/hr)
const BLOCKS_PER_HOUR = 360;

const DURATION_PRESETS = [
  { label: '1 hour',   hours: 1   },
  { label: '6 hours',  hours: 6   },
  { label: '12 hours', hours: 12  },
  { label: '24 hours', hours: 24  },
  { label: '48 hours', hours: 48  },
  { label: '72 hours', hours: 72  },
  { label: 'Custom',   hours: null },
];

const EMPTY_FORM = {
  nftContract:   '',
  mintPrice:     '',
  paymentToken:  DEFAULT_PAYMENT_TOKEN,
  maxSupply:     '',
  durationHours: '24',
  royaltyPct:    '0',
  maxPerWallet:  '0',
};

export default function LaunchPage() {
  const navigate = useNavigate();
  const { isConnected, address, connect } = useWallet();

  const [step,         setStep]         = useState(STEP.CONFIG);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [collName,     setCollName]     = useState('');
  const [currentBlock, setCurrentBlock] = useState(null);
  const [registerTx,   setRegisterTx]   = useState('');
  const [minterTx,     setMinterTx]     = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  // Load current block for hints
  useEffect(() => {
    getBlockNumber().then(n => { if (n) setCurrentBlock(Number(n)); });
  }, []);

  // Resolve NFT name when address is entered
  useEffect(() => {
    if (!form.nftContract || form.nftContract.length < 20) { setCollName(''); return; }
    const t = setTimeout(async () => {
      const name = await getNFTName(form.nftContract);
      setCollName(name || '');
    }, 600);
    return () => clearTimeout(t);
  }, [form.nftContract]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  // ── Step 1: Register ─────────────────────────────────────
  const handleRegister = async () => {
    setError('');

    if (!form.nftContract) return setError('Enter your deployed NFT contract address.');
    if (!form.mintPrice || Number(form.mintPrice) < 0) return setError('Enter a valid mint price (0 = free).');
    if (!form.maxSupply || Number(form.maxSupply) <= 0) return setError('Max supply must be > 0.');
    if (!form.durationHours || Number(form.durationHours) <= 0) return setError('Enter a mint duration greater than 0.');
    if (Number(form.royaltyPct) > 10) return setError('Royalty cannot exceed 10%.');
    if (!CONTRACTS.LAUNCHPAD) return setError('VITE_LAUNCHPAD_CONTRACT not set in .env');
    if (!currentBlock) return setError('Could not fetch current block number. Check your connection.');

    setLoading(true);
    try {
      const mintPriceRaw    = toRaw(form.mintPrice, TOKEN_DECIMALS);
      const royaltyBps      = Math.round(Number(form.royaltyPct) * 100);
      const maxPerWallet    = Number(form.maxPerWallet) || 0;
      const durationBlocks  = Math.ceil(Number(form.durationHours) * BLOCKS_PER_HOUR);
      const startBlock      = currentBlock + 2; // small buffer for tx inclusion
      const endBlock        = startBlock + durationBlocks;

      const txId = await registerCollection(
        address,
        form.nftContract,
        mintPriceRaw,
        form.paymentToken,
        BigInt(form.maxSupply),
        BigInt(startBlock),
        BigInt(endBlock),
        BigInt(royaltyBps),
        BigInt(maxPerWallet),
      );
      setRegisterTx(txId);
      setStep(STEP.SET_MINTER);
    } catch (e) {
      setError(e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Set minter ───────────────────────────────────
  const handleSetMinter = async () => {
    setError('');
    if (!CONTRACTS.LAUNCHPAD) return setError('VITE_LAUNCHPAD_CONTRACT not set in .env');
    setLoading(true);
    try {
      const txId = await setNFTMinter(form.nftContract, address, CONTRACTS.LAUNCHPAD);
      setMinterTx(txId);
      setStep(STEP.DONE);
    } catch (e) {
      setError(e.message || 'Set minter failed');
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

  return (
    <main className="page-content">
      <div className="container container--sm">
        <div className="page-header">
          <div>
            <h1 className="page-title">Launch a Collection</h1>
            <p className="page-subtitle">Register your OP721 collection with the launchpad.</p>
          </div>
        </div>

        {/* Prerequisites notice */}
        <div className="info-banner" style={{ marginBottom: 24 }}>
          <strong>Before you start:</strong> Deploy your <code>BaseNFT</code> contract using the
          OPNet CLI (<code>opnet deploy --target nft</code>), then paste the resulting contract
          address below. The wizard handles registration and minter setup.
        </div>

        <div className="card" style={{ padding: '28px 32px', maxWidth: 680, margin: '0 auto' }}>
          <StepBar current={step} />

          {error && (
            <div className="error-banner" style={{ marginBottom: 20 }}>
              {error}
              <button style={{ marginLeft: 'auto' }} onClick={() => setError('')}>✕</button>
            </div>
          )}

          {/* ── STEP 0: CONFIG ─────────────────────────────── */}
          {step === STEP.CONFIG && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="form-group">
                <label className="form-label">NFT Contract Address *</label>
                <input
                  className="form-input"
                  placeholder="opt1s..."
                  value={form.nftContract}
                  onChange={e => set('nftContract', e.target.value.trim())}
                />
                {collName && (
                  <div className="form-hint" style={{ color: 'var(--brand-light)' }}>
                    Resolved: <strong>{collName}</strong>
                  </div>
                )}
                <div className="form-hint">Address of your deployed BaseNFT contract.</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Mint Price ({DEFAULT_PAYMENT_SYMBOL}) *</label>
                  <input
                    type="number" min="0" step="any"
                    className="form-input"
                    placeholder="e.g. 100"
                    value={form.mintPrice}
                    onChange={e => set('mintPrice', e.target.value)}
                  />
                  <div className="form-hint">0 = free mint</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Max Supply *</label>
                  <input
                    type="number" min="1" step="1"
                    className="form-input"
                    placeholder="e.g. 1000"
                    value={form.maxSupply}
                    onChange={e => set('maxSupply', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Mint Duration *</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {DURATION_PRESETS.map(p => (
                    <button
                      key={p.label}
                      type="button"
                      className={`btn btn-ghost${
                        (p.hours !== null && form.durationHours === String(p.hours)) ||
                        (p.hours === null && !DURATION_PRESETS.some(x => x.hours !== null && String(x.hours) === form.durationHours))
                          ? ' btn-ghost--active' : ''
                      }`}
                      style={{ padding: '4px 12px', fontSize: '0.8rem' }}
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
                    Current block #{currentBlock.toLocaleString()} — mint runs for ~{form.durationHours}h
                    (blocks #{(currentBlock + 2).toLocaleString()} → #{(currentBlock + 2 + Math.ceil(Number(form.durationHours) * BLOCKS_PER_HOUR)).toLocaleString()})
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Royalty % (max 10%)</label>
                  <input
                    type="number" min="0" max="10" step="0.1"
                    className="form-input"
                    placeholder="0"
                    value={form.royaltyPct}
                    onChange={e => set('royaltyPct', e.target.value)}
                  />
                  <div className="form-hint">Paid to you on secondary sales.</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Max Per Wallet</label>
                  <input
                    type="number" min="0" step="1"
                    className="form-input"
                    placeholder="0 = unlimited"
                    value={form.maxPerWallet}
                    onChange={e => set('maxPerWallet', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Payment Token</label>
                <input
                  className="form-input"
                  placeholder={`Default: ${DEFAULT_PAYMENT_SYMBOL} (${DEFAULT_PAYMENT_TOKEN})`}
                  value={form.paymentToken}
                  onChange={e => set('paymentToken', e.target.value.trim() || DEFAULT_PAYMENT_TOKEN)}
                />
                <div className="form-hint">OP20 contract address used for mint payment.</div>
              </div>

              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%', marginTop: 8 }}
                onClick={handleRegister}
                disabled={loading}
              >
                {loading ? 'Registering…' : 'Register Collection'}
              </button>
            </div>
          )}

          {/* ── STEP 1: SET MINTER ─────────────────────────── */}
          {step === STEP.SET_MINTER && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="alert alert-success">
                Collection registered successfully!
                {registerTx && (
                  <div style={{ marginTop: 6, fontSize: '0.75rem', wordBreak: 'break-all' }}>
                    Tx: {registerTx}
                  </div>
                )}
              </div>

              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: '16px 20px',
                fontSize: '0.875rem',
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
              }}>
                <strong style={{ color: 'var(--text-primary)' }}>Final step:</strong> Grant the
                launchpad contract permission to mint NFTs on behalf of buyers. This calls{' '}
                <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>
                  setMinter
                </code>{' '}
                on your NFT contract, pointing to the launchpad address.
                <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--brand-pale)' }}>
                  Launchpad: {CONTRACTS.LAUNCHPAD || '(not set)'}
                </div>
              </div>

              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                onClick={handleSetMinter}
                disabled={loading}
              >
                {loading ? 'Setting Minter…' : 'Grant Minter Role'}
              </button>
            </div>
          )}

          {/* ── STEP 2: DONE ───────────────────────────────── */}
          {step === STEP.DONE && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🚀</div>
              <h2 style={{ fontWeight: 800, marginBottom: 8 }}>Collection is Live!</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.7 }}>
                {collName && <strong style={{ color: 'var(--text-primary)' }}>{collName}</strong>} is
                registered and ready for minting.
              </p>
              {minterTx && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 24 }}>
                  Minter tx: {minterTx}
                </p>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => navigate(`/collection/${form.nftContract}`)}
                >
                  View Collection
                </button>
                <button
                  className="btn btn-ghost btn-lg"
                  onClick={() => { setStep(STEP.CONFIG); setForm(EMPTY_FORM); setRegisterTx(''); setMinterTx(''); }}
                >
                  Launch Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
