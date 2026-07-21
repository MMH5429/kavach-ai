import React, { useState } from 'react';
import { FileDown, X, ShieldCheck } from 'lucide-react';
import { apiUrl } from '../api';
import { getResults } from '../resultsStore';

export default function EvidenceExport({ onClose }) {
  const [caseTitle, setCaseTitle] = useState('');
  const [analyst, setAnalyst] = useState('');
  const [busy, setBusy] = useState(false);
  const [packageInfo, setPackageInfo] = useState(null);
  const [error, setError] = useState(null);

  const artifacts = getResults();
  const moduleNames = Object.keys(artifacts);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/evidence-export'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_title: caseTitle || 'Untitled Case',
          analyst: analyst || 'Kavach Analyst',
          artifacts,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pkg = await res.json();
      setPackageInfo(pkg);
      // Trigger the file download.
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kavach_evidence_${pkg.package_id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(3,7,18,0.8)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div className="glass-panel" style={{ width: 'min(520px, 92vw)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={20} color="var(--accent-cyan)" /> Evidence Intelligence Package
          </h2>
          <button className="nav-button" onClick={onClose} style={{ padding: '0.4rem' }}><X size={16} /></button>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Bundles the verdicts currently on screen into a timestamped JSON package with a
          chain-of-custody log and a SHA-256 integrity hash — independently verifiable, tamper-evident.
        </p>

        <div style={{ fontSize: '0.8rem' }}>
          <strong>Artifacts captured this session:</strong>{' '}
          {moduleNames.length ? moduleNames.join(', ') : 'none yet — run an analysis in any module first'}
        </div>

        <input
          className="chat-input"
          placeholder="Case title (e.g. FIR 2026/0421 — Digital Arrest, Pune)"
          value={caseTitle}
          onChange={(e) => setCaseTitle(e.target.value)}
          style={{ width: '100%' }}
        />
        <input
          className="chat-input"
          placeholder="Analyst name"
          value={analyst}
          onChange={(e) => setAnalyst(e.target.value)}
          style={{ width: '100%' }}
        />

        <button className="btn btn-primary" onClick={generate} disabled={busy || !moduleNames.length}>
          <FileDown size={16} /> {busy ? 'Generating…' : 'Generate & Download Package'}
        </button>

        {error && <div style={{ color: 'var(--accent-red)', fontSize: '0.8rem' }}>{error}</div>}

        {packageInfo && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.5 }}>
            <div><strong style={{ color: 'var(--accent-green)' }}>✓ {packageInfo.package_id}</strong> downloaded</div>
            <div>SHA-256: <code>{packageInfo.integrity.hash}</code></div>
          </div>
        )}
      </div>
    </div>
  );
}
