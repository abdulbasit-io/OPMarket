// ═══════════════════════════════════════════════════════════
// FaucetPage — Claim test WBTC (tWBTC) for use on OPMarket
// ═══════════════════════════════════════════════════════════
import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { mintFromFaucet, getTokenBalance } from '../utils/contractService';
import { CONTRACTS, LINKS } from '../utils/constants';
import { toHuman } from '../utils/formatters';

const FAUCET_AMOUNT   = '0.1';  // matches contract FAUCET_AMOUNT (10_000_000 sat)
const TOKEN_DECIMALS  = 8;

export default function FaucetPage() {
  const { isConnected, address, connect } = useWallet();

  const [state,   setState]   = useState('idle'); // idle | loading | done | error
  const [txId,    setTxId]    = useState('');
  const [balance, setBalance] = useState(null);
  const [error,   setError]   = useState('');

  const loadBalance = async () => {
    if (!address || !CONTRACTS.WBTC_TOKEN) return;
    const bal = await getTokenBalance(CONTRACTS.WBTC_TOKEN, address);
    if (bal !== null) setBalance(bal);
  };

  const handleClaim = async () => {
    if (!isConnected || !CONTRACTS.WBTC_TOKEN) return;
    setState('loading');
    setError('');
    try {
      const id = await mintFromFaucet(address);
      setTxId(id);
      setState('done');
      // Refresh balance after block confirmation (~15s)
      setTimeout(() => {
        loadBalance();
        setState('idle');
      }, 15000);
    } catch (e) {
      setError(e.message || 'Faucet call failed');
      setState('error');
      setTimeout(() => setState('idle'), 6000);
    }
  };

  const noWBTC = !CONTRACTS.WBTC_TOKEN;

  return (
    <main className="page-content">
      <div className="container container--sm">
        <div style={{ paddingTop: 48, maxWidth: 560, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🚰</div>
            <h1 className="page-title">Test WBTC Faucet</h1>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 420, margin: '0 auto' }}>
              Get {FAUCET_AMOUNT} tWBTC per claim to use as payment on OPMarket testnet.
            </p>
          </div>

          {/* Main card */}
          <div className="card" style={{ padding: '28px 32px', marginBottom: 24 }}>

            {noWBTC ? (
              <div className="error-banner">
                WBTC contract not configured. Set <code>VITE_WBTC_TOKEN_CONTRACT</code> in your <code>.env</code>.
              </div>
            ) : !isConnected ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
                  Connect your OPWallet to claim test tokens.
                </p>
                <button className="btn btn-primary" style={{ minWidth: 200 }} onClick={connect}>
                  Connect OPWallet
                </button>
              </div>
            ) : (
              <>
                {/* Balance row */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--r-md)',
                  padding: '12px 16px', marginBottom: 24,
                }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Your tWBTC balance</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                    {balance !== null ? `${toHuman(balance, TOKEN_DECIMALS)} tWBTC` : '—'}
                  </div>
                </div>

                {/* Claim button */}
                {state === 'done' ? (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
                    <p style={{ fontWeight: 600, marginBottom: 6 }}>
                      {FAUCET_AMOUNT} tWBTC on its way!
                    </p>
                    {txId && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                        Tx: {txId}
                      </p>
                    )}
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                      Balance will update after the next block (~15s).
                    </p>
                  </div>
                ) : state === 'error' ? (
                  <div className="error-banner" style={{ marginBottom: 16 }}>
                    {error || 'Something went wrong. Try again in a moment.'}
                  </div>
                ) : null}

                {(state === 'idle' || state === 'loading' || state === 'error') && (
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', fontSize: '1rem', padding: '12px' }}
                    onClick={handleClaim}
                    disabled={state === 'loading'}
                  >
                    {state === 'loading' ? 'Claiming…' : `Claim ${FAUCET_AMOUNT} tWBTC`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Info card */}
          <div className="card" style={{ padding: '20px 24px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>How it works</div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Each claim mints <strong style={{ color: 'var(--text-primary)' }}>{FAUCET_AMOUNT} tWBTC</strong> directly to your wallet.</li>
              <li>Use tWBTC to mint NFTs and buy listings on OPMarket testnet.</li>
              <li>The faucet has a hard cap of 21M tWBTC total supply.</li>
              <li>No cooldown — claim as often as you need for testing.</li>
            </ul>

            {CONTRACTS.WBTC_TOKEN && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Token contract</div>
                <code style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>{CONTRACTS.WBTC_TOKEN}</code>
              </div>
            )}

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>Need testnet BTC for gas?</div>
              <a
                href={LINKS.FAUCET}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
              >
                OPNet BTC Faucet ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
