/* ──────────────────────────────────────────────
   Delhi RoadWatch — Legal & Traffic FAQ AI Bot
   Powered by Sarvam AI (Bulbul v3 + Sarvam-M)
   ────────────────────────────────────────────── */

import { useState, useRef, useEffect } from 'react';
import { textToSpeech, playBase64Audio } from '../../services/sarvamService';
import { chatWithLegalBotGemini } from '../../services/aiEngine';
import { useAuth } from '../../context/AuthContext';

const SYSTEM_PROMPT = "You are a legal assistant for the Delhi RoadWatch app. Help users understand Delhi traffic rules, Motor Vehicles Act fines (updated 2024), and violation reporting procedures. Keep answers concise, formal, and helpful. Use bullet points for steps where appropriate.";

const GREETING = `Jai Hind! I am your Delhi RoadWatch Legal Assistant. How can I help you with traffic laws, fines, or violation procedures today?`;

export default function LegalFAQBot() {
    const { currentUser } = useAuth();

    // UI display messages — includes the initial greeting (never sent to API)
    const [messages, setMessages] = useState([
        { role: 'assistant', content: GREETING }
    ]);

    // API conversation history — only real user/assistant turns, no greeting
    const apiHistoryRef = useRef([]);

    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(null);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSend = async (e) => {
        e.preventDefault();
        const userText = input.trim();
        if (!userText || isTyping) return;

        // Add to UI immediately
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        setInput('');
        setIsTyping(true);

        // Append user turn to API history
        apiHistoryRef.current = [...apiHistoryRef.current, { role: 'user', content: userText }];

        try {
            // Build payload: we pass the api history directly to Gemini
            const { reply } = await chatWithLegalBotGemini(apiHistoryRef.current);

            // Append assistant reply to API history
            apiHistoryRef.current = [...apiHistoryRef.current, { role: 'assistant', content: reply }];

            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (err) {
            console.error("Legal Bot Gemini Error:", err.message);
            const errMsg = "I'm sorry, I encountered an error: " + (err.message || "Please try again.");
            setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
            // Remove the failed user turn from API history so conversation stays valid
            apiHistoryRef.current = apiHistoryRef.current.slice(0, -1);
        } finally {
            setIsTyping(false);
        }
    };

    const handleSpeak = async (text, index) => {
        if (isSpeaking === index) return;
        setIsSpeaking(index);
        try {
            const { audioBase64 } = await textToSpeech(text, 'en-IN');
            const audio = playBase64Audio(audioBase64);
            audio.onended = () => setIsSpeaking(null);
            audio.onerror = () => setIsSpeaking(null);
        } catch (err) {
            console.error("TTS Error:", err);
            setIsSpeaking(null);
        }
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }} className="animate-up">
            {/* Header */}
            <div style={{ padding: '0 0 20px 0', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', marginBottom: '4px' }}>AI Legal Assistant</h1>
                <p className="text-meta">Ask about Delhi traffic rules, fines, and legal procedures.</p>
            </div>

            {/* Chat Window */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px', marginBottom: '20px' }}>
                {messages.map((msg, idx) => (
                    <div key={idx} style={{
                        display: 'flex',
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        marginBottom: '16px'
                    }}>
                        <div style={{
                            maxWidth: '80%',
                            background: msg.role === 'user' ? 'var(--primary)' : 'white',
                            color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                            padding: '12px 16px',
                            borderRadius: '16px',
                            borderTopRightRadius: msg.role === 'user' ? '4px' : '16px',
                            borderTopLeftRadius: msg.role === 'user' ? '16px' : '4px',
                            boxShadow: 'var(--shadow-sm)',
                            border: msg.role === 'user' ? 'none' : '1px solid var(--border-color)',
                            position: 'relative'
                        }}>
                            <div style={{ fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                {msg.content}
                            </div>
                            {msg.role === 'assistant' && (
                                <button
                                    onClick={() => handleSpeak(msg.content, idx)}
                                    style={{
                                        position: 'absolute', right: '-40px', bottom: '0',
                                        background: 'white', border: '1px solid var(--border-color)',
                                        borderRadius: '50%', width: '32px', height: '32px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', boxShadow: 'var(--shadow-sm)'
                                    }}
                                >
                                    {isSpeaking === idx ? '⏳' : '🔊'}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div style={{ display: 'flex', marginBottom: '16px' }}>
                        <div style={{ padding: '12px 16px', background: 'white', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                            <div className="sarvam-spinner-small"></div>
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} style={{ display: 'flex', gap: '12px', background: 'white', padding: '12px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="E.g., What is the fine for red light jumping in Delhi?"
                    disabled={isTyping}
                    style={{ flex: 1, border: 'none', outline: 'none', padding: '8px', fontSize: '14px' }}
                />
                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isTyping || !input.trim()}
                    style={{ padding: '8px 20px', fontSize: '13px' }}
                >
                    {isTyping ? 'Thinking...' : 'Send'}
                </button>
            </form>

            {/* Quick Suggestions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                {['No Entry Fine', 'Drunken Driving', 'Wrong Side Penalty', 'Reporting Process'].map(tag => (
                    <button
                        key={tag}
                        onClick={() => setInput(tag)}
                        style={{ background: 'var(--primary-light)', border: 'none', color: 'var(--primary)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                    >
                        {tag}
                    </button>
                ))}
            </div>
        </div>
    );
}
