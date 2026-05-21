import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getConfig:    () => ipcRenderer.sendSync("get-config"),
  saveConfig:   (config: { email: string; password: string; dashboardUrl: string }) =>
                  ipcRenderer.invoke("save-config", config),
  closeWindow:  () => ipcRenderer.send("close-setup"),
  openDashboard:() => ipcRenderer.send("open-dashboard"),
  testLight:      (color: string, brightness: number, effect: string, durationMs: number) =>
                    ipcRenderer.invoke("test-light", { color, brightness, effect, durationMs }),
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  maximizeWindow: () => ipcRenderer.send("maximize-window"),
});
