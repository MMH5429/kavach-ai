import React, { useRef, useState } from 'react';
import { Upload, ScanLine, ShieldAlert, ShieldCheck, ImageIcon } from 'lucide-react';
import { postForm } from '../api';
import { recordResult } from '../resultsStore';

// M2 — REAL image upload → backend ONNX inference. No fake scans.
export default function CounterfeitNote({ health }) {
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const modelReady = health?.onnx_model_loaded;

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setError(null);
    setResult(null);
    setFileName(file.name);
    setPreview(URL.createObjectURL(file));
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await postForm('/counterfeit-check', fd);
      setResult(data);
      recordResult('counterfeit_check', { file_name: file.name, ...data });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setScanning(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="counterfeit-layout">
      {/* Left: upload / scanner viewport */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1.2 }}>
        <div className="card-header">
          <h2>M2: Counterfeit Note Scanner</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Upload a photo of a ₹500/₹2000 note — analyzed by a MobileNetV3 model trained locally
            on a public real/fake currency dataset.
          </p>
        </div>

        {!modelReady && (
          <div style={{ padding: '0.75rem 1rem', borderLeft: '3px solid var(--accent-orange)', background: 'rgba(245,158,11,0.06)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Model not loaded on the backend yet — run <code>ml/m2_train.py</code> to train and install it.
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent-cyan)' : 'var(--border-glass)'}`,
            borderRadius: '12px',
            minHeight: '320px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.02)',
            transition: 'border-color 0.2s',
          }}
        >
          {preview ? (
            <>
              <img src={preview} alt={fileName} style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '8px' }} />
              {scanning && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(180deg, transparent, rgba(160,141,232,0.25), transparent)',
                  animation: 'scanline 1.2s linear infinite',
                }} />
              )}
            </>
          ) : (
            <>
              <ImageIcon size={44} strokeWidth={1.2} color="var(--text-secondary)" />
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>
                Drop a note photo here, or click to browse
              </div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        <button className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={scanning}>
          <Upload size={16} /> {scanning ? 'Analyzing…' : 'Choose Image'}
        </button>
      </div>

      {/* Right: authentication report — a paper document that gets stamped */}
      <div className="glass-panel doc-panel" data-exhibit="Exhibit M2 · Currency Authentication" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2>Authentication Report</h2>

        {scanning && (
          <div style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ScanLine size={18} /> Running ONNX inference…
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--accent-red)', fontSize: '0.85rem', padding: '0.75rem', borderLeft: '3px solid var(--accent-red)', background: 'rgba(239,68,68,0.05)' }}>
            {error}
          </div>
        )}

        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem 0' }}>
              <div
                key={result.verdict + fileName}
                className={`stamp ${result.is_genuine ? 'stamp-clear' : 'stamp-danger'}`}
              >
                {result.verdict}
                <span className="stamp-sub">MobileNetV3 · Confidence {result.confidence}%</span>
              </div>
            </div>

            {/* Both class probabilities — honest, not a single magic number */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <h3>Class Probabilities</h3>
              {[['Genuine', result.probabilities.genuine, 'var(--accent-green)'],
                ['Counterfeit', result.probabilities.counterfeit, 'var(--accent-red)']].map(([label, p, color]) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                    <span>{label}</span><strong style={{ color }}>{(p * 100).toFixed(1)}%</strong>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${p * 100}%`, height: '100%', background: color, borderRadius: '3px' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Model provenance card — transparency is the feature */}
            <div className="glass-panel" style={{ borderLeft: '3px solid var(--accent-cyan)', background: 'rgba(6,182,212,0.04)', padding: '1rem', fontSize: '0.8rem', lineHeight: 1.6 }}>
              <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '0.4rem' }}>Model Provenance</h4>
              <div><strong>Model:</strong> {result.model.name}</div>
              <div><strong>Trained:</strong> {result.model.trained_at?.slice(0, 19).replace('T', ' ')}</div>
              <div><strong>Dataset:</strong> {result.model.dataset}</div>
              {result.model.test_accuracy != null && (
                <div><strong>Held-out test accuracy:</strong> {(result.model.test_accuracy * 100).toFixed(1)}%</div>
              )}
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', fontSize: '0.72rem' }}>
                Trained on a small public dataset — a field prototype, not a bank-grade verifier.
                Verdicts carry full provenance for auditability.
              </p>
            </div>
          </div>
        ) : !scanning && !error && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', gap: '1rem', textAlign: 'center' }}>
            <ScanLine size={48} strokeWidth={1.2} />
            <p>Upload a currency note image to run<br />the counterfeit detection model.</p>
          </div>
        )}
      </div>
    </div>
  );
}
