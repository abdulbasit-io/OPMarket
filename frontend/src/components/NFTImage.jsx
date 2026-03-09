// NFTImage — image with deterministic gradient fallback
import { useState } from 'react';
import { nftGradient } from '../utils/formatters';

export default function NFTImage({ src, alt, contractAddr, tokenId, className = '', style = {} }) {
  const [failed, setFailed] = useState(false);
  const gradient = nftGradient(contractAddr, tokenId);

  if (!src || failed) {
    return (
      <div
        className={`nft-image-fallback ${className}`}
        style={{ background: gradient, ...style }}
        aria-label={alt || 'NFT'}
      >
        <span style={{ fontSize: '2rem', opacity: 0.4 }}>◆</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || 'NFT'}
      className={`nft-image ${className}`}
      style={style}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
