import React, { useState, useEffect, useRef } from 'react';
import { Send, ArrowRight, Cpu } from 'lucide-react';
import { postJson } from '../api';
import { recordResult } from '../resultsStore';

const SUGGESTED_SMS = [
  "Forwarded: Dear consumer, your electricity connection will be suspended at 9:30 PM tonight due to unpaid bills. Call Electricity Officer at 9876543210 immediately.",
  "Forwarded: Congratulations! You have been selected for a part-time job earning Rs 5000 daily by completing simple YouTube video liking tasks. Contact us on Telegram @TaskEarnIndia.",
  "Forwarded: Alert, your HDFC netbanking access is locked due to incorrect login details. Verify your credentials immediately by clicking here: http://hdfc-security-check.com",
  "Hi mom, this is my new number. My old phone broke. Can you send 15000 urgently, I'll explain later.",
];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'te', label: 'తెలుగు' },
];

export default function WhatsAppShield({ health }) {
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: "👋 Namaste! Welcome to Kavach Citizen Fraud Shield. Forward any suspicious message, SMS, job offer or payment link — I'll assess it and reply in your language.",
      verdict: null,
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  const geminiOn = health?.gemini_configured;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (textToSend) => {
    if (!textToSend.trim()) return;
    setMessages((prev) => [...prev, { sender: 'user', text: textToSend, verdict: null }]);
    setInputText('');
    setLoading(true);
    try {
      const data = await postJson('/whatsapp-simulate', { message: textToSend, language });
      recordResult('citizen_shield', { message: textToSend, ...data });

      const showLocal = data.verdict_local && data.verdict_local !== data.verdict_en;
      const botResponseText = `🔍 *Threat Type:* ${data.scam_type}
⚠️ *Risk Level:* ${data.risk_level}

${data.verdict_en}${showLocal ? `

🌐 ${data.verdict_local}` : ''}`;

      setMessages((prev) => [...prev, { sender: 'bot', text: botResponseText, verdict: data }]);
    } catch (err) {
      console.error('Failed to query shield endpoint:', err);
      setMessages((prev) => [...prev, {
        sender: 'bot',
        text: '❌ Failed to reach the backend. Please verify the FastAPI server is running.',
        verdict: null,
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="whatsapp-layout">
      <div className="whatsapp-container">
        <div className="whatsapp-header">
          <div className="bot-avatar">K</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Kavach Citizen Shield</div>
            <div style={{ fontSize: '0.75rem', color: '#8696a0', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Cpu size={11} /> {geminiOn ? 'Gemini 2.5 Flash + advisory retrieval' : 'Rule-based fallback (no Gemini key)'}
            </div>
          </div>
          {/* Language selector */}
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                style={{
                  padding: '0.25rem 0.55rem',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  border: `1px solid ${language === l.code ? 'var(--accent-cyan)' : 'var(--border-glass)'}`,
                  background: language === l.code ? 'rgba(6,182,212,0.15)' : 'transparent',
                  color: language === l.code ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="chat-messages">
          {messages.map((m, idx) => (
            <div key={idx} className={`chat-bubble ${m.sender}`}>
              <div style={{ whiteSpace: 'pre-line', fontSize: '0.85rem' }}>{m.text}</div>

              {m.verdict && (
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '8px',
                  border: `1px solid ${['Critical', 'High'].includes(m.verdict.risk_level) ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                  fontSize: '0.75rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontWeight: 700 }}>
                    <span style={{ color: ['Critical', 'High'].includes(m.verdict.risk_level) ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                      {m.verdict.risk_level} Risk
                    </span>
                    <span>Helpline: 1930</span>
                  </div>
                  <div style={{ color: '#8696a0', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span>Report at cybercrime.gov.in / sancharsaathi.gov.in</span>
                    <span style={{
                      padding: '0.05rem 0.45rem', borderRadius: '999px',
                      border: '1px solid var(--border-glass)',
                      color: m.verdict.engine === 'gemini' ? 'var(--accent-cyan)' : 'var(--accent-orange)',
                    }}>
                      engine: {m.verdict.engine}
                    </span>
                  </div>
                  {m.verdict.matched_advisories?.length > 0 && (
                    <div style={{ color: '#8696a0', marginTop: '0.35rem' }}>
                      📚 Matched advisories: {m.verdict.matched_advisories.join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="chat-bubble bot" style={{ fontStyle: 'italic', color: '#8696a0', display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <span className="status-dot"></span> Kavach AI is auditing indicators...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-bar">
          <input
            type="text"
            className="chat-input"
            placeholder="Type or paste suspicious message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(inputText); }}
            disabled={loading}
          />
          <button
            className="btn btn-primary"
            onClick={() => sendMessage(inputText)}
            disabled={loading}
            style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          Select a sample threat vector to forward:
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {SUGGESTED_SMS.map((sms, idx) => (
            <button
              key={idx}
              className="glass-panel"
              onClick={() => sendMessage(sms)}
              disabled={loading}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.01)',
                border: '1px solid var(--border-glass)',
                padding: '0.75rem',
                borderRadius: '8px',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%' }}>
                {sms}
              </span>
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
