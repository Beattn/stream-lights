import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getConfig: () => ipcRenderer.sendSync("get-config"),
  saveConfig: (config: { supabaseUrl: string; supabaseKey: string; dashboardUrl: string }) =>
    ipcRenderer.invoke("save-config", config),
});
