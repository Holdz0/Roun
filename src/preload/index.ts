import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  pty: {
    spawn: (o: { id: string; tool: string; cwd: string; args: string; cols: number; rows: number }) =>
      ipcRenderer.send('pty:spawn', o),
    write: (id: string, data: string) => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.send('pty:kill', id),
    onData: (cb: (id: string, data: string) => void) => {
      const h = (_: unknown, id: string, data: string): void => cb(id, data)
      ipcRenderer.on('pty:data', h)
      return (): void => {
        ipcRenderer.removeListener('pty:data', h)
      }
    },
    onExit: (cb: (id: string, code: number) => void) => {
      const h = (_: unknown, id: string, code: number): void => cb(id, code)
      ipcRenderer.on('pty:exit', h)
      return (): void => {
        ipcRenderer.removeListener('pty:exit', h)
      }
    }
  },
  usage: {
    limits: (force?: boolean) => ipcRenderer.invoke('usage:limits', force),
    context: (tool: string, cwd: string, since: number, args: string) =>
      ipcRenderer.invoke('usage:context', tool, cwd, since, args),
    onLimits: (cb: (l: unknown) => void) => {
      const h = (_: unknown, l: unknown): void => cb(l)
      ipcRenderer.on('usage:limits', h)
      return (): void => {
        ipcRenderer.removeListener('usage:limits', h)
      }
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch)
  },
  tabs: {
    load: () => ipcRenderer.invoke('tabs:load'),
    save: (tabs: { id: string; tool: string; cwd: string; args: string; startedAt: number }[], activeId: string | null) =>
      ipcRenderer.send('tabs:save', tabs, activeId)
  },
  pickFolder: (current?: string): Promise<string | null> => ipcRenderer.invoke('dialog:folder', current),
  openExternal: (url: string) => ipcRenderer.send('shell:open', url),
  reveal: (p: string) => ipcRenderer.send('shell:reveal', p),
  pathForFile: (f: File) => webUtils.getPathForFile(f)
}

contextBridge.exposeInMainWorld('roun', api)

export type RounApi = typeof api
