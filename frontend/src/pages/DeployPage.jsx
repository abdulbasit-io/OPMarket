// ═══════════════════════════════════════════════════════════
// DeployPage — Deploy a BaseNFT contract via OPWallet
// ═══════════════════════════════════════════════════════════
import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { BinaryWriter } from '@btc-vision/transaction';
import { TransactionFactory } from '@btc-vision/transaction';
import { getNetworkConfig, getProvider } from '../utils/opnetProvider';

// Import the compiled WASM as a URL — Vite serves it as a static asset
import baseNFTWasmUrl from '../../../contracts/build/BaseNFT.wasm?url';

async function fetchWasm() {
  const res = await fetch(baseNFTWasmUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function encodeCalldata({ name, symbol, baseURI, maxSupply, icon, banner, website, description, maxPerWallet }) {
  const w = new BinaryWriter();
  w.writeStringWithLength(name);
  w.writeStringWithLength(symbol);
  w.writeStringWithLength(baseURI);
  w.writeU256(BigInt(maxSupply));
  w.writeStringWithLength(icon);
  w.writeStringWithLength(banner);
  w.writeStringWithLength(website);
  w.writeStringWithLength(description);
  w.writeU256(BigInt(maxPerWallet || 0));
  return w.getBuffer();
}

const DEFAULTS = {
  name:         '',
  symbol:       '',
  baseURI:      '',
  maxSupply:    '1000',
  icon:         '',
  banner:       '',
  website:      '',
  description:  '',
  maxPerWallet: '0',
};

export default function DeployPage() {
  const { isConnected, connect, address } = useWallet();
  const [form,     setForm]     = useState(DEFAULTS);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [result,   setResult]   = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleDeploy = async () => {
    setError('');
    if (!form.name)   return setError('Collection name is required.');
    if (!form.symbol) return setError('Symbol is required.');
    if (!Number(form.maxSupply) > 0) return setError('Max supply must be > 0.');
    if (!window.opnet?.web3) return setError('OPWallet not detected.');

    setLoading(true);
    try {
      const bytecode = await fetchWasm();
      const calldata = encodeCalldata(form);
      const network  = getNetworkConfig();
      const provider = getProvider();

      const utxos = await provider.utxoManager.getUTXOs({ address });
      if (!utxos?.length) throw new Error('No UTXOs found for your wallet. Make sure your wallet is funded.');

      const factory = new TransactionFactory();
      const res = await factory.signDeployment({
        bytecode,
        calldata,
        network,
        utxos,
        feeRate:     10,
        priorityFee: 10000n,
        gasSatFee:   10000n,
      });

      setResult({
        txId:     res.transactionId ?? res.transaction?.[1] ?? '(check wallet)',
        address:  res.contractAddress,
      });
    } catch (e) {
      setError(e.message || 'Deployment failed');
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
            <p className="empty-desc">Connect OPWallet to deploy a contract.</p>
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
          <div className="card" style={{ padding: '32px', maxWidth: 640, margin: '40px auto', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>✓</div>
            <h2 style={{ marginBottom: 8 }}>Contract Deployed!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              Copy the contract address and paste it into <code>frontend/.env</code> as <code>VITE_BASE_NFT_CONTRACT</code>.
            </p>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, textAlign: 'left' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Contract Address</div>
              <code style={{ wordBreak: 'break-all', color: 'var(--brand-light)' }}>{result.address}</code>
            </div>
            {result.txId && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', textAlign: 'left' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Transaction</div>
                <code style={{ wordBreak: 'break-all', fontSize: '0.75rem' }}>{result.txId}</code>
              </div>
            )}
            <button className="btn btn-ghost" style={{ marginTop: 24 }} onClick={() => { setResult(null); setForm(DEFAULTS); }}>
              Deploy Another
            </button>
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
            <h1 className="page-title">Deploy NFT Contract</h1>
            <p className="page-subtitle">Deploy a new BaseNFT collection via OPWallet.</p>
          </div>
        </div>

        <div className="card" style={{ padding: '28px 32px', maxWidth: 640, margin: '0 auto' }}>
          {error && (
            <div className="error-banner" style={{ marginBottom: 20 }}>
              {error}
              <button style={{ marginLeft: 'auto' }} onClick={() => setError('')}>✕</button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {field('Collection Name *', 'name', 'e.g. OPMarket NFT', '')}
              {field('Symbol *', 'symbol', 'e.g. OPNFT', '')}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {field('Max Supply *', 'maxSupply', '1000', '', { type: 'number', min: 1 })}
              {field('Max Per Wallet', 'maxPerWallet', '0 = unlimited', '', { type: 'number', min: 0 })}
            </div>

            {field('Base URI', 'baseURI', 'https://raw.githubusercontent.com/.../metadata/', 'Leave empty to set later via setBaseURI.')}
            {field('Description', 'description', 'A short description of your collection', '')}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {field('Icon URL', 'icon', 'https://...', '')}
              {field('Banner URL', 'banner', 'https://...', '')}
            </div>

            {field('Website', 'website', 'https://...', '')}

            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 8 }}
              onClick={handleDeploy}
              disabled={loading}
            >
              {loading ? 'Deploying via OPWallet…' : 'Deploy Contract'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
