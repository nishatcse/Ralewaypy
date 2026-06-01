import React from 'react';
import { Minus, Square, X, TrainFront } from 'lucide-react';

export function TitleBar() {
    const handleMinimize = () => {
        if ((window as any).electronAPI) (window as any).electronAPI.minimizeWindow();
    };

    const handleMaximize = () => {
        if ((window as any).electronAPI) (window as any).electronAPI.maximizeWindow();
    };

    const handleClose = () => {
        if ((window as any).electronAPI) (window as any).electronAPI.closeWindow();
    };

    return (
        <div 
            className="h-10 bg-slate-950/95 backdrop-blur-xl border-b border-white/5 flex items-center justify-between select-none z-[100] w-full relative overflow-hidden"
            style={{ WebkitAppRegion: 'drag' } as any}
        >
            {/* Top Cyan Accent Glow line */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/25 to-transparent" />

            <div className="flex items-center px-4 gap-3">
                <div className="flex items-center justify-center w-5.5 h-5.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.15)]">
                    <TrainFront className="w-3 h-3 text-cyan-400" />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-slate-400">
                        <span className="text-white font-extrabold tracking-[0.15em]">Raleway</span> Precision Dashboard
                    </span>
                    <span className="text-[8px] font-mono font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-500/20 px-1.5 py-0.5 rounded-md leading-none">
                        V4.0.0
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" title="System Online" />
                </div>
            </div>

            <div className="flex items-center gap-1.5 pr-3 h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <button
                    onClick={handleMinimize}
                    aria-label="Minimize window"
                    className="w-6 h-6 rounded-md hover:bg-white/5 text-slate-500 hover:text-slate-200 transition-all active:scale-95 flex items-center justify-center"
                >
                    <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={handleMaximize}
                    aria-label="Maximize window"
                    className="w-6 h-6 rounded-md hover:bg-white/5 text-slate-500 hover:text-slate-200 transition-all active:scale-95 flex items-center justify-center"
                >
                    <Square className="w-2.5 h-2.5" />
                </button>
                <button
                    onClick={handleClose}
                    aria-label="Close window"
                    className="w-6 h-6 rounded-md hover:bg-red-500/90 text-slate-500 hover:text-white transition-all active:scale-95 flex items-center justify-center"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
