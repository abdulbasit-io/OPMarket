import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import MarketplacePage from './pages/MarketplacePage';
import MyNFTsPage from './pages/MyNFTsPage';
import LaunchPage from './pages/LaunchPage';
import CollectionPage from './pages/CollectionPage';

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Navbar />
          <div className="app-content">
            <Routes>
              <Route path="/"            element={<LandingPage />}    />
              <Route path="/marketplace"        element={<MarketplacePage />} />
              <Route path="/launch"            element={<LaunchPage />}      />
              <Route path="/collection/:addr"  element={<CollectionPage />}  />
              <Route path="/my-nfts"           element={<MyNFTsPage />}      />
              {/* fallback */}
              <Route path="*"            element={<LandingPage />}    />
            </Routes>
          </div>
          <Footer />
        </div>
      </BrowserRouter>
    </WalletProvider>
  );
}
