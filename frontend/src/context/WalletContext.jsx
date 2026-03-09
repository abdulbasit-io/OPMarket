// ═══════════════════════════════════════════════════════════
// OPMarket — Wallet Context
// ═══════════════════════════════════════════════════════════
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { LINKS, NETWORK } from '../utils/constants';
import { getBalance as providerGetBalance } from '../utils/opnetProvider';
import { getTokenBalance } from '../utils/contractService';
import { CONTRACTS } from '../utils/constants';

const WalletContext = createContext(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}

export function WalletProvider({ children }) {
  const [isConnected,     setIsConnected]     = useState(false);
  const [address,         setAddress]         = useState('');
  const [btcBalance,      setBtcBalance]      = useState(0);
  const [hodlBalance,     setHodlBalance]     = useState(null);  // BigInt | null
  const [isConnecting,    setIsConnecting]    = useState(false);
  const [showInstall,     setShowInstall]     = useState(false);

  const isOPWalletAvailable = () =>
    typeof window !== 'undefined' && !!window.opnet;

  // ── Fetch HODL token balance ───────────────────────────
  const fetchHODLBalance = useCallback(async (addr) => {
    if (!addr || !CONTRACTS.HODL_TOKEN) return;
    try {
      const bal = await getTokenBalance(CONTRACTS.HODL_TOKEN, addr);
      if (bal !== null) setHodlBalance(bal);
    } catch {
      // non-fatal
    }
  }, []);

  // ── Restore session on mount ───────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('opmarket_wallet');
    if (!saved) return;
    try {
      const data = JSON.parse(saved);
      setIsConnected(true);
      setAddress(data.address);
      setBtcBalance(data.btcBalance || 0);
      fetchHODLBalance(data.address);
    } catch {
      localStorage.removeItem('opmarket_wallet');
    }
  }, [fetchHODLBalance]);

  // ── Connect ────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!isOPWalletAvailable()) {
      setShowInstall(true);
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await window.opnet.requestAccounts();
      if (!accounts?.length) return;
      const addr = accounts[0];

      let btcBal = 0;
      try {
        const wb = await window.opnet.getBalance();
        if (wb?.confirmed !== undefined) btcBal = wb.confirmed / 1e8;
      } catch {
        try {
          const pb = await providerGetBalance(addr);
          if (pb !== null) btcBal = Number(pb) / 1e8;
        } catch { /* ignore */ }
      }

      setAddress(addr);
      setBtcBalance(btcBal);
      setIsConnected(true);
      fetchHODLBalance(addr);

      localStorage.setItem('opmarket_wallet', JSON.stringify({
        address: addr,
        btcBalance: btcBal,
      }));
    } catch (err) {
      console.error('[OPMarket] wallet connect failed:', err);
      setShowInstall(true);
    } finally {
      setIsConnecting(false);
    }
  }, [fetchHODLBalance]);

  // ── Disconnect ─────────────────────────────────────────
  const disconnect = useCallback(() => {
    setIsConnected(false);
    setAddress('');
    setBtcBalance(0);
    setHodlBalance(null);
    localStorage.removeItem('opmarket_wallet');
  }, []);

  // ── Refresh balances ───────────────────────────────────
  const refreshBalance = useCallback(async () => {
    if (!isConnected || !address) return;
    try {
      if (isOPWalletAvailable()) {
        const wb = await window.opnet.getBalance();
        if (wb?.confirmed !== undefined) setBtcBalance(wb.confirmed / 1e8);
      }
      await fetchHODLBalance(address);
    } catch { /* ignore */ }
  }, [isConnected, address, fetchHODLBalance]);

  const value = {
    isConnected,
    isConnecting,
    address,
    btcBalance,
    hodlBalance,
    connect,
    disconnect,
    refreshBalance,
    isOPWalletInstalled: isOPWalletAvailable(),
  };

  return (
    <WalletContext.Provider value={value}>
      {children}

      {showInstall && (
        <div className="modal-overlay" onClick={() => setShowInstall(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">OPWallet Required</h3>
              <button className="modal-close" onClick={() => setShowInstall(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔑</div>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
                OPMarket requires <strong style={{ color: 'var(--brand)' }}>OPWallet</strong> to
                interact with the Bitcoin L1. Install the browser extension to get started.
              </p>
              <a
                href={LINKS.OPWALLET}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
              >
                Install OPWallet
              </a>
              <button
                className="btn btn-ghost"
                onClick={() => setShowInstall(false)}
                style={{ width: '100%' }}
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </WalletContext.Provider>
  );
}
