import React from 'react';
import { Minus, Square, X, TrainFront } from 'lucide-react';

export function TitleBar() {
    const handleMinimize = () => {
        if (window.electronAPI) window.electronAPI.minimizeWindow();
    };

    const handleMaximize = () => {
        if (window.electronAPI) window.electronAPI.maximizeWindow();
    };

    const handleClose = () => {
        if (window.electronAPI) window.electronAPI.closeWindow();
    };

    return (
        <div 
            className="h-9 bg-slate-950 border-b border-white/5 flex items-center justify-between select-none z-[100] w-full"
            style={{ WebkitAppRegion: 'drag' } as any}
        >
            <div className="flex items-center px-4 gap-3">
                <div className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/20">
                    <TrainFront className="w-3 h-3 text-amber-500" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    <span className="text-slate-100">Railway</span> Precision Dashboard <span className="text-slate-700 ml-1">v4.0.0</span>
                </span>
            </div>

            <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <button
                    onClick={handleMinimize}
                    aria-label="Minimize window"
                    className="h-full px-4 hover:bg-white/5 text-slate-500 hover:text-white transition-all flex items-center justify-center"
                >
                    <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={handleMaximize}
                    aria-label="Maximize window"
                    className="h-full px-4 hover:bg-white/5 text-slate-500 hover:text-white transition-all flex items-center justify-center"
                >
                    <Square className="w-3 h-3" />
                </button>
                <button
                    onClick={handleClose}
                    aria-label="Close window"
                    className="h-full px-4 hover:bg-red-500/80 hover:text-white text-slate-500 transition-all flex items-center justify-center"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
