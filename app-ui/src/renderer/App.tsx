import React, { useEffect, useRef, useState } from 'react';
import {
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Play,
    RefreshCcw,
    Save,
    ShieldCheck,
    Square,
    Terminal,
    TrainFront,
    Trash2,
    User,
    Activity,
    MapPin,
    ArrowRight,
    Loader2,
    Clock,
    History,
} from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { Onboarding } from './components/Onboarding';
import { STATIONS } from './stations';

function formatLocalDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addLocalDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

type BookingConfig = {
    MOBILE_NUMBER: string;
    PASSWORD: string;
    FROM_CITY: string;
    TO_CITY: string;
    DATE_OF_JOURNEY: string;
    SEAT_CLASS: string;
    TRAIN_NUMBER: string;
    MAX_SELECTABLE_SEAT: string;
    DESIRED_SEATS: string;
    SCHEDULE_TIME: string;
    FLEXIBLE_SEAT_COUNT: boolean;
};

type LogEntry = {
    type: string;
    message: string;
    level?: LogLevel;
    timestamp: Date;
};

type BookingPhase = 'idle' | 'login' | 'scheduled' | 'searching' | 'booking' | 'otp' | 'payment' | 'completed' | 'failed';

type LogLevel = 'error' | 'warning' | 'input' | 'success' | 'info';

const inputClass = 'w-full bg-slate-950/80 border border-slate-700/80 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 outline-none [color-scheme:dark]';
const labelClass = 'block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5';
const panelClass = 'bg-slate-900 border border-slate-800 rounded-lg';

function normalizeConfig(config: BookingConfig): BookingConfig {
    return {
        ...config,
        MOBILE_NUMBER: config.MOBILE_NUMBER.trim(),
        PASSWORD: config.PASSWORD,
        FROM_CITY: config.FROM_CITY.trim(),
        TO_CITY: config.TO_CITY.trim(),
        TRAIN_NUMBER: config.TRAIN_NUMBER.trim(),
        DESIRED_SEATS: config.DESIRED_SEATS.split(',').map((seat) => seat.trim()).filter(Boolean).join(','),
    };
}

function validateConfig(config: BookingConfig): string | null {
    const normalized = normalizeConfig(config);
    if (!normalized.MOBILE_NUMBER) return 'Mobile number is required.';
    if (!normalized.PASSWORD) return 'Password is required.';
    if (!normalized.FROM_CITY) return 'From city is required.';
    if (!normalized.TO_CITY) return 'To city is required.';
    if (!normalized.DATE_OF_JOURNEY) return 'Journey date is required.';
    if (!normalized.SEAT_CLASS) return 'Seat class is required.';

    const trainNumber = Number(normalized.TRAIN_NUMBER);
    if (!Number.isInteger(trainNumber) || trainNumber <= 0) return 'Train number must be a positive number.';

    const seatCount = Number(normalized.MAX_SELECTABLE_SEAT);
    if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 4) return 'Seat count must be between 1 and 4.';

    return null;
}

export default function App() {
    const [config, setConfig] = useState<BookingConfig>({
        MOBILE_NUMBER: '',
        PASSWORD: '',
        FROM_CITY: 'Dhaka',
        TO_CITY: 'Nilphamari',
        DATE_OF_JOURNEY: formatLocalDate(new Date()),
        SEAT_CLASS: 'S_CHAIR',
        TRAIN_NUMBER: '771',
        MAX_SELECTABLE_SEAT: '1',
        DESIRED_SEATS: '',
        SCHEDULE_TIME: '',
        FLEXIBLE_SEAT_COUNT: false,
    });

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [activeTask, setActiveTask] = useState<'login' | 'booking' | null>(null);
    const [promptMsg, setPromptMsg] = useState('');
    const [promptInput, setPromptInput] = useState('');
    const [paymentUrl, setPaymentUrl] = useState('');
    const [showOnboarding, setShowOnboarding] = useState(true);
    const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [hasRestoredConfig, setHasRestoredConfig] = useState(false);
    const [credentialsSaved, setCredentialsSaved] = useState(false);
    const [logExpanded, setLogExpanded] = useState(false);
    const [currentPhase, setCurrentPhase] = useState<BookingPhase>('idle');
    const [serverOnline, setServerOnline] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const savedMobile = localStorage.getItem('raleway_mobile');
        const savedPassword = localStorage.getItem('raleway_password');
        const lastConfig = localStorage.getItem('raleway_last_config');
        let restoredConfig: Partial<BookingConfig> = {};

        if (lastConfig) {
            try {
                restoredConfig = JSON.parse(lastConfig);
            } catch (e) {
                console.error('Failed to parse last config', e);
            }
        }

        const restoreConfig = async () => {
            if (savedMobile && savedPassword) {
                let decodedPassword = savedPassword;
                if (window.electronAPI && window.electronAPI.safeDecrypt) {
                    try {
                        decodedPassword = await window.electronAPI.safeDecrypt(savedPassword);
                    } catch (e) {
                        console.error('Decryption failed', e);
                    }
                }
                setConfig((prev) => ({
                    ...prev,
                    ...restoredConfig,
                    MOBILE_NUMBER: savedMobile,
                    PASSWORD: decodedPassword,
                    FLEXIBLE_SEAT_COUNT: Boolean(restoredConfig.FLEXIBLE_SEAT_COUNT),
                }));
                setShowOnboarding(false);
            } else {
                setConfig((prev) => ({
                    ...prev,
                    ...restoredConfig,
                    FLEXIBLE_SEAT_COUNT: Boolean(restoredConfig.FLEXIBLE_SEAT_COUNT),
                }));
            }
            setHasRestoredConfig(true);
        };

        restoreConfig();

        let cleanup: (() => void) | undefined;
        if (window.electronAPI) {
            cleanup = window.electronAPI.onBackendEvent((event: any) => {
                if (event.type === 'log') {
                    const level = event.level || 'info';
                    const msg = event.message || '';
                    setLogs((prev) => [...prev, { type: 'log', message: msg, level, timestamp: new Date() }]);
                    
                    // Phase transitions based on log keywords
                    if (msg.includes('Login successful') || msg.includes('Authenticated as')) {
                        setCurrentPhase('idle'); // If login only, stay idle or special 'ready'
                    } else if (msg.includes('Starting booking process')) {
                        setCurrentPhase('searching');
                    } else if (msg.includes('Retrying in')) {
                        setCurrentPhase('searching');
                    } else if (msg.includes('Trip found') || msg.includes('Checking seats')) {
                        setCurrentPhase('booking');
                    } else if (msg.includes('OTP requested')) {
                        setCurrentPhase('otp');
                    } else if (msg.includes('Payment URL')) {
                        setCurrentPhase('payment');
                    } else if (msg.includes('Booking confirmed')) {
                        setCurrentPhase('completed');
                    } else if (level === 'error' && !msg.includes('Retrying')) {
                        setCurrentPhase('failed');
                    }
                } else if (event.type === 'prompt') {
                    setPromptMsg(event.message);
                    setLogExpanded(false);
                } else if (event.type === 'payment_url') {
                    setPaymentUrl(event.url);
                    setIsRunning(false);
                    setActiveTask(null);
                    setLogExpanded(false);
                } else if (event.type === 'auth_success') {
                    setUserInfo(event.user);
                    setIsRunning(false);
                    setActiveTask(null);
                } else if (event.type === 'backend_exit') {
                    setIsRunning(false);
                    setActiveTask(null);
                    setPromptMsg('');
                }
            });
        }

        return () => {
            cleanup?.();
        };
    }, []);

    useEffect(() => {
        if (!hasRestoredConfig) return;
        const { MOBILE_NUMBER, PASSWORD, ...persistentConfig } = config;
        localStorage.setItem('raleway_last_config', JSON.stringify(persistentConfig));
    }, [
        hasRestoredConfig,
        config.FROM_CITY,
        config.TO_CITY,
        config.DATE_OF_JOURNEY,
        config.SEAT_CLASS,
        config.TRAIN_NUMBER,
        config.MAX_SELECTABLE_SEAT,
        config.DESIRED_SEATS,
        config.SCHEDULE_TIME,
        config.FLEXIBLE_SEAT_COUNT,
    ]);

    useEffect(() => {
        if (logExpanded) {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, logExpanded]);

    const appendLog = (message: string, level: LogLevel = 'info') => {
        setLogs((prev) => [...prev, { type: 'log', message, level, timestamp: new Date() }]);
    };

    const saveCredentials = async (nextConfig = config) => {
        const mobile = nextConfig.MOBILE_NUMBER.trim();
        if (!mobile || !nextConfig.PASSWORD) {
            appendLog('Mobile number and password are required before saving credentials.', 'error');
            return false;
        }

        try {
            localStorage.setItem('raleway_mobile', mobile);
            if (window.electronAPI && window.electronAPI.safeEncrypt) {
                const encrypted = await window.electronAPI.safeEncrypt(nextConfig.PASSWORD);
                localStorage.setItem('raleway_password', encrypted);
            } else {
                localStorage.setItem('raleway_password', nextConfig.PASSWORD);
            }
        } catch (e) {
            appendLog('Failed to save credentials locally.', 'error');
            return false;
        }

        setCredentialsSaved(true);
        window.setTimeout(() => setCredentialsSaved(false), 2000);
        return true;
    };

    const prepareRunConfig = async () => {
        const validationError = validateConfig(config);
        if (validationError) {
            appendLog(validationError, 'error');
            setLogExpanded(true);
            return null;
        }

        const normalizedConfig = normalizeConfig(config);
        if (!(await saveCredentials(normalizedConfig))) return null;
        setConfig(normalizedConfig);
        return normalizedConfig;
    };

    const handleStart = async () => {
        const normalizedConfig = await prepareRunConfig();
        if (!normalizedConfig) return;

        setLogs([]);
        setPromptMsg('');
        setPaymentUrl('');
        if (!window.electronAPI) {
            appendLog('Electron bridge is unavailable. Run the desktop app to start booking.', 'error');
            setLogExpanded(true);
            return;
        }

        setIsRunning(true);
        setActiveTask('booking');
        setCurrentPhase('login');
        setLogExpanded(false);
        const res = await window.electronAPI.startBooking(normalizedConfig);
        if (!res.success) {
            setLogs((prev) => [...prev, { type: 'log', level: 'error', message: res.error || 'Failed to start' }]);
            setIsRunning(false);
            setActiveTask(null);
            setLogExpanded(true);
        }
    };

    const handleStop = async () => {
        if (!window.electronAPI) {
            appendLog('Electron bridge is unavailable. Cannot stop a backend process.', 'error');
            setIsRunning(false);
            setActiveTask(null);
            setLogExpanded(true);
            return;
        }
        const res = await window.electronAPI.stopBooking();
        if (res.success) {
            appendLog('Stop requested. Waiting for cleanup...', 'warning');
            setLogExpanded(true);
        } else {
            appendLog(res.error || 'Failed to stop process.', 'error');
            setIsRunning(false);
            setActiveTask(null);
            setLogExpanded(true);
        }
    };

    const handleLoginOnly = async () => {
        const normalizedConfig = await prepareRunConfig();
        if (!normalizedConfig) return;

        setLogs([]);
        setPromptMsg('');
        setPaymentUrl('');
        if (!window.electronAPI) {
            appendLog('Electron bridge is unavailable. Run the desktop app to start pre-login.', 'error');
            setLogExpanded(true);
            return;
        }

        setIsRunning(true);
        setActiveTask('login');
        setCurrentPhase('login');
        setLogExpanded(false);
        const res = await window.electronAPI.startBooking({ ...normalizedConfig, LOGIN_ONLY: true, REFRESH_LOGIN: true });
        if (!res.success) {
            setLogs((prev) => [...prev, { type: 'log', level: 'error', message: res.error || 'Failed to start login' }]);
            setIsRunning(false);
            setActiveTask(null);
            setLogExpanded(true);
        }
    };

    const handlePromptSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (window.electronAPI && promptMsg) {
            window.electronAPI.sendBackendInput(promptInput);
            appendLog(`> ${promptInput}`, 'input');
            setPromptMsg('');
            setPromptInput('');
        }
    };

    const handleOnboardingComplete = async (credentials: { MOBILE_NUMBER: string; PASSWORD: string }) => {
        if (!(await saveCredentials({ ...config, ...credentials }))) return;
        setConfig((prev) => ({ ...prev, ...credentials }));
        setShowOnboarding(false);
    };

    const logClassName = (level?: LogLevel) => {
        if (level === 'error') return 'text-red-400';
        if (level === 'warning') return 'text-amber-300';
        if (level === 'input') return 'text-cyan-300 font-bold';
        if (level === 'info') return 'text-slate-300';
        return 'text-emerald-300';
    };

    const latestLog = logs.length ? logs[logs.length - 1].message : 'No activity yet.';
    const statusText = activeTask === 'login' ? 'Pre-login running' : activeTask === 'booking' ? 'Booking running' : 'Idle';

    if (showOnboarding) {
        return (
            <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
                <TitleBar />
                <div className="flex flex-1 relative overflow-hidden">
                    <Onboarding onComplete={handleOnboardingComplete} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
            <TitleBar />

            <div className="flex flex-1 min-h-0 overflow-hidden">
                <aside className="w-[318px] shrink-0 border-r border-slate-800 bg-slate-950 flex flex-col">
                    <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                                <TrainFront size={22} className="text-slate-950" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-base font-bold text-white truncate">Raleway</h1>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${serverOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{serverOnline ? 'Online' : 'Offline'}</div>
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleLoginOnly}
                            disabled={isRunning}
                            title="Refresh login session"
                            className={`w-9 h-9 rounded-md border flex items-center justify-center ${
                                isRunning
                                    ? 'text-slate-600 border-slate-800 bg-slate-900 cursor-not-allowed'
                                    : 'text-cyan-300 border-slate-700 bg-slate-900 hover:border-cyan-500 hover:text-cyan-200'
                            }`}
                        >
                            <RefreshCcw size={17} className={activeTask === 'login' ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto thin-scrollbar p-5 space-y-5">
                        <section className="premium-card p-4 bg-slate-900/30">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Route Selection</div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowScheduleModal(true)}
                                        className={`w-8 h-8 rounded-lg border transition-all ${
                                            config.SCHEDULE_TIME
                                                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                                                : 'border-slate-800 bg-slate-900 text-slate-500 hover:text-white'
                                        }`}
                                        title={config.SCHEDULE_TIME ? `Scheduled for ${config.SCHEDULE_TIME}` : 'Schedule booking'}
                                    >
                                        <CalendarClock size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="route-visual px-1">
                                <div className="flex flex-col items-center gap-1">
                                    <div className="route-dot" />
                                    <div className="text-[10px] font-bold text-slate-400">{config.FROM_CITY || 'From'}</div>
                                </div>
                                <div className="flex-1 px-4">
                                    <div className="route-line" />
                                    {isRunning && <div className="route-line-active w-full" />}
                                    <div className="flex justify-center -mt-3.5 relative z-10">
                                        <div className="bg-slate-900 p-1 rounded-full border border-slate-800">
                                            <TrainFront size={12} className={isRunning ? 'text-cyan-400 animate-pulse' : 'text-slate-600'} />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <div className="route-dot destination" />
                                    <div className="text-[10px] font-bold text-slate-400">{config.TO_CITY || 'To'}</div>
                                </div>
                            </div>

                            <div className="space-y-3 mt-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelClass}>From</label>
                                        <div className="relative">
                                            <MapPin size={14} className="absolute left-3 top-2.5 text-slate-500" />
                                            <input list="stations" className={`${inputClass} pl-9`} value={config.FROM_CITY} onChange={(e) => setConfig({ ...config, FROM_CITY: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>To</label>
                                        <div className="relative">
                                            <MapPin size={14} className="absolute left-3 top-2.5 text-slate-500" />
                                            <input list="stations" className={`${inputClass} pl-9`} value={config.TO_CITY} onChange={(e) => setConfig({ ...config, TO_CITY: e.target.value })} />
                                        </div>
                                    </div>
                                </div>

                                <datalist id="stations">
                                    {STATIONS.map((station) => (
                                        <option key={station} value={station} />
                                    ))}
                                </datalist>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelClass}>Date</label>
                                        <input
                                            type="date"
                                            min={formatLocalDate(new Date())}
                                            max={formatLocalDate(addLocalDays(new Date(), 10))}
                                            className={inputClass}
                                            value={config.DATE_OF_JOURNEY}
                                            onChange={(e) => setConfig({ ...config, DATE_OF_JOURNEY: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Train</label>
                                        <input className={inputClass} value={config.TRAIN_NUMBER} onChange={(e) => setConfig({ ...config, TRAIN_NUMBER: e.target.value })} />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>Class</label>
                                    <select className={inputClass} value={config.SEAT_CLASS} onChange={(e) => setConfig({ ...config, SEAT_CLASS: e.target.value })}>
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
                            </div>
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Seats</div>
                                    <div className="text-sm text-slate-300">{config.FLEXIBLE_SEAT_COUNT ? 'Flexible fallback enabled' : 'Strict exact count'}</div>
                                </div>
                                <div className="text-2xl font-bold text-white">{config.MAX_SELECTABLE_SEAT}</div>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                                {['1', '2', '3', '4'].map((count) => (
                                    <button
                                        key={count}
                                        type="button"
                                        onClick={() => setConfig({ ...config, MAX_SELECTABLE_SEAT: count })}
                                        className={`h-9 rounded-md text-sm font-bold border ${
                                            config.MAX_SELECTABLE_SEAT === count
                                                ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                                        }`}
                                    >
                                        {count}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => setConfig({ ...config, FLEXIBLE_SEAT_COUNT: !config.FLEXIBLE_SEAT_COUNT })}
                                className={`w-full rounded-md border px-3 py-2 text-left ${
                                    config.FLEXIBLE_SEAT_COUNT
                                        ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                                        : 'border-slate-700 bg-slate-900 text-slate-300'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-widest">Flexible seats</span>
                                    <span className={`w-9 h-5 rounded-full p-0.5 ${config.FLEXIBLE_SEAT_COUNT ? 'bg-amber-400' : 'bg-slate-700'}`}>
                                        <span className={`block w-4 h-4 rounded-full bg-slate-950 transition-transform ${config.FLEXIBLE_SEAT_COUNT ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </span>
                                </div>
                                <div className="text-xs mt-1 text-slate-400">
                                    {config.FLEXIBLE_SEAT_COUNT ? 'Accepts fewer seats if the exact count cannot be reserved.' : 'Requires the exact selected count before payment.'}
                                </div>
                            </button>

                            <div>
                                <label className={labelClass}>Specific seats</label>
                                <input
                                    className={inputClass}
                                    placeholder="SCHA-11,SCHA-12"
                                    value={config.DESIRED_SEATS}
                                    onChange={(e) => setConfig({ ...config, DESIRED_SEATS: e.target.value })}
                                />
                            </div>
                        </section>
                    </div>

                    <div className="p-5 border-t border-slate-800 space-y-3">
                        <button
                            type="button"
                            onClick={handleStart}
                            disabled={isRunning}
                            className={`w-full h-11 rounded-md font-bold flex items-center justify-center gap-2 ${
                                isRunning
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/15'
                            }`}
                        >
                            <Play size={17} />
                            {activeTask === 'booking' ? 'Booking Running' : 'Start Booking'}
                        </button>
                        {isRunning && (
                            <button
                                type="button"
                                onClick={handleStop}
                                className="w-full h-10 rounded-md font-bold flex items-center justify-center gap-2 bg-red-500 text-white hover:bg-red-400"
                            >
                                <Square size={15} />
                                Stop Process
                            </button>
                        )}
                    </div>
                </aside>

                <main className="flex-1 min-w-0 overflow-y-auto thin-scrollbar bg-slate-950">
                    <div className="p-6 space-y-5 max-w-6xl">
                        <div className="flex items-start justify-between gap-6">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-400">Workspace</div>
                                <h2 className="text-2xl font-bold text-white mt-1">Booking control center</h2>
                                <div className="text-sm text-slate-500 mt-1">Pre-login can run now. Scheduled time only delays booking actions.</div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">System time</div>
                                <div className="text-2xl font-mono font-bold text-white">{currentTime.toLocaleTimeString([], { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <section className={`${panelClass} p-5`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 text-cyan-300">
                                            <ShieldCheck size={18} />
                                            <span className="text-xs font-bold uppercase tracking-widest">Authentication</span>
                                        </div>
                                        <div className="text-lg font-bold text-white mt-3">{userInfo ? 'Session active' : 'Session not verified'}</div>
                                        <div className="text-xs text-slate-500 mt-1 truncate">{userInfo?.email || 'Refresh login before the booking window.'}</div>
                                    </div>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${userInfo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                                        {userInfo ? <User size={19} /> : <RefreshCcw size={18} />}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mt-5">
                                    <div>
                                        <label className={labelClass}>Mobile</label>
                                        <input
                                            className={inputClass}
                                            value={config.MOBILE_NUMBER}
                                            onChange={(e) => {
                                                setCredentialsSaved(false);
                                                setConfig({ ...config, MOBILE_NUMBER: e.target.value });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Password</label>
                                        <input
                                            type="password"
                                            className={inputClass}
                                            value={config.PASSWORD}
                                            onChange={(e) => {
                                                setCredentialsSaved(false);
                                                setConfig({ ...config, PASSWORD: e.target.value });
                                            }}
                                        />
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => saveCredentials()}
                                    disabled={isRunning}
                                    className={`w-full mt-3 h-9 rounded-md text-xs font-bold flex items-center justify-center gap-2 border ${
                                        credentialsSaved
                                            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                                            : isRunning
                                                ? 'border-slate-800 bg-slate-900 text-slate-600 cursor-not-allowed'
                                                : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white'
                                    }`}
                                >
                                    {credentialsSaved ? <CheckCircle2 size={14} /> : <Save size={14} />}
                                    {credentialsSaved ? 'Saved' : 'Save credentials'}
                                </button>
                            </section>

                            <section className={`${panelClass} p-5`}>
                                <div className="flex items-center gap-2 text-amber-300">
                                    <CalendarClock size={18} />
                                    <span className="text-xs font-bold uppercase tracking-widest">Schedule</span>
                                </div>
                                <div className="text-lg font-bold text-white mt-3">{config.SCHEDULE_TIME || 'Start immediately'}</div>
                                <div className="text-xs text-slate-500 mt-1">Login refresh is never delayed by this setting.</div>
                                <button
                                    type="button"
                                    onClick={() => setShowScheduleModal(true)}
                                    className="w-full mt-5 h-9 rounded-md text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 hover:text-white"
                                >
                                    Edit schedule
                                </button>
                            </section>

                            <section className={`${panelClass} p-5`}>
                                <div className="flex items-center gap-2 text-emerald-300">
                                    <CheckCircle2 size={18} />
                                    <span className="text-xs font-bold uppercase tracking-widest">Seat policy</span>
                                </div>
                                <div className="text-lg font-bold text-white mt-3">{config.FLEXIBLE_SEAT_COUNT ? 'Flexible' : 'Strict'}</div>
                                <div className="text-xs text-slate-500 mt-1">
                                    {config.FLEXIBLE_SEAT_COUNT ? 'Can continue with fewer seats.' : `Must reserve exactly ${config.MAX_SELECTABLE_SEAT} seats.`}
                                </div>
                                <div className="mt-5 h-9 rounded-md bg-slate-950 border border-slate-800 flex items-center justify-center text-sm font-mono text-slate-300">
                                    {config.MAX_SELECTABLE_SEAT} selected
                                </div>
                            </section>
                        </div>

                        <section className="premium-card p-6 bg-slate-900/40">
                            <div className="flex items-center justify-between gap-4 mb-6">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">Execution Flow</div>
                                    <div className="text-sm text-slate-400 mt-1">Real-time booking stage tracking</div>
                                </div>
                                <div className={`status-pill ${isRunning ? 'active pulse-emerald' : 'idle'}`}>
                                    {statusText}
                                </div>
                            </div>
                            
                            <div className="relative">
                                {/* Progress Line */}
                                <div className="absolute top-[18px] left-0 right-0 h-1 bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-1000"
                                        style={{ 
                                            width: currentPhase === 'idle' ? '0%' :
                                                   currentPhase === 'login' ? '20%' :
                                                   currentPhase === 'searching' ? '40%' :
                                                   currentPhase === 'booking' ? '60%' :
                                                   currentPhase === 'otp' ? '80%' :
                                                   currentPhase === 'payment' ? '90%' :
                                                   currentPhase === 'completed' ? '100%' : '0%'
                                        }}
                                    />
                                </div>

                                <div className="grid grid-cols-5 gap-2 relative z-10">
                                    {[
                                        { id: 'login', label: 'Auth', icon: ShieldCheck },
                                        { id: 'searching', label: 'Search', icon: RefreshCcw },
                                        { id: 'booking', label: 'Reserve', icon: TrainFront },
                                        { id: 'otp', label: 'Verify', icon: ShieldCheck },
                                        { id: 'payment', label: 'Pay', icon: ExternalLink }
                                    ].map((step, index) => {
                                        const phases = ['idle', 'login', 'searching', 'booking', 'otp', 'payment', 'completed'];
                                        const currentIdx = phases.indexOf(currentPhase);
                                        const stepIdx = phases.indexOf(step.id);
                                        const isCompleted = currentIdx > stepIdx || currentPhase === 'completed';
                                        const isActive = step.id === currentPhase;

                                        return (
                                            <div key={step.id} className="flex flex-col items-center">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                                                    isCompleted ? 'bg-emerald-500 border-emerald-500 text-slate-950' :
                                                    isActive ? 'bg-cyan-500 border-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]' :
                                                    'bg-slate-900 border-slate-800 text-slate-500'
                                                }`}>
                                                    {isCompleted ? <CheckCircle2 size={18} /> : <step.icon size={18} className={isActive ? 'animate-spin-slow' : ''} />}
                                                </div>
                                                <div className={`text-[10px] font-bold uppercase tracking-wider mt-2 ${isActive ? 'text-cyan-400' : isCompleted ? 'text-emerald-400' : 'text-slate-600'}`}>
                                                    {step.label}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>
                    </div>

                    {promptMsg && (
                        <div className="fixed left-[342px] right-6 bottom-[76px] z-40 bg-slate-900 border border-amber-400/40 p-4 rounded-lg shadow-2xl shadow-black/40">
                            <div className="text-sm font-bold text-amber-300 flex items-center gap-2 mb-3">
                                <Terminal size={16} />
                                {promptMsg}
                            </div>
                            <form onSubmit={handlePromptSubmit} className="flex gap-3">
                                <input
                                    autoFocus
                                    className={inputClass}
                                    value={promptInput}
                                    onChange={(e) => setPromptInput(e.target.value)}
                                />
                                <button type="submit" className="px-5 rounded-md bg-amber-400 text-slate-950 text-sm font-bold hover:bg-amber-300">
                                    Submit
                                </button>
                            </form>
                        </div>
                    )}

                    {paymentUrl && (
                        <div className="fixed left-[318px] right-0 top-8 bottom-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6 z-50">
                            <div className="bg-slate-900 border border-emerald-500/30 p-8 rounded-lg shadow-2xl shadow-black/50 max-w-md w-full text-center">
                                <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-5">
                                    <CheckCircle2 size={34} className="text-emerald-300" />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">Booking confirmed</h2>
                                <div className="text-sm text-slate-400 mb-7">Your seats are reserved. Open the payment portal to complete checkout.</div>
                                <button
                                    onClick={() => window.electronAPI?.openExternal(paymentUrl)}
                                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 rounded-md font-bold text-slate-950 flex items-center justify-center gap-2"
                                >
                                    <ExternalLink size={20} />
                                    Open payment portal
                                </button>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            <section className={`border-t border-slate-800 bg-slate-950 transition-[height] duration-200 ${logExpanded ? 'h-72' : 'h-12'} shrink-0`}>
                <div className="h-12 px-4 flex items-center justify-between">
                    <button type="button" onClick={() => setLogExpanded(!logExpanded)} className="flex items-center gap-2 text-left min-w-0">
                        <Terminal size={16} className="text-slate-500 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 shrink-0">Execution log</span>
                        {!logExpanded && (
                            <span className={`text-xs truncate ${logClassName(logs[logs.length - 1]?.level)}`}>{latestLog}</span>
                        )}
                    </button>
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${isRunning ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-slate-500 bg-slate-900 border-slate-800'}`}>
                            {statusText}
                        </span>
                        <button
                            type="button"
                            onClick={() => setLogs([])}
                            disabled={logs.length === 0}
                            title="Clear logs"
                            className={`p-1.5 rounded ${logs.length === 0 ? 'text-slate-700 cursor-not-allowed' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                        >
                            <Trash2 size={15} />
                        </button>
                        <button type="button" onClick={() => setLogExpanded(!logExpanded)} className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-slate-800">
                            {logExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                        </button>
                    </div>
                </div>
                {logExpanded && (
                    <div className="h-[calc(18rem-3rem)] overflow-y-auto thin-scrollbar px-10 py-6 font-mono text-sm leading-relaxed">
                        {logs.length === 0 && <div className="h-full flex items-center justify-center text-xs text-slate-600 font-sans">No activity yet. Terminal is ready.</div>}
                        <div className="timeline">
                            {logs.map((log, i) => (
                                <div key={i} className="timeline-item">
                                    <div className={`timeline-marker ${log.level || 'info'}`} />
                                    <div className="timeline-content">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                                                {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </span>
                                            <span className={`status-pill ${log.level || 'info'} scale-75 origin-left`}>
                                                {log.level || 'info'}
                                            </span>
                                        </div>
                                        <div className={`${logClassName(log.level)} text-slate-300 break-words`}>
                                            {log.message}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div ref={logsEndRef} />
                    </div>
                )}
            </section>

            {showScheduleModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/75" onClick={() => setShowScheduleModal(false)} />
                    <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-2xl shadow-black/50">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-amber-400/10 rounded-md flex items-center justify-center">
                                <CalendarClock size={22} className="text-amber-300" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Schedule booking</h3>
                                <div className="text-xs text-slate-500">Pre-login still starts immediately.</div>
                            </div>
                        </div>

                        <label className={labelClass}>Target time</label>
                        <input
                            type="time"
                            step="1"
                            className="w-full bg-slate-950 border border-slate-700 rounded-md p-4 text-3xl font-mono font-bold text-amber-300 text-center focus:border-amber-400 outline-none [color-scheme:dark]"
                            value={config.SCHEDULE_TIME}
                            onChange={(e) => setConfig({ ...config, SCHEDULE_TIME: e.target.value })}
                        />

                        <div className="flex gap-3 mt-6">
                            <button
                                type="button"
                                onClick={() => {
                                    setConfig({ ...config, SCHEDULE_TIME: '' });
                                    setShowScheduleModal(false);
                                }}
                                className="flex-1 py-3 rounded-md text-xs font-bold text-red-300 bg-red-500/10 border border-red-500/20 hover:bg-red-500/15"
                            >
                                Clear
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowScheduleModal(false)}
                                className="flex-1 py-3 rounded-md text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
