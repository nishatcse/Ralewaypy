import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, ExternalLink, Terminal, TrainFront, User, RefreshCcw, CheckCircle2, Clock, CalendarClock } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { Onboarding } from './components/Onboarding';
import { STATIONS } from './stations';

export default function App() {
    const [config, setConfig] = useState({
        MOBILE_NUMBER: '',
        PASSWORD: '',
        FROM_CITY: 'Dhaka',
        TO_CITY: 'Nilphamari',
        DATE_OF_JOURNEY: new Date().toISOString().split('T')[0],
        SEAT_CLASS: 'S_CHAIR',
        TRAIN_NUMBER: '771',
        MAX_SELECTABLE_SEAT: '1',
        DESIRED_SEATS: '',
        SCHEDULE_TIME: '',
    });

    const [logs, setLogs] = useState<{ type: string; message: string; level?: string }[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [activeTask, setActiveTask] = useState<'login' | 'booking' | null>(null);
    const [promptMsg, setPromptMsg] = useState('');
    const [promptInput, setPromptInput] = useState('');
    const [paymentUrl, setPaymentUrl] = useState('');
    const [showOnboarding, setShowOnboarding] = useState(true);
    const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null);
    const [showScheduleModal, setShowScheduleModal] = useState(false);

    const [currentTime, setCurrentTime] = useState(new Date());

    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        // Check localStorage for credentials
        const savedMobile = localStorage.getItem('raleway_mobile');
        const savedPassword = localStorage.getItem('raleway_password');
        const lastConfig = localStorage.getItem('raleway_last_config');

        if (savedMobile && savedPassword) {
            (async () => {
                let decodedPassword = savedPassword;
                if (window.electronAPI && window.electronAPI.safeDecrypt) {
                    try {
                        decodedPassword = await window.electronAPI.safeDecrypt(savedPassword);
                    } catch (e) { console.error("Decryption failed", e); }
                }
                setConfig((prev) => ({ ...prev, MOBILE_NUMBER: savedMobile, PASSWORD: decodedPassword }));
                setShowOnboarding(false);
            })();
        }

        if (lastConfig) {
            try {
                const parsed = JSON.parse(lastConfig);
                setConfig(prev => ({ ...prev, ...parsed }));
            } catch (e) { console.error("Failed to parse last config", e); }
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
                    setActiveTask(null);
                } else if (event.type === 'auth_success') {
                    setUserInfo(event.user);
                    setIsRunning(false);
                    setActiveTask(null);
                }
            });
            return cleanup;
        }
    }, []);

    // Save configuration changes to localStorage (excluding sensitive info handled elsewhere)
    useEffect(() => {
        const { MOBILE_NUMBER, PASSWORD, DATE_OF_JOURNEY, ...persistentConfig } = config;
        localStorage.setItem('raleway_last_config', JSON.stringify(persistentConfig));
    }, [config.FROM_CITY, config.TO_CITY, config.SEAT_CLASS, config.TRAIN_NUMBER, config.MAX_SELECTABLE_SEAT, config.DESIRED_SEATS, config.SCHEDULE_TIME]);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleStart = async () => {
        setLogs([]);
        setPromptMsg('');
        setPaymentUrl('');
        setIsRunning(true);
        setActiveTask('booking');
        if (window.electronAPI) {
            const res = await window.electronAPI.startBooking(config);
            if (!res.success) {
                setLogs((prev) => [...prev, { type: 'log', level: 'error', message: res.error || 'Failed to start' }]);
                setIsRunning(false);
                setActiveTask(null);
            }
        }
    };

    const handleStop = async () => {
        if (window.electronAPI) {
            await window.electronAPI.stopBooking();
            setIsRunning(false);
            setActiveTask(null);
            setLogs((prev) => [...prev, { type: 'log', level: 'warning', message: 'Process stopped by user.' }]);
        }
    };

    const handleLoginOnly = async () => {
        setLogs([]);
        setPromptMsg('');
        setPaymentUrl('');
        setIsRunning(true);
        setActiveTask('login');
        if (window.electronAPI) {
            const res = await window.electronAPI.startBooking({ ...config, LOGIN_ONLY: true, REFRESH_LOGIN: true });
            if (!res.success) {
                setLogs((prev) => [...prev, { type: 'log', level: 'error', message: res.error || 'Failed to start login' }]);
                setIsRunning(false);
                setActiveTask(null);
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

    const handleOnboardingComplete = async (credentials: { MOBILE_NUMBER: string; PASSWORD: string }) => {
        localStorage.setItem('raleway_mobile', credentials.MOBILE_NUMBER);
        if (window.electronAPI && window.electronAPI.safeEncrypt) {
            const encrypted = await window.electronAPI.safeEncrypt(credentials.PASSWORD);
            localStorage.setItem('raleway_password', encrypted);
        } else {
            localStorage.setItem('raleway_password', credentials.PASSWORD);
        }
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
                        <div className="space-y-6">
                            <div className="bg-gray-900/50 border border-gray-800 rounded-lg px-4 py-3 shadow-xl backdrop-blur-sm flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">System Time</span>
                                    <div className="w-[1px] h-4 bg-gray-800" />
                                    <button 
                                        onClick={() => setShowScheduleModal(true)}
                                        className={`p-1.5 rounded transition-all ${config.SCHEDULE_TIME ? 'bg-green-500 text-black shadow-lg shadow-green-500/20' : 'hover:bg-gray-800 text-gray-400'}`}
                                        title={config.SCHEDULE_TIME ? `Scheduled for ${config.SCHEDULE_TIME}` : 'Schedule Booking'}
                                    >
                                        <CalendarClock size={16} />
                                    </button>
                                </div>
                                <div className="flex items-center gap-3">
                                    {config.SCHEDULE_TIME && (
                                        <div className="text-[10px] font-mono font-bold text-green-500 animate-pulse bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                                            {config.SCHEDULE_TIME}
                                        </div>
                                    )}
                                    <div className="text-xl font-mono font-bold text-white tracking-tighter">
                                        {currentTime.toLocaleTimeString([], { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-4 shadow-xl backdrop-blur-sm">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-lg font-bold text-green-500">Authentication</h2>
                                    <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded border border-green-500/20 uppercase tracking-tighter">Recommended</span>
                                </div>
                                <p className="text-xs text-gray-400 leading-relaxed">
                                    Pre-login to bypass authentication delays during the booking window. This starts Chrome and keeps your session ready.
                                </p>
                                {userInfo ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                                            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/20">
                                                <User size={24} className="text-white" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-white truncate">{userInfo.name}</p>
                                                <p className="text-[10px] text-green-500 flex items-center gap-1">
                                                    <CheckCircle2 size={10} />
                                                    Session Active
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleLoginOnly}
                                            disabled={isRunning}
                                            className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                                                isRunning 
                                                ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' 
                                                : 'bg-transparent text-gray-300 border-gray-700 hover:border-gray-500 hover:text-white'
                                            }`}
                                        >
                                            <RefreshCcw size={14} className={activeTask === 'login' ? 'animate-spin' : ''} />
                                            {activeTask === 'login' ? 'Refreshing...' : 'Refresh Login Session'}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleLoginOnly}
                                        disabled={isRunning}
                                        className={`w-full py-3 rounded-lg font-bold transition-all transform active:scale-[0.98] shadow-lg ${
                                            isRunning 
                                            ? activeTask === 'login' 
                                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                                                : 'bg-gray-900/50 text-gray-600 cursor-not-allowed border border-gray-800'
                                            : 'bg-white text-black hover:bg-gray-100'
                                        }`}
                                    >
                                        {activeTask === 'login' ? 'Logging in...' : 'Pre-Login (Save Session)'}
                                    </button>
                                )}
                            </div>

                            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-4 shadow-xl backdrop-blur-sm">
                                <h2 className="text-lg font-bold text-green-500 mb-2">Booking Details</h2>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">From City</label>
                                        <input
                                            list="stations"
                                            type="text"
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.FROM_CITY}
                                            onChange={(e) => setConfig({ ...config, FROM_CITY: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">To City</label>
                                        <input
                                            list="stations"
                                            type="text"
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.TO_CITY}
                                            onChange={(e) => setConfig({ ...config, TO_CITY: e.target.value })}
                                        />
                                    </div>
                                    
                                    <datalist id="stations">
                                        {STATIONS.map((station) => (
                                            <option key={station} value={station} />
                                        ))}
                                    </datalist>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Date</label>
                                        <input
                                            type="date"
                                            min={new Date().toISOString().split('T')[0]}
                                            max={(() => {
                                                const d = new Date();
                                                d.setDate(d.getDate() + 10);
                                                return d.toISOString().split('T')[0];
                                            })()}
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors [color-scheme:dark]"
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
                                        <select
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.SEAT_CLASS}
                                            onChange={(e) => setConfig({ ...config, SEAT_CLASS: e.target.value })}
                                        >
                                            <option value="AC_B">AC_B</option>
                                            <option value="AC_S">AC_S</option>
                                            <option value="SNIGDHA">SNIGDHA</option>
                                            <option value="F_BERTH">F_BERTH</option>
                                            <option value="F_SEAT">F_SEAT</option>
                                            <option value="F_CHAIR">F_CHAIR</option>
                                            <option value="S_CHAIR">S_CHAIR</option>
                                            <option value="SHOVAN">SHOVAN</option>
                                            <option value="SHULOV">SHULOV</option>
                                            <option value="AC_CHAIR">AC_CHAIR</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Seat Count</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="4"
                                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                                            value={config.MAX_SELECTABLE_SEAT}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (!isNaN(val) && val >= 1 && val <= 4) {
                                                    setConfig({ ...config, MAX_SELECTABLE_SEAT: val.toString() });
                                                } else if (e.target.value === '') {
                                                    setConfig({ ...config, MAX_SELECTABLE_SEAT: '' });
                                                }
                                            }}
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


                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={handleStart}
                                        disabled={isRunning}
                                        className={`flex-1 py-3 rounded-lg font-bold transition-all transform active:scale-[0.98] shadow-lg ${
                                            isRunning 
                                            ? activeTask === 'booking'
                                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                                : 'bg-gray-900/50 text-gray-600 cursor-not-allowed border border-gray-800'
                                            : 'bg-green-600 text-white hover:bg-green-500 hover:shadow-green-500/20'
                                        }`}
                                    >
                                        {activeTask === 'booking' ? 'Booking in Progress...' : 'Start Booking Now'}
                                    </button>
                                    {isRunning && (
                                        <button
                                            onClick={handleStop}
                                            className="px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-500 transition-all transform active:scale-[0.98] shadow-lg shadow-red-500/20"
                                        >
                                            Stop
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
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
            {showScheduleModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div 
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={() => setShowScheduleModal(false)}
                    />
                    <div className="relative w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl shadow-black/50 animate-in zoom-in-95 fade-in duration-200">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
                                <CalendarClock size={22} className="text-green-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Schedule Booking</h3>
                                <p className="text-xs text-gray-400">Set a specific time to trigger the automation.</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 text-center">Target Time (24-Hour)</label>
                                <input
                                    type="time"
                                    step="1"
                                    className="w-full bg-gray-950 border border-gray-700 rounded-xl p-4 text-3xl font-mono font-bold text-green-500 text-center focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-all [color-scheme:dark]"
                                    value={config.SCHEDULE_TIME}
                                    onChange={(e) => setConfig({ ...config, SCHEDULE_TIME: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setConfig({ ...config, SCHEDULE_TIME: '' });
                                        setShowScheduleModal(false);
                                    }}
                                    className="flex-1 py-3 rounded-xl text-xs font-bold text-red-400 bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-colors"
                                >
                                    Clear Schedule
                                </button>
                                <button
                                    onClick={() => setShowScheduleModal(false)}
                                    className="flex-1 py-3 rounded-xl text-xs font-bold bg-green-500 text-black hover:bg-green-400 transition-all shadow-lg shadow-green-500/20 active:scale-95"
                                >
                                    Save & Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
