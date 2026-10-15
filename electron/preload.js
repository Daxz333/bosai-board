const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('boardAPI', {
  isDesktop: true,
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  exportImage: (payload) => ipcRenderer.invoke('file:exportImage', payload),
  exportText: (payload) => ipcRenderer.invoke('file:exportText', payload),
  importImage: () => ipcRenderer.invoke('file:importImage'),
  importDrawing: () => ipcRenderer.invoke('file:importDrawing'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  reveal: (p) => ipcRenderer.invoke('app:openPath', p),
  onCloseRequested: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('app:closeRequested', listener)
    return () => ipcRenderer.removeListener('app:closeRequested', listener)
  },
  respondClose: (approved) => ipcRenderer.send('app:closeResponse', approved === true)
})
