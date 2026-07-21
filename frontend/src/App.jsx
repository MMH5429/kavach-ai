import React, { useState, useEffect } from 'react';
import { Shield, Eye, Users, MessageSquare, LayoutDashboard } from 'lucide-react';
import { getJson } from './api';

import CommandCenter from './components/CommandCenter';
import ScamDetector from './components/ScamDetector';
import CounterfeitNote from './components/CounterfeitNote';
import FraudGraph from './components/FraudGraph';
import WhatsAppShield from './components/WhatsAppShield';

const TABS = [
  { id: 'dashboard', label: 'Command Center', Icon: LayoutDashboard },
  { id: 'scam', label: 'Scam Detector (M1)', Icon: Eye },
  { id: 'counterfeit', label: 'Counterfeit Detector (M2)', Icon: Shield },
  { id: 'graph', label: 'Fraud Graph (M3)', Icon: Users },
  { id: 'whatsapp', label: 'Citizen Shield (M4)', Icon: MessageSquare },
];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [health, setHealth] = useState(null);

  // Honest status pill — polls the real backend health endpoint.
  useEffect(() => {
    let alive = true;
    const poll = () =>
      getJson('/health')
        .then((h) => alive && setHealth(h))
        .catch(() => alive && setHealth(null));
    poll();
    const t = setInterval(poll, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const online = health?.status === 'online';

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <Shield className="shield-logo" size={32} />
          <div>
            <span className="logo-text">KAVACH AI</span>
            <span className="tagline">Public Safety Intel</span>
          </div>
        </div>

        <nav className="nav-links">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-button ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>

        <div className="system-status" title={online
          ? `Model: ${health.onnx_model_loaded ? 'loaded' : 'not loaded'} · Gemini: ${health.gemini_configured ? 'on' : 'off'} · Graph: ${health.graph_data?.present ? 'present' : 'absent'}`
          : 'Backend unreachable'}>
          <span className="status-dot" style={online ? {} : { background: '#ef4444', boxShadow: '0 0 8px #ef4444' }}></span>
          <span>{online ? 'BACKEND LIVE' : 'BACKEND OFFLINE'}</span>
        </div>
      </header>

      <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'dashboard' && <CommandCenter />}
        {activeTab === 'scam' && <ScamDetector />}
        {activeTab === 'counterfeit' && <CounterfeitNote health={health} />}
        {activeTab === 'graph' && <FraudGraph />}
        {activeTab === 'whatsapp' && <WhatsAppShield health={health} />}
      </main>

      <footer style={{
        textAlign: 'center',
        padding: '1.25rem',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
        borderTop: '1px solid var(--border-glass)',
        background: 'rgba(3, 7, 18, 0.5)'
      }}>
        Kavach AI &copy; 2026 — explainable rule engine (M1), locally trained vision model (M2),
        GraphSAGE network analysis (M3) and Gemini-powered citizen shield (M4).
      </footer>
    </div>
  );
}

export default App;
