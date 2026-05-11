import { contextBridge, ipcRenderer } from 'electron';

const api = {
    startBooking: async (config: any): Promise<{ success: boolean; error?: string }> => {
        return await ipcRenderer.invoke('start-booking', config);
    },

    stopBooking: async (): Promise<{ success: boolean; error?: string }> => {
        return await ipcRenderer.invoke('stop-booking');
    },

    sendBackendInput: (input: string) => {
        ipcRenderer.send('backend-input', input);
    },

    onBackendEvent: (callback: (event: any) => void) => {
        const subscription = (_event: Electron.IpcRendererEvent, backendEvent: any) => callback(backendEvent);
        ipcRenderer.on('backend-event', subscription);
        return () => {
            ipcRenderer.removeListener('backend-event', subscription);
        };
    },

    checkSystem: async (): Promise<{ hasBackend: boolean; hasChrome: boolean; backendPath: string }> => {
        return await ipcRenderer.invoke('check-system');
    },

    minimizeWindow: () => {
        ipcRenderer.send('window:minimize');
    },

    maximizeWindow: () => {
        ipcRenderer.send('window:maximize');
    },

    closeWindow: () => {
        ipcRenderer.send('window:close');
    },

    openExternal: (url: string) => {
        ipcRenderer.send('open-external', url);
    },

    safeEncrypt: async (str: string): Promise<string> => {
        return await ipcRenderer.invoke('safe-encrypt', str);
    },

    safeDecrypt: async (str: string): Promise<string> => {
        return await ipcRenderer.invoke('safe-decrypt', str);
    }
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
