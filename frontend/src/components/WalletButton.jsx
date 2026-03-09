import { useWallet } from '../context/WalletContext';
import { truncateAddress } from '../utils/formatters';

export default function WalletButton({ className = '' }) {
  const { isConnected, isConnecting, address, btcBalance, connect, disconnect } = useWallet();

  if (isConnected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="address-pill">
          <span className="status-dot" />
          {truncateAddress(address)}
        </div>
        <button
          className={`btn btn-ghost ${className}`}
          onClick={disconnect}
          style={{ fontSize: '0.75rem', padding: '6px 12px' }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      className={`btn btn-primary ${className}`}
      onClick={connect}
      disabled={isConnecting}
    >
      {isConnecting ? 'Connecting…' : 'Connect Wallet'}
    </button>
  );
}
