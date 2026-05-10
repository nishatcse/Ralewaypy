/// <reference types="vite/client" />

import { ElectronAPI } from '../preload/preload';

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
