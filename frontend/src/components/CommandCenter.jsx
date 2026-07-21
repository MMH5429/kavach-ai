import React, { useState, useEffect } from 'react';
import { getJson } from '../api';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Shield, Users, Flame, Bell, FileDown } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import HeatmapLayer from './HeatmapLayer';
import EvidenceExport from './EvidenceExport';

export default function CommandCenter() {
  const [feed, setFeed] = useState(null);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    let alive = true;
    const fetchAlerts = () =>
      getJson('/alerts')
        .then((data) => alive && setFeed(data))
        .catch((err) => console.error('Failed to query alerts:', err));
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 6000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  const alerts = feed?.alerts ?? [];
  const stats = feed?.stats ?? {};
  const indiaCenter = [22.9734, 78.6569];

  return (
    <div className="dashboard-grid">
      <div className="left-column">
        {/* Telemetry cards — driven by the backend's hotspot knowledge base */}
        <div className="telemetry-grid">
          <div className="glass-panel telemetry-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="telemetry-label">Monitored Hotspot Districts</span>
              <Flame size={20} color="var(--accent-orange)" />
            </div>
            <strong className="telemetry-val" style={{ color: 'var(--accent-orange)' }}>
              {stats.active_hotspots ?? '—'}
            </strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {stats.critical_hotspots ?? '—'} rated critical
            </span>
          </div>

          <div className="glass-panel telemetry-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="telemetry-label">Scam Typologies Tracked</span>
              <Shield size={20} color="var(--accent-cyan)" />
            </div>
            <strong className="telemetry-val" style={{ color: 'var(--accent-cyan)' }}>
              {stats.monitored_scam_types ?? '—'}
            </strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              digital arrest · UPI · counterfeit · more
            </span>
          </div>

          <div className="glass-panel telemetry-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="telemetry-label">Heat Signals on Map</span>
              <Users size={20} color="var(--accent-green)" />
            </div>
            <strong className="telemetry-val" style={{ color: 'var(--accent-green)' }}>
              {stats.heat_points ?? '—'}
            </strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              intensity-weighted signal cloud
            </span>
          </div>
        </div>

        {/* National threat heatmap */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2>National Threat Heatmap</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Geospatial intensity of known fraud-hub districts (curated from public NCRB / press reporting)
                with live intercept markers.
              </p>
            </div>
            <button
              className="nav-button"
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => setShowExport(true)}
            >
              <FileDown size={16} /> Evidence Package
            </button>
          </div>

          <div className="map-container">
            <MapContainer
              center={indiaCenter}
              zoom={5}
              style={{ width: '100%', height: '100%' }}
              zoomControl={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />
              <HeatmapLayer points={feed?.heat_points} />
              {alerts.map((alert, idx) => (
                <CircleMarker
                  key={idx}
                  center={alert.coordinates}
                  radius={11}
                  fillColor="#ef4444"
                  color="#f59e0b"
                  weight={1.5}
                  opacity={0.85}
                  fillOpacity={0.35}
                >
                  <Popup>
                    <div style={{ color: '#111827', fontSize: '0.8rem', width: '170px' }}>
                      <strong style={{ fontSize: '0.9rem' }}>{alert.city}</strong>
                      <div style={{ marginTop: '0.25rem', color: '#dc2626', fontWeight: 700 }}>
                        Risk: {alert.risk_score}%
                      </div>
                      <div style={{ marginTop: '0.25rem' }}>{alert.details}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>
      </div>

      {/* Right column: live intercept feed */}
      <div className="right-column glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell size={20} color="var(--accent-orange)" /> Intercept Alert Feed
          </h2>
          <span className="status-dot"></span>
        </div>

        <div className="alert-feed-list">
          {alerts.length > 0 ? (
            alerts.map((alert) => (
              <div key={alert.id} className={`alert-item ${alert.risk_score > 85 ? 'critical' : ''}`}>
                <div className="alert-header">
                  <div className="alert-title">{alert.city}</div>
                  <span className="alert-score">{alert.risk_score}% Risk</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'white', marginBottom: '0.5rem' }}>
                  {alert.details}
                </div>
                <div className="alert-snippet">"{alert.snippet}"</div>
              </div>
            ))
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Connecting to backend feed...
            </div>
          )}
        </div>
      </div>

      {showExport && <EvidenceExport onClose={() => setShowExport(false)} />}
    </div>
  );
}
