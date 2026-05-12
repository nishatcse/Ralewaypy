import React, { useEffect, useRef, useState } from 'react';
import {
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Lock,
    Play,
    RefreshCcw,
    Settings,
    ShieldCheck,
    Square,
    Terminal,
    TrainFront,
    Trash2,
    User,
    Eye,
    EyeOff,
    Copy,
    Check,
    CreditCard,
    MapPin,
    Hash,
    Calendar
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
    REFRESH_LOGIN?: boolean;
    LOGIN_ONLY?: boolean;
};

type LogLevel = 'error' | 'warning' | 'input' | 'success' | 'info';

const inputClass = 'w-full bg-slate-950/80 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500/40 focus:bg-slate-950 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all group-hover:border-cyan-500/30';
const labelClass = 'block text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1.5 ml-1';
const panelClass = 'control-node';

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

    const [logs, setLogs] = useState<{ type: string; message: string; level?: LogLevel }[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [activeTask, setActiveTask] = useState<'login' | 'booking' | null>(null);
    const [promptMsg, setPromptMsg] = useState('');
    const [otpSuccess, setOtpSuccess] = useState(false);
    const [submittedPassengerNames, setSubmittedPassengerNames] = useState<string[]>([]);
    const promptMsgRef = useRef('');
    useEffect(() => { promptMsgRef.current = promptMsg; }, [promptMsg]);
    const [promptInput, setPromptInput] = useState('');
    const [paymentUrl, setPaymentUrl] = useState('');
    const [showPaymentPortal, setShowPaymentPortal] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(true);
    const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [hasRestoredConfig, setHasRestoredConfig] = useState(false);
    const [credentialsSaved, setCredentialsSaved] = useState(false);
    const [logExpanded, setLogExpanded] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [foundSeat, setFoundSeat] = useState<string | null>(null);
    const [trainName, setTrainName] = useState<string | null>(null);
    const [reservedSeats, setReservedSeats] = useState<string[]>([]);
    const [otpTimeLeft, setOtpTimeLeft] = useState<number | null>(null);
    const [otpError, setOtpError] = useState(false);
    const [otp, setOtp] = useState('');
    const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
    const [copied, setCopied] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const maskPhone = (phone: string) => {
        if (!phone || phone.length < 5) return '---';
        return `${phone.slice(0, 3)}••••${phone.slice(-4)}`;
    };

    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
            setOtpTimeLeft(prev => (prev !== null && prev > 0) ? prev - 1 : prev);
        }, 1000);
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
                    setLogs((prev) => [...prev, { type: 'log', message: event.message, level: event.level }]);
                    if (event.message.includes('Selected seat:')) {
                        const match = event.message.match(/Selected seat:\s*([A-Z0-9-]+)/i);
                        if (match) setFoundSeat(match[1]);
                    }
                    if (event.message.includes('reserved!')) {
                        const match = event.message.match(/Seat\s*([A-Z0-9-]+)\s*reserved!/i);
                        if (match) {
                            setReservedSeats(prev => prev.includes(match[1]) ? prev : [...prev, match[1]]);
                        }
                    }
                    if (event.message.toLowerCase().includes('timer:')) {
                        const match = event.message.match(/(\d+)s/);
                        if (match) setOtpTimeLeft(parseInt(match[1]));
                    }
                    if (event.message.toLowerCase().includes('wrong otp') || event.message.toLowerCase().includes('invalid otp')) {
                        setOtpError(true);
                        window.setTimeout(() => setOtpError(false), 3000);
                    }
                    if (event.message.includes('Trip details found!')) {
                        const match = event.message.match(/Train:\s*(.*?),/i);
                        if (match) setTrainName(match[1]);
                    }
                    if (event.message.includes('Verification successful!')) {
                        setOtpSuccess(true);
                        setPromptMsg('');
                    }
                } else if (event.type === 'prompt') {
                    setPromptMsg(event.message);
                    setLogExpanded(false);
                } else if (event.type === 'payment_url') {
                    setPaymentUrl(event.url);
                    setShowPaymentPortal(true);
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
        setLogs((prev) => [...prev, { type: 'log', message, level }]);
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

    const handleCopyLogs = () => {
        if (logs.length === 0) return;
        const text = logs.map(l => l.message).join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        appendLog('> Logs copied to clipboard', 'info');
    };

    const handleStart = async () => {
        setFoundSeat(null);
        setTrainName(null);
        setReservedSeats([]);
        setOtpTimeLeft(null);
        setOtpError(false);
        setOtp('');
        const normalizedConfig = await prepareRunConfig();
        if (!normalizedConfig) return;

        setLogs([]);
        setPromptMsg('');
        setOtpSuccess(false);
        setSubmittedPassengerNames([]);
        setPaymentUrl('');
        setShowPaymentPortal(false);
        if (!window.electronAPI) {
            appendLog('Electron bridge is unavailable. Run the desktop app to start booking.', 'error');
            setLogExpanded(true);
            return;
        }

        // Always refresh login if the user changed credentials OR if explicitly requested
        const savedMobile = localStorage.getItem('raleway_mobile');
        const lastSessionMobile = localStorage.getItem('raleway_last_session_mobile');
        const forceRefresh = normalizedConfig.REFRESH_LOGIN || (savedMobile !== lastSessionMobile);

        setIsRunning(true);
        setActiveTask('booking');
        setLogExpanded(false);
        const res = await window.electronAPI.startBooking({ ...normalizedConfig, REFRESH_LOGIN: forceRefresh });
        if (res.success) {
            localStorage.setItem('raleway_last_session_mobile', normalizedConfig.MOBILE_NUMBER);
        } else {
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
        setOtpSuccess(false);
        setPaymentUrl('');
        setShowPaymentPortal(false);
        if (!window.electronAPI) {
            appendLog('Electron bridge is unavailable. Run the desktop app to start pre-login.', 'error');
            setLogExpanded(true);
            return;
        }

        setIsRunning(true);
        setActiveTask('login');
        setLogExpanded(false);
        const res = await window.electronAPI.startBooking({ ...normalizedConfig, LOGIN_ONLY: true, REFRESH_LOGIN: true });
        if (!res.success) {
            setLogs((prev) => [...prev, { type: 'log', level: 'error', message: res.error || 'Failed to start login' }]);
            setIsRunning(false);
            setActiveTask(null);
            setLogExpanded(true);
        }
    };

    const handlePromptSubmit = async (valueOverride?: any) => {
        if (valueOverride && typeof valueOverride === 'object' && 'preventDefault' in valueOverride) {
            valueOverride.preventDefault();
        }
        
        const config = getPromptConfig();
        if (window.electronAPI && promptMsg && !isSubmittingPrompt) {
            const input = valueOverride && typeof valueOverride === 'string' 
                ? valueOverride 
                : (config.mode === 'otp' ? otp : promptInput);
            
            if (!input || !input.trim()) return;

            setIsSubmittingPrompt(true);
            try {
                const submittedPrompt = promptMsg;
                await window.electronAPI.sendBackendInput(input);
                appendLog(`> ${config.mode === 'otp' ? 'OTP Submitted' : input}`, 'input');
                
                // Handle verification outcomes for Node 04 persistence
                if (config.mode === 'otp') {
                    setOtpSuccess(true);
                } else if (config.mode === 'text' && (promptMsg.toLowerCase().includes('passenger') || promptMsg.toLowerCase().includes('name'))) {
                    setSubmittedPassengerNames(prev => [...prev, input]);
                }
                
                // Clear state for next prompt
                setOtp('');
                setPromptInput('');
                
                setTimeout(() => {
                    if (promptMsgRef.current === submittedPrompt) {
                        setPromptMsg('');
                    }
                    setIsSubmittingPrompt(false);
                }, 800);
            } catch (err) {
                console.error('Failed to send input', err);
                setIsSubmittingPrompt(false);
            }
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

    const getPromptConfig = () => {
        const msg = promptMsg.toLowerCase();
        
        // Payment Method Selection Detection
        if (msg.includes('select payment method') || msg.includes('1-bkash') || msg.includes('choice (1-7)')) {
            return {
                title: 'Payment Gateway',
                subtitle: 'Select your preferred transaction method',
                icon: <CreditCard size={32} />,
                mode: 'select',
                options: [
                    { id: '1', name: 'BKASH', color: 'bg-[#E2136E]', logo: '/assets/payment/bkash-home.png' },
                    { id: '2', name: 'NAGAD', color: 'bg-[#F7941D]', logo: '/assets/payment/nagad-32.png' },
                    { id: '3', name: 'ROCKET', color: 'bg-[#8C3494]', logo: '/assets/payment/rocket-home.svg' },
                    { id: '4', name: 'UPAY', logoColor: 'bg-[#FFCA05]', logo: '/assets/payment/upay-home.svg' },
                    { id: '5', name: 'VISA', logoColor: 'bg-[#1A1F71]', logo: '/assets/payment/visa-home.png' },
                    { id: '6', name: 'MASTERCARD', logoColor: 'bg-[#EB001B]', logo: '/assets/payment/master-card-home.png' },
                    { id: '7', name: 'NEXUS', logoColor: 'bg-[#007A33]', logo: '/assets/payment/nexus-debit-home.svg' },
                ],
                btnText: 'Proceed to Payment'
            };
        }

        if (msg.includes('otp') || msg.includes('verification code') || msg.includes('validate')) {
            return {
                title: 'Identity Verification',
                subtitle: 'Enter the 4-digit security key sent to your mobile',
                icon: <Lock size={32} />,
                mode: 'otp',
                btnText: 'Validate Key',
                placeholder: ''
            };
        }
        if (msg.includes('passenger') || msg.includes('name')) {
            return {
                title: 'Passenger Details',
                subtitle: 'Enter the legal name for additional passenger',
                icon: <User size={32} />,
                mode: 'text',
                btnText: 'Confirm Passenger',
                placeholder: 'Enter full name...'
            };
        }
        if (msg.includes('payment') || msg.includes('bkash') || msg.includes('pin')) {
            return {
                title: 'Payment Authorization',
                subtitle: 'Complete the bKash transaction security step',
                icon: <ShieldCheck size={32} />,
                mode: 'text',
                btnText: 'Authorize Payment',
                placeholder: 'Enter required info...'
            };
        }
        return {
            title: 'Action Required',
            subtitle: promptMsg,
            icon: <Terminal size={32} />,
            mode: 'text',
            btnText: 'Submit Response',
            placeholder: 'Type here...'
        };
    };

    const pConfig = getPromptConfig();

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
            <TitleBar />

            <div className="flex flex-1 min-h-0 overflow-hidden">
                <aside className="w-[340px] shrink-0 border-r border-white/5 bg-slate-950 flex flex-col tech-grid-sm">
                    <div className="h-16 px-5 border-b border-white/5 flex items-center justify-between bg-slate-900/20">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
                                <TrainFront size={22} className="text-slate-950" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-sm font-black text-white tracking-[0.1em] uppercase">Raleway</h1>
                                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-none">Control Console</div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleLoginOnly}
                            disabled={isRunning}
                            title="Refresh login session"
                            className={`w-9 h-9 rounded-lg border transition-all flex items-center justify-center ${
                                isRunning
                                    ? 'text-slate-600 border-slate-800 bg-slate-950 cursor-not-allowed'
                                    : 'text-cyan-400 border-white/5 bg-slate-900/50 hover:border-cyan-500/50 hover:bg-cyan-500/5'
                            }`}
                        >
                            <RefreshCcw size={15} className={activeTask === 'login' ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto thin-scrollbar p-5 space-y-5">
                        <section className="bg-slate-900/20 rounded-xl p-3 border border-white/5">
                            <div className="flex items-center justify-between mb-4 px-1">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Journey</div>
                                    <div className="text-[11px] text-cyan-400/80 font-mono mt-0.5 truncate max-w-[240px]">
                                        {config.FROM_CITY || '---'} &gt; {config.TO_CITY || '---'}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowScheduleModal(true)}
                                    className={`w-9 h-9 rounded-lg border transition-all flex items-center justify-center ${
                                        config.SCHEDULE_TIME
                                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                                            : 'border-white/5 bg-slate-900 text-slate-500 hover:text-white hover:border-white/10'
                                    }`}
                                    title={config.SCHEDULE_TIME ? `Scheduled for ${config.SCHEDULE_TIME}` : 'Schedule booking'}
                                >
                                    <CalendarClock size={16} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-4">
                                    <div className="group relative">
                                        <label className={labelClass}>From</label>
                                        <div className="relative">
                                            <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                                            <input 
                                                className={`${inputClass} pl-9`} 
                                                placeholder="Origin Station"
                                                value={config.FROM_CITY} 
                                                onChange={(e) => {
                                                    setConfig({ ...config, FROM_CITY: e.target.value });
                                                    setOpenDropdown('from');
                                                }}
                                                onFocus={() => setOpenDropdown('from')}
                                            />
                                            {openDropdown === 'from' && (
                                                <>
                                                    <div className="fixed inset-0 z-[100]" onClick={() => setOpenDropdown(null)} />
                                                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-950 border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[101] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="max-h-64 overflow-y-auto thin-scrollbar py-2">
                                                            {STATIONS.filter(s => !config.FROM_CITY || s.toLowerCase().includes(config.FROM_CITY.toLowerCase())).length > 0 ? (
                                                                STATIONS.filter(s => !config.FROM_CITY || s.toLowerCase().includes(config.FROM_CITY.toLowerCase())).map((station) => (
                                                                    <button
                                                                        key={station}
                                                                        type="button"
                                                                        className={`w-full px-4 py-2.5 text-left text-sm transition-all flex items-center gap-3 ${
                                                                            config.FROM_CITY === station ? 'bg-cyan-500/20 text-cyan-400 font-bold border-l-2 border-cyan-500' : 'text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-300'
                                                                        }`}
                                                                        onClick={() => {
                                                                            setConfig({ ...config, FROM_CITY: station });
                                                                            setOpenDropdown(null);
                                                                        }}
                                                                    >
                                                                        <div className={`w-1.5 h-1.5 rounded-full transition-all ${config.FROM_CITY === station ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-transparent'}`} />
                                                                        {station}
                                                                    </button>
                                                                ))
                                                            ) : (
                                                                <div className="px-4 py-3 text-xs text-slate-500 italic">No matching stations</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="group relative">
                                        <label className={labelClass}>To</label>
                                        <div className="relative">
                                            <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                                            <input 
                                                className={`${inputClass} pl-9`} 
                                                placeholder="Destination Station"
                                                value={config.TO_CITY} 
                                                onChange={(e) => {
                                                    setConfig({ ...config, TO_CITY: e.target.value });
                                                    setOpenDropdown('to');
                                                }}
                                                onFocus={() => setOpenDropdown('to')}
                                            />
                                            {openDropdown === 'to' && (
                                                <>
                                                    <div className="fixed inset-0 z-[100]" onClick={() => setOpenDropdown(null)} />
                                                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-950 border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[101] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="max-h-64 overflow-y-auto thin-scrollbar py-2">
                                                            {STATIONS.filter(s => !config.TO_CITY || s.toLowerCase().includes(config.TO_CITY.toLowerCase())).length > 0 ? (
                                                                STATIONS.filter(s => !config.TO_CITY || s.toLowerCase().includes(config.TO_CITY.toLowerCase())).map((station) => (
                                                                    <button
                                                                        key={station}
                                                                        type="button"
                                                                        className={`w-full px-4 py-2.5 text-left text-sm transition-all flex items-center gap-3 ${
                                                                            config.TO_CITY === station ? 'bg-cyan-500/20 text-cyan-400 font-bold border-l-2 border-cyan-500' : 'text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-300'
                                                                        }`}
                                                                        onClick={() => {
                                                                            setConfig({ ...config, TO_CITY: station });
                                                                            setOpenDropdown(null);
                                                                        }}
                                                                    >
                                                                        <div className={`w-1.5 h-1.5 rounded-full transition-all ${config.TO_CITY === station ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-transparent'}`} />
                                                                        {station}
                                                                    </button>
                                                                ))
                                                            ) : (
                                                                <div className="px-4 py-3 text-xs text-slate-500 italic">No matching stations</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="group relative">
                                        <label className={labelClass}>Date of Journey</label>
                                        <div className="relative">
                                            <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                                            <input
                                                type="date"
                                                min={formatLocalDate(new Date())}
                                                max={formatLocalDate(addLocalDays(new Date(), 10))}
                                                className={`${inputClass} pl-9 pr-4 font-sans appearance-none`}
                                                value={config.DATE_OF_JOURNEY}
                                                onChange={(e) => setConfig({ ...config, DATE_OF_JOURNEY: e.target.value })}
                                                style={{ colorScheme: 'dark' }}
                                            />
                                        </div>
                                    </div>
                                    <div className="group relative">
                                        <label className={labelClass}>Train Number</label>
                                        <div className="relative">
                                            <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                                            <input 
                                                className={`${inputClass} pl-9 font-mono`} 
                                                placeholder="e.g. 701"
                                                value={config.TRAIN_NUMBER} 
                                                onChange={(e) => setConfig({ ...config, TRAIN_NUMBER: e.target.value })} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="group relative">
                                    <label className={labelClass}>Class</label>
                                        <div className="relative">
                                            <ShieldCheck size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                                            <button
                                                type="button"
                                                onClick={() => setOpenDropdown(openDropdown === 'class' ? null : 'class')}
                                                className={`${inputClass} pl-9 text-left flex items-center justify-between h-10`}
                                            >
                                                <span className={config.SEAT_CLASS ? 'text-slate-100' : 'text-slate-600'}>
                                                    {config.SEAT_CLASS || 'Select Class'}
                                                </span>
                                                <ChevronDown size={14} className={`text-slate-500 transition-transform duration-300 ${openDropdown === 'class' ? 'rotate-180' : ''}`} />
                                            </button>
                                            
                                            {openDropdown === 'class' && (
                                                <>
                                                    <div className="fixed inset-0 z-[100]" onClick={() => setOpenDropdown(null)} />
                                                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-950 border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[101] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="max-h-64 overflow-y-auto thin-scrollbar py-2">
                                                            {['AC_B', 'AC_S', 'SNIGDHA', 'F_BERTH', 'F_SEAT', 'F_CHAIR', 'S_CHAIR', 'SHOVAN', 'SHULOV', 'AC_CHAIR'].map((cls) => (
                                                                <button
                                                                    key={cls}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setConfig({ ...config, SEAT_CLASS: cls });
                                                                        setOpenDropdown(null);
                                                                    }}
                                                                    className={`w-full px-4 py-2 text-left text-sm transition-all flex items-center justify-between group/opt ${
                                                                        config.SEAT_CLASS === cls ? 'bg-cyan-500/20 text-cyan-400 font-bold border-l-2 border-cyan-500' : 'text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-300'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-1.5 h-1.5 rounded-full transition-all ${config.SEAT_CLASS === cls ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-transparent group-hover/opt:bg-slate-600'}`} />
                                                                        <span>{cls}</span>
                                                                    </div>
                                                                    {config.SEAT_CLASS === cls && <Check size={14} className="animate-in zoom-in-50" />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Seats</div>
                                    <div className="text-xs text-slate-400">{config.FLEXIBLE_SEAT_COUNT ? 'Flexible fallback active' : 'Strict exact count'}</div>
                                </div>
                                <div className="text-2xl font-black text-cyan-400 tabular-nums">{config.MAX_SELECTABLE_SEAT}</div>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                                {['1', '2', '3', '4'].map((count) => (
                                    <button
                                        key={count}
                                        type="button"
                                        onClick={() => setConfig({ ...config, MAX_SELECTABLE_SEAT: count })}
                                        className={`h-10 rounded-lg text-sm font-black border transition-all ${
                                            config.MAX_SELECTABLE_SEAT === count
                                                ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-lg shadow-cyan-500/20'
                                                : 'bg-slate-900/80 text-slate-400 border-white/5 hover:border-cyan-500/30 hover:bg-slate-900 hover:text-cyan-400'
                                        }`}
                                    >
                                        {count}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => setConfig({ ...config, FLEXIBLE_SEAT_COUNT: !config.FLEXIBLE_SEAT_COUNT })}
                                className={`w-full rounded-xl border p-3 text-left transition-all group ${
                                    config.FLEXIBLE_SEAT_COUNT
                                        ? 'border-amber-500/30 bg-amber-500/5 text-amber-200'
                                        : 'border-white/5 bg-slate-900/80 text-slate-300 hover:border-cyan-500/30 hover:bg-slate-900'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Flexible Policy</span>
                                    <div className={`w-8 h-4 rounded-full relative transition-colors ${config.FLEXIBLE_SEAT_COUNT ? 'bg-amber-500' : 'bg-slate-800'}`}>
                                        <div className={`absolute top-1 left-1 w-2 h-2 rounded-full bg-slate-950 transition-transform ${config.FLEXIBLE_SEAT_COUNT ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </div>
                                </div>
                                <div className="text-[11px] leading-relaxed text-slate-400/80">
                                    {config.FLEXIBLE_SEAT_COUNT ? 'Will proceed even if fewer seats are available.' : 'Requires exact seat count matching for transaction.'}
                                </div>
                            </button>

                            <div className="group relative">
                                <label className={labelClass}>Specific seats</label>
                                <div className="relative">
                                    <Terminal size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                                    <input
                                        className={`${inputClass} pl-9`}
                                        placeholder="e.g. SCHA-11, SCHA-12"
                                        value={config.DESIRED_SEATS}
                                        onChange={(e) => setConfig({ ...config, DESIRED_SEATS: e.target.value })}
                                    />
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="p-5 border-t border-white/5 space-y-3 bg-slate-950">
                        <button
                            type="button"
                            onClick={handleStart}
                            disabled={isRunning}
                            className={`w-full h-12 rounded-xl font-black uppercase tracking-[0.2em] text-[11px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                                isRunning
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                                    : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                            }`}
                        >
                            <Play size={16} fill="currentColor" />
                            {activeTask === 'booking' ? 'Booking in Progress' : 'Initiate Engine'}
                        </button>
                        {isRunning && (
                            <button
                                type="button"
                                onClick={handleStop}
                                className="w-full h-10 rounded-xl font-black uppercase tracking-[0.1em] text-[10px] flex items-center justify-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
                            >
                                <Square size={14} fill="currentColor" />
                                Terminate Process
                            </button>
                        )}
                    </div>
                </aside>

                <main className="flex-1 min-w-0 overflow-y-auto thin-scrollbar bg-slate-950 tech-grid">
                    <div className="p-6 space-y-5 w-full">
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

                        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4">
                            {/* Authentication Card */}
                            <section className={`${panelClass} p-5 2xl:col-span-2 group transition-all hover:bg-white/[0.03]`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 text-cyan-400 mb-4">
                                            <div className="p-1.5 rounded-md bg-cyan-500/10">
                                                <ShieldCheck size={16} />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Authentication</span>
                                        </div>
                                        
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-4">
                                                <div className="text-2xl font-bold text-white tracking-tight">
                                                    {userInfo ? userInfo.name : 'No Active Session'}
                                                </div>
                                                <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${userInfo ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                                    {userInfo ? 'Verified' : 'Unverified'}
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-6">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Mobile</span>
                                                    <span className="text-xs font-mono text-slate-300">{maskPhone(config.MOBILE_NUMBER)}</span>
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Security</span>
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-300">
                                                        <div className="flex gap-0.5">
                                                            {[1,2,3,4,5,6].map(i => <div key={i} className="w-1 h-1 rounded-full bg-slate-700" />)}
                                                        </div>
                                                        <Lock size={10} className="text-slate-600" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={() => setShowAuthModal(true)}
                                            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 text-slate-400 hover:bg-cyan-500/20 hover:text-cyan-400 border border-white/5 hover:border-cyan-500/20 transition-all group/btn"
                                            title="Edit Credentials"
                                        >
                                            <Settings size={18} className="group-hover/btn:rotate-90 transition-transform duration-500" />
                                        </button>
                                        <button
                                            onClick={() => handleLoginOnly()}
                                            disabled={isRunning}
                                            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-400 border border-white/5 hover:border-emerald-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                            title="Refresh Session"
                                        >
                                            <RefreshCcw size={18} className={isRunning ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                </div>
                            </section>

                            {/* Schedule Card */}
                            <section className={`${panelClass} p-5 group transition-all hover:bg-white/[0.03]`}>
                                <div className="flex items-center gap-2 text-amber-400 mb-4">
                                    <div className="p-1.5 rounded-md bg-amber-500/10">
                                        <CalendarClock size={16} />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Schedule</span>
                                </div>
                                
                                <div className="space-y-4">
                                    <div>
                                        <div className="text-2xl font-bold text-white tracking-tight">
                                            {config.SCHEDULE_TIME || 'Immediate'}
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-wider">
                                            {config.SCHEDULE_TIME ? 'Reservation Queue' : 'Manual Trigger Mode'}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setShowScheduleModal(true)}
                                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/5 text-slate-400 border border-white/5 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/20 transition-all"
                                    >
                                        Update time
                                    </button>
                                </div>
                            </section>

                            {/* Seat Policy Card */}
                            <section className={`${panelClass} p-5 group transition-all hover:bg-white/[0.03]`}>
                                <div className="flex items-center gap-2 text-emerald-400 mb-4">
                                    <div className="p-1.5 rounded-md bg-emerald-500/10">
                                        <CheckCircle2 size={16} />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Seat Policy</span>
                                </div>
                                
                                <div className="space-y-4">
                                    <div>
                                        <div className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-2">
                                            {config.MAX_SELECTABLE_SEAT}
                                            <span className="text-xs font-medium text-slate-500 uppercase tracking-widest">Seats</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <div className={`w-1.5 h-1.5 rounded-full ${config.FLEXIBLE_SEAT_COUNT ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                                {config.FLEXIBLE_SEAT_COUNT ? 'Flexible Flow' : 'Strict Match'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-white/5">
                                        <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Class</div>
                                        <div className="text-[10px] font-bold text-cyan-400 font-mono">{config.SEAT_CLASS}</div>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
                            <section className="xl:col-span-3 space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Execution pipeline</div>
                                        <div className="text-sm text-slate-400 mt-0.5">Real-time status of each operational node.</div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800">
                                            <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`} />
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{statusText}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className={`grid grid-cols-1 md:grid-cols-3 2xl:grid-cols-5 gap-4 relative transition-all duration-500 ${(promptMsg || pConfig.mode === 'select') ? 'pb-48' : 'pb-4'}`}>
                                    {/* Connection Lines (Desktop only) */}
                                    <div className="hidden 2xl:block absolute top-[50%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-y-1/2 -z-10" />

                                    {/* Card 1: Session */}
                                    <div className={`${panelClass} p-4 flex flex-col h-full border-t-2 ${userInfo ? 'node-active-emerald' : 'border-t-transparent'}`}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className={`p-2 rounded-lg ${userInfo ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-slate-600'}`}>
                                                <ShieldCheck size={18} />
                                            </div>
                                            <span className={`text-[9px] font-black uppercase tracking-tighter ${userInfo ? 'text-emerald-500' : 'text-slate-600'}`}>Node 01</span>
                                        </div>
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Session</h3>
                                        {userInfo ? (
                                            <div className="flex-1 flex flex-col justify-between">
                                                <div className="flex items-center gap-3 bg-slate-950/50 p-2 rounded border border-slate-800/50">
                                                    <div className="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs uppercase">
                                                        {userInfo.name.charAt(0)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] text-white font-bold truncate leading-tight">{userInfo.name}</div>
                                                        <div className="text-[9px] text-slate-500 font-mono truncate">{userInfo.email}</div>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={async () => {
                                                        if (isRunning) {
                                                            await handleStop();
                                                        }
                                                        localStorage.removeItem('raleway_mobile');
                                                        localStorage.removeItem('raleway_password');
                                                        localStorage.removeItem('raleway_last_session_mobile');
                                                        setUserInfo(null);
                                                        setConfig(prev => ({ ...prev, MOBILE_NUMBER: '', PASSWORD: '' }));
                                                        appendLog('Sign out successful. Local credentials cleared.', 'success');
                                                    }} 
                                                    className="mt-3 text-[9px] font-bold text-slate-500 hover:text-red-400 transition-colors uppercase tracking-widest text-left"
                                                >
                                                    Sign out
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex flex-col justify-center">
                                                <div className="text-[10px] text-slate-500 italic">No active session detected. Please login first.</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Card 2: Schedule */}
                                    <div className={`${panelClass} p-4 flex flex-col h-full border-t-2 ${(isRunning && activeTask === 'booking') ? 'node-active-amber' : 'border-t-transparent'}`}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className={`p-2 rounded-lg ${(isRunning && activeTask === 'booking') ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-slate-600'}`}>
                                                <CalendarClock size={18} />
                                            </div>
                                            <span className={`text-[9px] font-black uppercase tracking-tighter ${(isRunning && activeTask === 'booking') ? 'text-amber-500' : 'text-slate-600'}`}>Node 02</span>
                                        </div>
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Schedule</h3>
                                        <div className="flex-1 flex flex-col justify-between">
                                            {config.SCHEDULE_TIME ? (
                                                <>
                                                    <div className="bg-slate-950/50 p-2 rounded border border-slate-800/50">
                                                        <div className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter mb-1">Target release</div>
                                                        <div className="text-lg font-mono font-bold text-amber-400 leading-none">{config.SCHEDULE_TIME}</div>
                                                    </div>
                                                    <div className="mt-3 flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                                                        <span className="text-[9px] text-amber-300 font-bold uppercase tracking-widest">Waiting...</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="bg-slate-950/50 p-2 rounded border border-slate-800/50">
                                                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter mb-1">Mode</div>
                                                    <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Live Execution</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card 3: Search */}
                                    <div className={`${panelClass} p-4 flex flex-col h-full border-t-2 ${(isRunning && activeTask === 'booking' && !paymentUrl) ? 'node-active-cyan radar-pulse text-cyan-400' : 'border-t-transparent'}`}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className={`p-2 rounded-lg ${(isRunning && activeTask === 'booking' && !paymentUrl) ? 'bg-cyan-500/10 text-cyan-400' : 'bg-white/5 text-slate-600'}`}>
                                                <Square size={18} />
                                            </div>
                                            <span className={`text-[9px] font-black uppercase tracking-tighter ${(isRunning && activeTask === 'booking' && !paymentUrl) ? 'text-cyan-500' : 'text-slate-600'}`}>Node 03</span>
                                        </div>
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Seat Search</h3>
                                        <div className="flex-1 flex flex-col justify-center space-y-4">
                                            {(isRunning && activeTask === 'booking' && !paymentUrl) ? (
                                                <>
                                                    {(isRunning && !promptMsg && !paymentUrl) && (
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-2 text-cyan-400">
                                                                <div className="relative w-4 h-4">
                                                                    <div className="absolute inset-0 border-2 border-cyan-500 rounded-full animate-ping opacity-25" />
                                                                    <div className="absolute inset-0 border-2 border-cyan-400 rounded-full scale-50" />
                                                                </div>
                                                                <span className="text-[10px] font-bold uppercase tracking-widest">Polling API</span>
                                                            </div>
                                                            <div className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">High-frequency mode active</div>
                                                        </div>
                                                    )}
                                                    
                                                    <div className="space-y-2 pt-2 border-t border-white/5">
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Reservation Status</div>
                                                            {reservedSeats.length > 0 && <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest animate-pulse">Success</span>}
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {(config.DESIRED_SEATS || 'Auto').split(',').map(s => {
                                                                const trimmed = s.trim();
                                                                const isReserved = reservedSeats.includes(trimmed);
                                                                return (
                                                                    <span key={trimmed} className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all ${isReserved ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-white/5 border-white/5 text-slate-400'}`}>
                                                                        {trimmed}
                                                                    </span>
                                                                );
                                                            })}
                                                            {reservedSeats.map(rs => !config.DESIRED_SEATS.includes(rs) && (
                                                                <span key={rs} className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]">
                                                                    {rs}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="text-[10px] text-slate-500 italic">Waiting for schedule...</div>
                                                    {config.DESIRED_SEATS && (
                                                        <div className="pt-2 border-t border-white/5 opacity-40">
                                                            <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-2">Preset Targets</div>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {config.DESIRED_SEATS.split(',').map(s => (
                                                                    <span key={s} className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/5 border border-white/5 text-slate-600">
                                                                        {s.trim()}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card 4: OTP / Verification */}
                                    <div className={`${panelClass} p-4 flex flex-col h-full border-t-2 ${promptMsg && (pConfig.mode === 'otp' || pConfig.mode === 'text') ? 'node-active-purple' : otpSuccess ? 'node-active-emerald' : 'border-t-transparent'}`}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className={`p-2 rounded-lg ${promptMsg && (pConfig.mode === 'otp' || pConfig.mode === 'text') ? 'bg-purple-500/10 text-purple-400' : otpSuccess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-slate-600'}`}>
                                                {otpSuccess ? <CheckCircle2 size={18} /> : pConfig.mode === 'text' ? <User size={18} /> : <Lock size={18} />}
                                            </div>
                                            <span className={`text-[9px] font-black uppercase tracking-tighter ${promptMsg && (pConfig.mode === 'otp' || pConfig.mode === 'text') ? 'text-purple-500' : otpSuccess ? 'text-emerald-500' : 'text-slate-600'}`}>Node 04</span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-800" />
                                            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Verification</h3>
                                            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-800" />
                                        </div>
                                        <div className="flex-1 flex flex-col justify-center">
                                            {otpSuccess || submittedPassengerNames.length > 0 ? (
                                                <div className="space-y-3 text-center animate-in zoom-in-95 duration-500">
                                                    <div className="flex justify-center">
                                                        <div className="relative">
                                                            <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
                                                            <div className="relative w-12 h-12 rounded-full bg-slate-900 border-2 border-emerald-500/50 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                                                                <CheckCircle2 size={24} className="animate-in zoom-in-50 duration-500" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.25em]">Identity Verified</div>
                                                    <div className="flex flex-col gap-1.5 max-h-[100px] overflow-y-auto thin-scrollbar px-2">
                                                        {submittedPassengerNames.length > 0 ? submittedPassengerNames.map((name, i) => (
                                                            <div key={i} className="group relative bg-emerald-500/5 border border-emerald-500/10 hover:border-emerald-500/30 rounded-lg py-1.5 px-3 transition-all">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,1)]" />
                                                                    <div className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">
                                                                        {name}
                                                                    </div>
                                                                    <User size={8} className="ml-auto text-emerald-500/50" />
                                                                </div>
                                                            </div>
                                                        )) : (
                                                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-2 px-3 mx-auto inline-block">
                                                                <div className="text-[9px] text-emerald-300 font-bold uppercase tracking-widest">SESSION AUTHENTICATED</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-[10px] text-slate-500 italic text-center py-8">
                                                    <div className="flex justify-center mb-2 opacity-20">
                                                        <Lock size={24} />
                                                    </div>
                                                    {promptMsg ? 'Input Pending...' : 'Awaiting trigger...'}
                                                </div>
                                            )}
                                        </div>

                                        {/* Node 04 Branch Panel */}
                                        {promptMsg && (pConfig.mode === 'otp' || pConfig.mode === 'text') && (
                                            <div className="absolute top-full left-0 pt-4 z-50 w-[420px]">
                                                <div className="absolute top-0 left-10 w-px h-4 bg-purple-500/50" />
                                                <div 
                                                    className="bg-slate-900/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-6 shadow-2xl shadow-purple-900/40 animate-in slide-in-from-top-4 duration-500"
                                                >
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
                                                            <Terminal size={12} />
                                                            {pConfig.mode === 'otp' ? 'Secure Auth Gate' : 'Passenger Manifest'}
                                                        </div>
                                                        <div className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[8px] text-purple-300 font-black uppercase">Level 04</div>
                                                    </div>
                                                    
                                                    <form onSubmit={(e) => { e.preventDefault(); handlePromptSubmit(); }}>
                                                        {pConfig.mode === 'otp' ? (
                                                            <div 
                                                                className="flex justify-between gap-2 mb-5 relative cursor-text group"
                                                                onClick={() => document.getElementById('otp-hidden-input')?.focus()}
                                                            >
                                                                {[0, 1, 2, 3].map((i) => {
                                                                    const isActive = otp.length === i;
                                                                    const hasValue = otp.length > i;
                                                                    return (
                                                                        <div 
                                                                            key={i} 
                                                                            className={`flex-1 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-black transition-all duration-300 ${isActive ? 'border-purple-500 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : hasValue ? 'border-amber-500/50 bg-amber-500/5 text-amber-500' : 'border-white/5 bg-slate-950 text-slate-800'}`}
                                                                        >
                                                                            {otp[i] || (isActive ? <div className="w-0.5 h-6 bg-purple-400 animate-pulse rounded-full" /> : '•')}
                                                                        </div>
                                                                    );
                                                                })}
                                                                <input
                                                                    id="otp-hidden-input"
                                                                    type="text"
                                                                    maxLength={4}
                                                                    className="absolute inset-0 opacity-0 cursor-default"
                                                                    value={otp}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                                                        setOtp(val);
                                                                        if (val.length === 4) {
                                                                            handlePromptSubmit(val);
                                                                        }
                                                                    }}
                                                                    autoFocus
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="relative mb-5 group">
                                                                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-600 group-focus-within:text-purple-400 transition-colors">
                                                                    <User size={14} />
                                                                </div>
                                                                <input
                                                                    type="text"
                                                                    className="w-full bg-slate-950 border-2 border-white/5 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-white placeholder:text-slate-700 focus:border-purple-500/50 focus:bg-purple-500/5 outline-none transition-all shadow-inner"
                                                                    placeholder="Enter passenger name..."
                                                                    value={promptInput}
                                                                    onChange={(e) => setPromptInput(e.target.value)}
                                                                    autoFocus
                                                                />
                                                            </div>
                                                        )}
                                                        
                                                        <div className="flex gap-3">
                                                            <button 
                                                                type="submit"
                                                                disabled={isSubmittingPrompt || (pConfig.mode === 'otp' ? otp.length !== 4 : !promptInput.trim())}
                                                                className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-purple-900/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                                                            >
                                                                {isSubmittingPrompt ? <RefreshCcw size={14} className="animate-spin" /> : (
                                                                    <>
                                                                        <Check size={14} />
                                                                        CONFIRM IDENTITY
                                                                    </>
                                                                )}
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                onClick={() => { setOtp(''); setPromptInput(''); }}
                                                                className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase text-slate-500 hover:bg-white/10 hover:text-slate-400 transition-all"
                                                            >
                                                                RESET
                                                            </button>
                                                        </div>
                                                    </form>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Card 5: Checkout */}
                                    <div className={`${panelClass} p-4 flex flex-col h-full border-t-2 relative ${paymentUrl ? 'node-active-emerald' : pConfig.mode === 'select' ? 'node-active-cyan' : 'border-t-transparent'}`}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className={`p-2 rounded-lg ${paymentUrl ? 'bg-emerald-500/10 text-emerald-400' : pConfig.mode === 'select' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-white/5 text-slate-600'}`}>
                                                {paymentUrl ? <ShieldCheck size={18} /> : <CreditCard size={18} />}
                                            </div>
                                            <span className={`text-[9px] font-black uppercase tracking-tighter ${paymentUrl ? 'text-emerald-500' : pConfig.mode === 'select' ? 'text-cyan-500' : 'text-slate-600'}`}>Node 05</span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-800" />
                                            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Settlement</h3>
                                            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-800" />
                                        </div>
                                            <div className="flex-1 flex flex-col gap-2 justify-center">
                                                {paymentUrl ? (
                                                    <>
                                                        <button 
                                                            onClick={() => setShowPaymentPortal(true)}
                                                            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 rounded-md text-[10px] font-black text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                                                        >
                                                            <ExternalLink size={14} />
                                                            OPEN PORTAL
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(paymentUrl);
                                                                setCopied(true);
                                                                setTimeout(() => setCopied(false), 2000);
                                                            }}
                                                            className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-md text-[9px] font-black text-slate-400 hover:text-white flex items-center justify-center gap-2 transition-all"
                                                        >
                                                            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                            {copied ? 'LINK COPIED' : 'COPY PAYMENT URL'}
                                                        </button>
                                                    </>
                                                ) : (
                                                <div className="text-[10px] text-slate-500 italic text-center">
                                                    {pConfig.mode === 'select' ? 'Selection Pending...' : 'Waiting for seats...'}
                                                </div>
                                            )}
                                        </div>

                                        {/* Node 05 Branch Panel - WIDER & BETTER - POSITIONED LEFT TO AVOID OVERFLOW */}
                                        {pConfig.mode === 'select' && !paymentUrl && (
                                            <div className="absolute top-full right-0 pt-6 z-[100] w-[380px]">
                                                <div className="absolute top-0 right-10 w-px h-6 bg-cyan-500/50" />
                                                <div className="bg-slate-900/98 backdrop-blur-2xl border border-cyan-500/40 rounded-2xl p-5 shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(34,211,238,0.1)] animate-in slide-in-from-top-4 duration-500">
                                                    <div className="flex items-center justify-between mb-5">
                                                        <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                                                            <CreditCard size={12} />
                                                            Select Gateway
                                                        </div>
                                                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter bg-white/5 px-2 py-0.5 rounded">Checkout Level 05</div>
                                                    </div>
                                                    
                                                    <button 
                                                        onClick={() => handlePromptSubmit()}
                                                        disabled={isSubmittingPrompt || !promptInput}
                                                        className="w-full h-12 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-950 transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 mb-6"
                                                    >
                                                        {isSubmittingPrompt ? <RefreshCcw size={16} className="animate-spin" /> : (
                                                            <>
                                                                <ShieldCheck size={16} />
                                                                Confirm & Pay Now
                                                            </>
                                                        )}
                                                    </button>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        {pConfig.options?.map((opt) => (
                                                            <button
                                                                key={opt.id}
                                                                onClick={() => setPromptInput(opt.id)}
                                                                className={`group relative h-12 rounded-xl border-2 transition-all flex items-center px-4 overflow-hidden ${promptInput === opt.id ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'border-white/5 bg-slate-950 hover:border-white/10'}`}
                                                            >
                                                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${opt.color || opt.logoColor} opacity-80`} />
                                                                
                                                                <div className="flex items-center gap-3 w-full">
                                                                    <div className={`w-10 h-8 rounded-lg flex items-center justify-center p-1.5 ${opt.logoColor || 'bg-white'} shadow-sm`}>
                                                                        <img src={opt.logo} alt={opt.name} className="w-full h-full object-contain" />
                                                                    </div>
                                                                    <div className="flex flex-col items-start">
                                                                        <span className={`text-[9px] font-black tracking-widest ${promptInput === opt.id ? 'text-white' : 'text-slate-400'}`}>
                                                                            {opt.name}
                                                                        </span>
                                                                        <span className="text-[7px] text-slate-600 font-bold uppercase tracking-tighter">Fast Payment</span>
                                                                    </div>
                                                                    {promptInput === opt.id && (
                                                                        <div className="ml-auto w-4 h-4 rounded-full bg-cyan-400 flex items-center justify-center">
                                                                            <Check size={10} className="text-slate-950" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>

                            <section className={`${panelClass} p-5 overflow-hidden`}>
                                <div className="flex items-center justify-between mb-5">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Routing engine</div>
                                    <TrainFront size={16} className="text-cyan-400" />
                                </div>
                                
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/5">
                                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <div className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono font-bold text-cyan-400 shadow-inner">
                                                    #{config.TRAIN_NUMBER}
                                                </div>
                                                <div className="text-[10px] font-bold text-white tracking-widest uppercase truncate">{config.SEAT_CLASS.replace('_', ' ')}</div>
                                            </div>
                                            {trainName && (
                                                <div className="text-xs font-black text-cyan-400 uppercase tracking-tighter truncate animate-in fade-in slide-in-from-left-2">
                                                    {trainName}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="relative pl-7 space-y-8 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-gradient-to-b before:from-cyan-500 before:via-slate-800 before:to-slate-700">
                                        <div className="relative">
                                            <div className="absolute left-[-25px] top-1.5 w-4 h-4 rounded-full bg-slate-950 border-2 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.4)]" />
                                            <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Origin</div>
                                            <div className="text-sm text-slate-200 font-bold truncate mt-1">{config.FROM_CITY}</div>
                                            <div className="text-[10px] font-mono text-slate-600 mt-0.5">DEP: 00:00:00 (EST)</div>
                                        </div>
                                        <div className="relative">
                                            <div className="absolute left-[-25px] top-1.5 w-4 h-4 rounded-full bg-slate-950 border-2 border-slate-700" />
                                            <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Destination</div>
                                            <div className="text-sm text-slate-200 font-bold truncate mt-1">{config.TO_CITY}</div>
                                            <div className="text-[10px] font-mono text-slate-600 mt-0.5">ARR: 00:00:00 (EST)</div>
                                        </div>
                                    </div>

                                    <div className="pt-4 flex items-center justify-between border-t border-white/5">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Departure</span>
                                        <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-1 rounded">{config.DATE_OF_JOURNEY}</span>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </main>
            </div>

            <section className={`border-t border-white/5 bg-slate-950 transition-[height] duration-300 ease-in-out ${logExpanded ? 'h-72' : 'h-12'} shrink-0 relative overflow-hidden`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.03),transparent)] pointer-events-none" />
                <div className="h-12 px-4 flex items-center justify-between relative z-10">
                    <button type="button" onClick={() => setLogExpanded(!logExpanded)} className="flex items-center gap-2 text-left min-w-0 group">
                        <Terminal size={16} className={`transition-colors ${logExpanded ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-slate-300">Live Telemetry</span>
                        {!logExpanded && (
                            <span className={`text-[10px] font-mono truncate ml-2 opacity-50 ${logClassName(logs[logs.length - 1]?.level)}`}>{latestLog}</span>
                        )}
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-700'}`} />
                            <span className={`text-[9px] font-black uppercase tracking-widest ${isRunning ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {statusText}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={handleCopyLogs}
                            disabled={logs.length === 0}
                            title="Copy logs"
                            className={`p-1.5 rounded transition-all ${logs.length === 0 ? 'text-slate-700 cursor-not-allowed' : copied ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                        >
                            {copied ? <Check size={15} /> : <Copy size={15} />}
                        </button>
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
                    <div className="h-[calc(18rem-3rem)] overflow-y-auto thin-scrollbar px-5 pb-4 font-mono text-sm leading-relaxed">
                        {logs.length === 0 && <div className="h-full flex items-center justify-center text-xs text-slate-600">No activity yet.</div>}
                        {logs.map((log, i) => (
                            <div key={i} className={`mb-1.5 ${logClassName(log.level)}`}>
                                {log.message}
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                )}
            </section>

            
            {/* Integrated Payment Portal */}
            {showPaymentPortal && paymentUrl && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-3xl animate-in fade-in zoom-in-95 duration-500">
                    <div className="absolute inset-0 tech-grid opacity-20" />
                    
                    <div className="relative w-full max-w-2xl">
                        {/* Status Bar */}
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                                    <ShieldCheck size={28} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-white uppercase tracking-wider">Payment Portal</h2>
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        Secure Encrypted Bridge
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowPaymentPortal(false)}
                                className="p-3 rounded-2xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                            >
                                <ChevronDown size={24} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                            {/* Booking Summary */}
                            <div className="bg-slate-900/50 border border-white/5 rounded-[2rem] p-8 space-y-6">
                                <div className="space-y-4">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Trip Summary</div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-sm font-bold text-slate-300">
                                            <span className="text-slate-500 font-medium">Route</span>
                                            <span>{config.FROM_CITY} → {config.TO_CITY}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm font-bold text-slate-300">
                                            <span className="text-slate-500 font-medium">Date</span>
                                            <span>{config.DATE_OF_JOURNEY}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm font-bold text-slate-300">
                                            <span className="text-slate-500 font-medium">Class</span>
                                            <span>{config.SEAT_CLASS.replace('_', ' ')}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm font-bold text-emerald-400 pt-3 border-t border-white/5">
                                            <span className="text-slate-500 font-medium uppercase text-[10px]">Total Seats</span>
                                            <span className="text-xl font-black">{reservedSeats.length || config.MAX_SELECTABLE_SEAT}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Payment Method */}
                            <div className="bg-slate-900/50 border border-white/5 rounded-[2rem] p-8 flex flex-col justify-between overflow-hidden relative group">
                                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                <div className="relative z-10 space-y-4">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Active Gateway</div>
                                    <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                                        <img 
                                            src="/assets/payment/bkash-home.png" 
                                            alt="bKash"
                                            className="w-full h-full object-contain p-6 bg-white group-hover:scale-105 transition-transform duration-1000"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex flex-col justify-end p-4">
                                            <div className="text-sm font-black text-white">bKash Secure</div>
                                            <div className="text-[8px] font-bold text-pink-400 uppercase tracking-widest">Authorized Redirect</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="relative z-10 text-[10px] text-slate-500 italic text-center leading-relaxed pt-4">
                                    Official bKash PGW Interface
                                </div>
                            </div>
                        </div>

                        {/* Action Area */}
                        <div className="flex flex-col gap-4">
                            <button 
                                onClick={() => {
                                    window.electronAPI?.openExternal(paymentUrl);
                                    // Optionally stay open or show a "Waiting for confirmation" state
                                }}
                                className="w-full group relative overflow-hidden py-8 rounded-[2rem] bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-2xl shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                                <div className="relative z-10 flex flex-col items-center gap-2">
                                    <span className="text-[11px] font-black uppercase tracking-[0.4em] opacity-80">Authorize Transaction</span>
                                    <span className="text-2xl font-black uppercase tracking-widest flex items-center gap-3">
                                        Proceed to Checkout
                                        <ExternalLink size={24} />
                                    </span>
                                </div>
                            </button>
                            
                            <p className="text-center text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-2">
                                All connections are secured via SSL/TLS 1.3 encryption
                            </p>

                            <div className="mt-8 pt-8 border-t border-white/5 flex flex-col items-center gap-4">
                                <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Accepted Partners</div>
                                <div className="flex flex-wrap justify-center items-center gap-6 px-4 py-2 bg-white/5 rounded-2xl border border-white/5 opacity-60 hover:opacity-100 transition-opacity duration-500">
                                    <img src="/assets/payment/bkash-home.png" alt="bKash" className="h-6 object-contain" />
                                    <img src="/assets/payment/nagad-32.png" alt="Nagad" className="h-6 object-contain" />
                                    <img src="/assets/payment/rocket-home.svg" alt="Rocket" className="h-6 object-contain" />
                                    <img src="/assets/payment/upay-home.svg" alt="Upay" className="h-6 object-contain" />
                                    <img src="/assets/payment/tap.svg" alt="Tap" className="h-6 object-contain" />
                                    <img src="/assets/payment/visa-home.png" alt="Visa" className="h-6 object-contain" />
                                    <img src="/assets/payment/master-card-home.png" alt="Mastercard" className="h-6 object-contain" />
                                    <img src="/assets/payment/amex-home.svg" alt="Amex" className="h-6 object-contain" />
                                    <img src="/assets/payment/nexus-debit-home.svg" alt="Nexus" className="h-6 object-contain" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
               {showScheduleModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowScheduleModal(false)} />
                    <div className="relative w-full max-w-sm bg-slate-900/90 border border-white/10 rounded-[2rem] p-8 shadow-2xl shadow-black/50 animate-in zoom-in-95 duration-200 backdrop-blur-xl">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
                                <CalendarClock size={24} className="text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-white uppercase tracking-widest">Schedule Lock</h3>
                                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Release Trigger</div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="relative group">
                                <label className={labelClass}>Target Release Time</label>
                                <div className="relative mt-2">
                                    <input
                                        type="time"
                                        step="1"
                                        className="w-full bg-slate-950 border-2 border-white/5 rounded-2xl p-6 text-4xl font-mono font-black text-amber-400 text-center focus:border-amber-500/40 outline-none shadow-inner transition-all [color-scheme:dark]"
                                        value={config.SCHEDULE_TIME}
                                        onChange={(e) => setConfig({ ...config, SCHEDULE_TIME: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="bg-slate-950/50 rounded-2xl p-5 border border-white/5 space-y-3">
                                <div className="flex items-center gap-3 text-slate-400">
                                    <ShieldCheck size={14} className="text-amber-500/50" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest leading-tight">
                                        Server-side timing verification active
                                    </p>
                                </div>
                                <p className="text-[9px] text-slate-600 font-medium leading-relaxed">
                                    Reservation will trigger precisely at the target time. Pre-login and search will continue running to maintain session heat.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setConfig({ ...config, SCHEDULE_TIME: '' });
                                        setShowScheduleModal(false);
                                    }}
                                    className="flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-400 bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 hover:border-red-500/30 transition-all"
                                >
                                    Clear Lock
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowScheduleModal(false)}
                                    className="flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20 transition-all active:scale-95"
                                >
                                    Engage
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showAuthModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowAuthModal(false)} />
                    <div className="relative w-full max-w-sm bg-slate-900/90 border border-white/10 rounded-[2rem] p-8 shadow-2xl shadow-black/50 animate-in zoom-in-95 duration-200 backdrop-blur-xl">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-12 h-12 bg-cyan-500/10 rounded-2xl flex items-center justify-center border border-cyan-500/20">
                                <ShieldCheck size={24} className="text-cyan-400" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-white uppercase tracking-widest">Security Vault</h3>
                                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Credential Management</div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className={labelClass}>Railway Mobile Number</label>
                                <div className="relative">
                                    <input
                                        className={`${inputClass} !bg-slate-950 !py-3 !px-4 !rounded-xl border-2 border-white/5 focus:border-cyan-500/40`}
                                        placeholder="01XXXXXXXXX"
                                        value={config.MOBILE_NUMBER}
                                        onChange={(e) => {
                                            setCredentialsSaved(false);
                                            setConfig({ ...config, MOBILE_NUMBER: e.target.value });
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className={labelClass}>Account Password</label>
                                <div className="relative group">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className={`${inputClass} !bg-slate-950 !py-3 !px-4 !rounded-xl border-2 border-white/5 focus:border-cyan-500/40 pr-12`}
                                        placeholder="••••••••"
                                        value={config.PASSWORD}
                                        onChange={(e) => {
                                            setCredentialsSaved(false);
                                            setConfig({ ...config, PASSWORD: e.target.value });
                                        }}
                                    />
                                    <button 
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-cyan-400 transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="pt-4 space-y-3">
                                <button
                                    onClick={() => {
                                        saveCredentials();
                                        setShowAuthModal(false);
                                    }}
                                    className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                >
                                    Update & Lock Vault
                                </button>
                                <button
                                    onClick={() => setShowAuthModal(false)}
                                    className="w-full py-3 rounded-xl bg-white/5 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-slate-300 transition-all"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/5 flex items-center gap-3 opacity-40">
                            <Lock size={12} className="text-slate-500" />
                            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                                Credentials are encrypted and stored locally. Never shared with third parties.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
