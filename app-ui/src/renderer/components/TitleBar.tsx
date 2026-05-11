import React from 'react';
import { Minus, Square, X } from 'lucide-react';

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
            className="h-8 bg-gray-900 border-b border-gray-800 flex items-center justify-between select-none z-50 w-full"
            style={{ WebkitAppRegion: 'drag' } as any}
        >
            <div className="flex items-center px-4 gap-2">
                <span className="text-xs font-medium text-gray-400 tracking-wide">Raleway - Standalone Booking App</span>
            </div>

            <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <button
                    onClick={handleMinimize}
                    aria-label="Minimize window"
                    className="h-full px-3 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors flex items-center justify-center"
                >
                    <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={handleMaximize}
                    aria-label="Maximize window"
                    className="h-full px-3 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors flex items-center justify-center"
                >
                    <Square className="w-3 h-3" />
                </button>
                <button
                    onClick={handleClose}
                    aria-label="Close window"
                    className="h-full px-3 hover:bg-red-600 hover:text-white text-gray-400 transition-colors flex items-center justify-center"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
