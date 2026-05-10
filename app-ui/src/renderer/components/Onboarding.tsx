import React, { useState, useEffect } from 'react';
import { Play, CheckCircle2, XCircle, ChevronRight, Check } from 'lucide-react';

interface OnboardingProps {
    onComplete: (credentials: { MOBILE_NUMBER: string; PASSWORD: string }) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
    const [step, setStep] = useState<'splash' | 'system' | 'credentials'>('splash');
    const [systemStatus, setSystemStatus] = useState<{ hasBackend: boolean; hasChrome: boolean; backendPath: string } | null>(null);
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    
    useEffect(() => {
        // Show splash screen for 2 seconds
        const timer = setTimeout(() => {
            setStep('system');
            checkSystem();
        }, 2000);
        return () => clearTimeout(timer);
    }, []);

    const checkSystem = async () => {
        if (window.electronAPI) {
            const status = await window.electronAPI.checkSystem();
            setSystemStatus(status);
        } else {
            // Development fallback if electronAPI is not injected
            setSystemStatus({ hasBackend: true, hasChrome: true, backendPath: 'Mocked Dev Mode' });
        }
    };

    const handleSystemContinue = () => {
        if (systemStatus?.hasBackend && systemStatus?.hasChrome) {
            setStep('credentials');
        }
    };

    const handleCredentialsSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (mobile && password) {
            onComplete({ MOBILE_NUMBER: mobile, PASSWORD: password });
        }
    };

    if (step === 'splash') {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-950 w-full animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 bg-green-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-green-500/20 mb-8 animate-bounce">
                    <Play size={56} className="text-white ml-2" />
                </div>
                <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Raleway</h1>
                <p className="text-gray-400 font-medium">Professional Railway Booking Assistant</p>
            </div>
        );
    }

    if (step === 'system') {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-950 w-full animate-in slide-in-from-right duration-300">
                <div className="max-w-md w-full bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-xl">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
                            <Play size={20} className="text-green-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">System Check</h2>
                    </div>

                    <div className="space-y-6 mb-8">
                        <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                            <div>
                                <h3 className="text-white font-medium">Python Sidecar Engine</h3>
                                <p className="text-xs text-gray-500 mt-1 truncate max-w-[200px]">
                                    {systemStatus?.backendPath || 'Checking...'}
                                </p>
                            </div>
                            {systemStatus === null ? (
                                <div className="w-6 h-6 border-2 border-gray-600 border-t-green-500 rounded-full animate-spin"></div>
                            ) : systemStatus.hasBackend ? (
                                <CheckCircle2 className="text-green-500" />
                            ) : (
                                <XCircle className="text-red-500" />
                            )}
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                            <div>
                                <h3 className="text-white font-medium">Google Chrome/Chromium</h3>
                                <p className="text-xs text-gray-500 mt-1">Required for Turnstile bypass</p>
                            </div>
                            {systemStatus === null ? (
                                <div className="w-6 h-6 border-2 border-gray-600 border-t-green-500 rounded-full animate-spin"></div>
                            ) : systemStatus.hasChrome ? (
                                <CheckCircle2 className="text-green-500" />
                            ) : (
                                <XCircle className="text-red-500" />
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleSystemContinue}
                        disabled={!systemStatus?.hasBackend || !systemStatus?.hasChrome}
                        className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                            systemStatus?.hasBackend && systemStatus?.hasChrome
                                ? 'bg-white text-black hover:bg-gray-200 shadow-lg'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        CONTINUE
                        <ChevronRight size={20} />
                    </button>
                    
                    {systemStatus && (!systemStatus.hasBackend || !systemStatus.hasChrome) && (
                        <p className="text-red-400 text-xs mt-4 text-center">
                            Please resolve the missing requirements above to continue.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (step === 'credentials') {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-950 w-full animate-in slide-in-from-right duration-300">
                <div className="max-w-md w-full bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-xl">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                            <Check size={20} className="text-green-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Your Credentials</h2>
                    </div>
                    
                    <p className="text-gray-400 text-sm mb-6">
                        Enter your default railway account credentials. These are securely saved locally on your computer and never sent to our servers.
                    </p>

                    <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Mobile Number</label>
                            <input
                                type="text"
                                required
                                placeholder="01XXXXXXXXX"
                                className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors text-white"
                                value={mobile}
                                onChange={(e) => setMobile(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Password</label>
                            <input
                                type="password"
                                required
                                placeholder="••••••••"
                                className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors text-white"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-green-600/20"
                            >
                                SAVE & START APP
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return null;
}
