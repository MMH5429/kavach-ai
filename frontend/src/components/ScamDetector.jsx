import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, ShieldAlert, CheckCircle, HelpCircle, Activity } from 'lucide-react';
import { postJson } from '../api';
import { recordResult } from '../resultsStore';

// Scripted transcripts of documented scam patterns — clearly labeled as a
// simulation; the analysis on the right is a LIVE backend call per line.
const SCAM_PRESETS = [
  {
    title: "FedEx / Narcotics Customs Scam",
    transcripts: [
      { speaker: "scammer", text: "Hello, this is FedEx customer support. Am I speaking with the owner of Aadhaar card ending in 4521?" },
      { speaker: "victim", text: "Yes, who is this?" },
      { speaker: "scammer", text: "Sir, a parcel sent from Mumbai to Taiwan containing 5 passports, 3 laptop computers, and 140 grams of illegal MDMA drugs was seized by customs under your credentials." },
      { speaker: "victim", text: "What? I didn't send any package. There must be some mistake." },
      { speaker: "scammer", text: "This is a serious offense, sir. A money laundering case is also linked to your PAN card. We are connecting you directly to Mumbai Customs Cyber Cell department on video call. You are placed under digital arrest." },
      { speaker: "victim", text: "Wait, what is digital arrest? Please tell me how to clear my name." },
      { speaker: "scammer", text: "You must keep your camera on. Do not disconnect or tell anyone. You must transfer your funds to our security audit bank account for verification. Once cleared, we will refund it." }
    ]
  },
  {
    title: "CBI Money Laundering Threat",
    transcripts: [
      { speaker: "scammer", text: "I am Officer Mishra calling from CBI Headquarters New Delhi. We have a Supreme Court arrest warrant issued against you for terror funding." },
      { speaker: "victim", text: "Terror funding? I am a simple teacher! I have never done anything illegal!" },
      { speaker: "scammer", text: "Our systems show a transfer of 2.5 crore rupees in a mule account opened with your credentials. You are under digital arrest. You cannot leave your room." },
      { speaker: "victim", text: "Please help me, I am innocent! What should I do?" },
      { speaker: "scammer", text: "For national security verification, transfer your entire bank balance to the RBI verification vault account. If you do not comply, a team will be sent to arrest you in 2 hours." }
    ]
  },
  {
    title: "TRAI Sim Suspension Scam",
    transcripts: [
      { speaker: "scammer", text: "TRAI department warning. Your mobile number is broadcasting illegal harassment messages. Your line will be suspended in 2 hours." },
      { speaker: "victim", text: "But I only use my phone for personal calls. Why would you block it?" },
      { speaker: "scammer", text: "Your Aadhaar card was used to register 9 SIM cards in Delhi. One of them is linked to fraud. If you want to prevent suspension, register a police complaint immediately." },
      { speaker: "victim", text: "How do I register a complaint? I am not in Delhi." },
      { speaker: "scammer", text: "We will transfer you to the Delhi Cyber Cell officer. He will do online verification. Share all bank details to prove you did not buy those SIM cards." }
    ]
  },
  {
    title: "Legitimate Call (control sample)",
    transcripts: [
      { speaker: "scammer", text: "Good morning, this is Priya from the school office. The parent-teacher meeting has been moved to Saturday 10am." },
      { speaker: "victim", text: "Oh thanks for letting me know. Should I bring the report card?" },
      { speaker: "scammer", text: "Yes please, and the fee receipt if you have it. See you Saturday!" }
    ]
  }
];

export default function ScamDetector() {
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visibleLines, setVisibleLines] = useState([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const transcriptEndRef = useRef(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleLines]);

  useEffect(() => {
    let interval;
    if (isPlaying) {
      const presetLines = SCAM_PRESETS[selectedPreset].transcripts;
      if (currentLineIndex < presetLines.length) {
        interval = setTimeout(() => {
          const newLine = presetLines[currentLineIndex];
          setVisibleLines(prev => [...prev, newLine]);
          setCurrentLineIndex(prev => prev + 1);
          analyzeAccumulatedText([...visibleLines, newLine]);
        }, 2600);
      } else {
        setIsPlaying(false);
      }
    }
    return () => clearTimeout(interval);
  }, [isPlaying, currentLineIndex, selectedPreset]);

  const startSimulation = () => {
    setVisibleLines([]);
    setCurrentLineIndex(0);
    setAnalysisResult(null);
    setIsPlaying(true);
  };

  const analyzeAccumulatedText = async (lines) => {
    const textBlock = lines.map(l => l.text).join(" ");
    setIsAnalyzing(true);
    try {
      const data = await postJson('/scam-detect', { text: textBlock });
      setAnalysisResult(data);
      recordResult('scam_detection', {
        preset: SCAM_PRESETS[selectedPreset].title,
        transcript: textBlock,
        ...data,
      });
    } catch (err) {
      console.error("API error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="scam-detector-layout">
      {/* Left panel: simulator */}
      <div className="player-panel glass-panel">
        <div className="card-header">
          <h2>M1: Scam Call Interceptor</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Simulated call transcript — analyzed line-by-line by the live explainable rule engine.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Select Call Profile</label>
          <select
            className="chat-input"
            value={selectedPreset}
            onChange={(e) => {
              setSelectedPreset(Number(e.target.value));
              setVisibleLines([]);
              setAnalysisResult(null);
              setIsPlaying(false);
              setCurrentLineIndex(0);
            }}
            disabled={isPlaying}
            style={{ width: '100%', outline: 'none' }}
          >
            {SCAM_PRESETS.map((p, idx) => (
              <option key={idx} value={idx}>{p.title}</option>
            ))}
          </select>
        </div>

        <div className="call-simulator">
          <div className={`avatar-ring ${isPlaying ? 'active' : ''}`}>
            <Activity size={48} color={isPlaying ? 'var(--accent-cyan)' : 'var(--text-secondary)'} />
          </div>
          <div className="call-status-label">
            {isPlaying ? "SIMULATION STREAMING" : "LINE READY"}
          </div>
          <div className="timer">
            {isPlaying ? `00:${String(currentLineIndex * 3).padStart(2, '0')}` : "00:00"}
          </div>

          <div className="control-buttons">
            {!isPlaying ? (
              <button className="btn btn-primary" onClick={startSimulation}>
                <Play size={16} /> Run Simulation & Analyze
              </button>
            ) : (
              <button className="btn btn-danger" onClick={() => setIsPlaying(false)}>
                <Square size={16} /> Stop
              </button>
            )}
          </div>
        </div>

        <div className="transcript-feed">
          {visibleLines.map((line, idx) => (
            <div key={idx} className={`speech-bubble ${line.speaker}`}>
              <strong>{line.speaker === 'scammer' ? 'Caller' : 'Receiver'}: </strong>
              {line.text}
            </div>
          ))}
          {isPlaying && (
            <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--accent-cyan)', fontSize: '0.85rem', fontStyle: 'italic', paddingLeft: '0.5rem' }}>
              <span className="status-dot"></span> Next line incoming...
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* Right panel: live analysis — rendered as a paper case document */}
      <div className="analysis-panel glass-panel doc-panel" data-exhibit="Exhibit M1 · Call Intercept Analysis">
        <h2>Live Risk Analysis</h2>

        {isAnalyzing && (
          <div style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="status-dot" style={{ background: 'var(--accent-cyan)' }}></span> Running rule-engine analysis...
          </div>
        )}

        {analysisResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="glass-panel" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Scam Category</div>
                <strong style={{ fontSize: '1.1rem' }}>{analysisResult.category}</strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Risk Score</div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  fontFamily: 'var(--font-display)',
                  color: analysisResult.is_scam ? 'var(--accent-red)' : 'var(--accent-green)'
                }}>
                  {analysisResult.risk_score}%
                </div>
              </div>
            </div>

            {/* Verdict lands as an inked stamp; re-stamps when the verdict changes */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
              <div
                key={analysisResult.verdict}
                className={`stamp ${analysisResult.is_scam ? 'stamp-danger' : 'stamp-clear'}`}
              >
                {analysisResult.verdict}
                <span className="stamp-sub">Kavach AI · Rule Engine · {analysisResult.risk_score}%</span>
              </div>
            </div>

            {analysisResult.indicators.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3>Audit Evidence Indicators</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {analysisResult.indicators.map((ind, idx) => (
                    <div key={idx} className={`audit-indicator-card ${analysisResult.is_scam ? 'alert' : ''}`}>
                      {ind}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* REAL explainability: per-rule contributions from the engine */}
            {analysisResult.contributions?.length > 0 && (
              <div className="glass-panel" style={{ borderLeft: '3px solid var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.04)', padding: '1rem' }}>
                <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '0.75rem' }}>
                  Rule Contributions (audit trail)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {analysisResult.contributions.map((c) => (
                    <div key={c.rule}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                        <span>{c.label}</span>
                        <strong style={{ color: 'var(--accent-cyan)' }}>{c.weight_pct}%</strong>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${c.weight_pct}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-blue, #3b82f6))',
                          borderRadius: '3px',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        matched: {c.matched_terms.slice(0, 5).join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.75rem', lineHeight: 1.4 }}>
                  Every score decomposes into deterministic, court-auditable rule matches — no black-box verdicts.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', gap: '1rem', textAlign: 'center' }}>
            <HelpCircle size={48} strokeWidth={1.5} />
            <p>Start a simulated call on the left panel.<br />The rule engine will evaluate the conversation line-by-line.</p>
          </div>
        )}
      </div>
    </div>
  );
}
