import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

// Thin wrapper mounting the leaflet.heat plugin onto the react-leaflet map.
// points: array of [lat, lng, intensity 0..1]
export default function HeatmapLayer({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points?.length) return undefined;
    const layer = L.heatLayer(points, {
      radius: 28,
      blur: 22,
      maxZoom: 9,
      max: 1.0,
      gradient: { 0.2: '#1d4ed8', 0.45: '#06b6d4', 0.65: '#f59e0b', 0.85: '#ef4444' },
    });
    layer.addTo(map);
    return () => map.removeLayer(layer);
  }, [map, points]);

  return null;
}
