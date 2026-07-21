import React, { useState, useEffect } from 'react';
import { Search, AlertCircle, Info, RefreshCw } from 'lucide-react';
import { getJson } from '../api';
import { recordResult } from '../resultsStore';

// M3 — renders the artifact produced by ml/m3_graph_train.py.
// Node positions come baked from networkx spring_layout at training time;
// riskScore is the GraphSAGE model's predicted mule probability.
export default function FraudGraph() {
  const [graphData, setGraphData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchGraph();
  }, []);

  const fetchGraph = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getJson('/fraud-network');
      setGraphData(data);
      const topMule = [...data.nodes].filter((n) => n.isMule).sort((a, b) => b.riskScore - a.riskScore)[0];
      if (topMule) setSelectedNode(topMule);
      recordResult('fraud_network', {
        nodes: data.nodes.length,
        flagged_mules: data.nodes.filter((n) => n.isMule).length,
        model_meta: data.meta,
      });
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const nodeById = (id) => graphData?.nodes.find((n) => n.id === id);

  const matchesSearch = (n) =>
    !searchQuery ||
    n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.bank.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.city.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <div className="network-layout">
      {/* Left: SVG network canvas */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>M3: GNN Fraud Ring Visualizer</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              GraphSAGE mule-account classification over a simulated transaction ledger — layout and
              risk scores are real model output.
            </p>
          </div>
          <button className="btn" onClick={fetchGraph} style={{ padding: '0.4rem 0.8rem' }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="graph-canvas-container">
          {loading ? (
            <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
              <span className="status-dot" style={{ background: 'var(--accent-cyan)' }}></span> Loading network…
            </div>
          ) : error ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
              <AlertCircle size={32} color="var(--accent-orange)" />
              <div style={{ fontSize: '0.85rem', maxWidth: '420px' }}>{error}</div>
            </div>
          ) : (
            <svg viewBox="0 0 600 440" style={{ width: '100%', height: '100%' }}>
              {graphData?.links.map((link, idx) => {
                const s = nodeById(link.source);
                const t = nodeById(link.target);
                if (!s || !t) return null;
                const isMuleLink = s.isMule && t.isMule;
                return (
                  <line
                    key={idx}
                    x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                    stroke={isMuleLink ? 'rgba(239, 68, 68, 0.45)' : 'rgba(255,255,255,0.07)'}
                    strokeWidth={isMuleLink ? 1.6 : 0.7}
                    strokeDasharray={isMuleLink ? 'none' : '2, 3'}
                  />
                );
              })}

              {graphData?.nodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const dimmed = searchQuery && !matchesSearch(node);
                return (
                  <g key={node.id} cursor="pointer" onClick={() => setSelectedNode(node)} opacity={dimmed ? 0.15 : 1}>
                    <circle
                      cx={node.x} cy={node.y}
                      r={node.isMule ? 4 + 5 * node.riskScore / 100 : 4.5}
                      fill={node.isMule ? 'var(--accent-red)' : 'var(--accent-blue)'}
                      opacity={isSelected ? 1 : 0.8}
                      stroke={isSelected ? '#fff' : 'none'}
                      strokeWidth={1.5}
                      style={{ transition: 'all 0.2s ease' }}
                    />
                    {node.isMule && (
                      <circle
                        cx={node.x} cy={node.y} r={13}
                        fill="none" stroke="var(--accent-red)" strokeWidth="1" opacity="0.3"
                        className="status-dot"
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          <div style={{ position: 'absolute', bottom: '1rem', left: '1.25rem', display: 'flex', gap: '1rem', background: 'rgba(3,7,18,0.7)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-glass)', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-red)' }}></span> Mule (model-flagged)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-blue)' }}></span> Normal account
            </div>
          </div>

          {/* Training provenance overlay */}
          {graphData?.meta && (
            <div style={{ position: 'absolute', top: '1rem', right: '1.25rem', background: 'rgba(3,7,18,0.7)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-glass)', fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <div><strong style={{ color: 'var(--accent-cyan)' }}>{graphData.meta.model}</strong></div>
              <div>test AUC {graphData.meta.auc} · F1 {graphData.meta.f1}</div>
              <div>{graphData.meta.n_nodes} nodes · {graphData.meta.n_edges} edges</div>
              <div>trained {graphData.meta.trained_at?.slice(0, 10)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Right: node detail */}
      <div className="node-detail-panel glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Search size={18} color="var(--text-secondary)" />
          <input
            type="text"
            className="chat-input"
            placeholder="Search accounts, banks, cities…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        {selectedNode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '12px',
                  background: selectedNode.isMule ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  color: selectedNode.isMule ? 'var(--accent-red)' : 'var(--accent-blue)',
                  border: `1px solid ${selectedNode.isMule ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}`,
                }}>
                  {selectedNode.isMule ? 'HIGH RISK MULE ACCOUNT' : 'GENUINE PROFILE'}
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: selectedNode.isMule ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                  Mule Probability: {selectedNode.riskScore}%
                </span>
              </div>
              <h2 style={{ fontSize: '1.3rem', marginTop: '0.5rem' }}>{selectedNode.name}</h2>
            </div>

            <div className="glass-panel" style={{ background: 'rgba(255, 255, 255, 0.01)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[['Bank Entity', selectedNode.bank],
                ['District', selectedNode.city],
                ['Avg Transaction Size', `₹${selectedNode.avgTxn.toLocaleString()}`],
                ['Monthly Frequency', `${selectedNode.frequency} txns`],
                ['Counterparties', selectedNode.degree]].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{label}:</span>
                  <strong style={{ fontSize: '0.85rem' }}>{val}</strong>
                </div>
              ))}
            </div>

            {selectedNode.isMule && (
              <div className="glass-panel" style={{ borderLeft: '3px solid var(--accent-red)', background: 'rgba(239, 68, 68, 0.04)', padding: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <AlertCircle size={18} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <div>
                  <h4 style={{ color: 'var(--accent-red)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Model Audit Trail</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    GraphSAGE assigned {selectedNode.riskScore}% mule probability from this account's
                    transaction features and its {selectedNode.degree} counterparty links.
                    Trained on a simulated PaySim-schema ledger — methodology demo, not production intel.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: '240px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', gap: '0.5rem', textAlign: 'center' }}>
            <Info size={32} strokeWidth={1.5} />
            <p>Click any node to inspect its transaction telemetry.</p>
          </div>
        )}
      </div>
    </div>
  );
}
