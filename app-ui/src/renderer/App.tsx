import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, ExternalLink, Terminal, TrainFront } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { Onboarding } from './components/Onboarding';

export default function App() {
    const [config, setConfig] = useState({
        MOBILE_NUMBER: '',
        PASSWORD: '',
        FROM_CITY: '',
        TO_CITY: '',
        DATE_OF_JOURNEY: '',
        SEAT_CLASS: 'S_CHAIR',
        TRAIN_NUMBER: '771',
        MAX_SELECTABLE_SEAT: '1',
        DESIRED_SEATS: '',
    });

    const [logs, setLogs] = useState<{ type: string; message: string; level?: string }[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [promptMsg, setPromptMsg] = useState('');
    const [promptInput, setPromptInput] = useState('');
    const [paymentUrl, setPaymentUrl] = useState('');
    const [showOnboarding, setShowOnboarding] = useState(true);

    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Check localStorage for credentials
        const savedMobile = localStorage.getItem('raleway_mobile');
        const savedPassword = localStorage.getItem('raleway_password');

        if (savedMobile && savedPassword) {
            setConfig((prev) => ({ ...prev, MOBILE_NUMBER: savedMobile, PASSWORD: savedPassword }));
            setShowOnboarding(false);
        }

        if (window.electronAPI) {
            const cleanup = window.electronAPI.onBackendEvent((event: any) => {
                if (event.type === 'log') {
                    setLogs((prev) => [...prev, { type: 'log', message: event.message, level: event.level }]);
                } else if (event.type === 'prompt') {
                    setPromptMsg(event.message);
                } else if (event.type === 'payment_url') {
                    setPaymentUrl(event.url);
                    setIsRunning(false);
                }
            });
            return cleanup;
        }
    }, []);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleStart = async () => {
        setLogs([]);
        setPromptMsg('');
        setPaymentUrl('');
        setIsRunning(true);
        if (window.electronAPI) {
            const res = await window.electronAPI.startBooking(config);
            if (!res.success) {
                setLogs((prev) => [...prev, { type: 'log', level: 'error', message: res.error || 'Failed to start' }]);
                setIsRunning(false);
            }
        }
    };

    const handlePromptSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (window.electronAPI && promptMsg) {
            window.electronAPI.sendBackendInput(promptInput);
            setLogs((prev) => [...prev, { type: 'log', message: `> ${promptInput}`, level: 'input' }]);
            setPromptMsg('');
            setPromptInput('');
        }
    };

    const handleOnboardingComplete = (credentials: { MOBILE_NUMBER: string; PASSWORD: string }) => {
        localStorage.setItem('raleway_mobile', credentials.MOBILE_NUMBER);
        localStorage.setItem('raleway_password', credentials.PASSWORD);
        setConfig((prev) => ({ ...prev, ...credentials }));
        setShowOnboarding(false);
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">
            {/* Custom Title Bar */}
            <TitleBar />

            {/* Main Application Area */}
            <div className="flex flex-1 relative overflow-hidden">
                {showOnboarding ? (
                    <Onboarding onComplete={handleOnboardingComplete} />
                ) : (
                    <>
                        {/* Sidebar / Config Form */}
                        <div className="w-1/3 min-w-[350px] border-r border-gray-800 bg-gray-900 p-6 flex flex-col overflow-y-auto thin-scrollbar">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center shadow-lg shadow-green-500/20">
                                    <TrainFront size={24} className="text-white" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold tracking-tight text-white">New Booking</h1>
                                    <p className="text-xs text-gray-400">Configure your journey details</p>
                                </div>
                            </div>

                            <div className="space-y-5 flex-grow">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Mobile</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.MOBILE_NUMBER}
                                            onChange={(e) => setConfig({ ...config, MOBILE_NUMBER: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Password</label>
                                        <input
                                            type="password"
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.PASSWORD}
                                            onChange={(e) => setConfig({ ...config, PASSWORD: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">From City</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.FROM_CITY}
                                            onChange={(e) => setConfig({ ...config, FROM_CITY: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">To City</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.TO_CITY}
                                            onChange={(e) => setConfig({ ...config, TO_CITY: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Date</label>
                                        <input
                                            type="text"
                                            placeholder="DD-MMM-YYYY"
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.DATE_OF_JOURNEY}
                                            onChange={(e) => setConfig({ ...config, DATE_OF_JOURNEY: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Train Number</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.TRAIN_NUMBER}
                                            onChange={(e) => setConfig({ ...config, TRAIN_NUMBER: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Class</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.SEAT_CLASS}
                                            onChange={(e) => setConfig({ ...config, SEAT_CLASS: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Seat Count</label>
                                        <input
                                            type="number"
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.MAX_SELECTABLE_SEAT}
                                            onChange={(e) => setConfig({ ...config, MAX_SELECTABLE_SEAT: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Specific Seats (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. SCHA-11,SCHA-12"
                                        className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                        value={config.DESIRED_SEATS}
                                        onChange={(e) => setConfig({ ...config, DESIRED_SEATS: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="mt-8">
                                <button
                                    onClick={handleStart}
                                    disabled={isRunning}
                                    className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${isRunning
                                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed shadow-none'
                                            : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20'
                                        }`}
                                >
                                    {isRunning ? <Square size={18} /> : <Play size={18} />}
                                    {isRunning ? 'RUNNING AUTOMATION...' : 'START BOOKING'}
                                </button>
                            </div>
                        </div>

                        {/* Main Content / Terminal */}
                        <div className="flex-1 flex flex-col bg-gray-950 relative">
                            {/* Header */}
                            <div className="h-12 border-b border-gray-800 flex items-center px-6">
                                <Terminal size={16} className="text-gray-500 mr-2" />
                                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Execution Log</span>
                            </div>

                            {/* Log Viewer */}
                            <div className="flex-1 overflow-y-auto p-6 font-mono text-sm leading-relaxed thin-scrollbar">
                                {logs.map((log, i) => (
                                    <div
                                        key={i}
                                        className={`mb-1.5 ${log.level === 'error' ? 'text-red-400' :
                                                log.level === 'input' ? 'text-blue-400 font-bold' :
                                                    'text-green-400'
                                            }`}
                                    >
                                        {log.message}
                                    </div>
                                ))}
                                <div ref={logsEndRef} />
                            </div>

                            {/* Overlays for Prompts and Payment */}
                            {promptMsg && (
                                <div className="absolute bottom-6 left-6 right-6 bg-gray-800 border border-gray-700 p-5 rounded-2xl shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-4">
                                    <span className="text-sm font-bold text-yellow-400 flex items-center gap-2">
                                        <Terminal size={16} />
                                        {promptMsg}
                                    </span>
                                    <form onSubmit={handlePromptSubmit} className="flex gap-3">
                                        <input
                                            autoFocus
                                            type="text"
                                            className="flex-1 bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition-colors text-white"
                                            value={promptInput}
                                            onChange={(e) => setPromptInput(e.target.value)}
                                        />
                                        <button type="submit" className="bg-yellow-600 hover:bg-yellow-500 px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-yellow-600/20 transition-colors text-black">
                                            SUBMIT
                                        </button>
                                    </form>
                                </div>
                            )}

                            {paymentUrl && (
                                <div className="absolute inset-0 bg-gray-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in z-40">
                                    <div className="bg-gray-900 border border-green-500/30 p-10 rounded-3xl shadow-2xl shadow-green-500/10 max-w-lg w-full text-center">
                                        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <Play size={40} className="text-green-500 ml-2" />
                                        </div>
                                        <h2 className="text-3xl font-bold text-white mb-3">Booking Confirmed!</h2>
                                        <p className="text-gray-400 mb-10 text-sm leading-relaxed">Your seats have been successfully reserved by the sidecar process. Click below to securely complete your payment.</p>

                                        <button
                                            onClick={() => { if (window.electronAPI) window.electronAPI.openExternal(paymentUrl); }}
                                            className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-lg flex items-center justify-center gap-3 shadow-lg shadow-green-600/20 transition-all text-white"
                                        >
                                            <ExternalLink size={24} />
                                            OPEN PAYMENT PORTAL
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
