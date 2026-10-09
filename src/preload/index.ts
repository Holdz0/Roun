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
    history: () => ipcRenderer.invoke('usage:history'),
    limits: (force?: boolean) => ipcRenderer.invoke('usage:limits', force),
    context: (tool: string, cwd: string, since: number, args: string, tabId?: string) =>
      ipcRenderer.invoke('usage:context', tool, cwd, since, args, tabId),
    onLimits: (cb: (l: unknown) => void) => {
      const h = (_: unknown, l: unknown): void => cb(l)
      ipcRenderer.on('usage:limits', h)
      return (): void => {
        ipcRenderer.removeListener('usage:limits', h)
      }
    }
  },
  worktrees: {
    list: (cwd: string) => ipcRenderer.invoke('worktrees:list', cwd),
    create: (cwd: string, branch: string) => ipcRenderer.invoke('worktrees:create', cwd, branch)
  },
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    draft: (key: string): Promise<string> => ipcRenderer.invoke('sessions:draft', key),
    detail: (key: string) => ipcRenderer.invoke('sessions:detail', key),
    update: (key: string, patch: { title?: string; pinned?: boolean }) => ipcRenderer.invoke('sessions:update', key, patch),
    handoff: (tabId: string): Promise<string> => ipcRenderer.invoke('sessions:handoff', tabId)
  },
  notifications: {
    state: (id: string, state: string) => ipcRenderer.send('notification:state', id, state),
    onActivate: (cb: (id: string | null) => void) => {
      const h = (_: unknown, id: string | null): void => cb(id)
      ipcRenderer.on('notification:activate', h)
      return (): void => { ipcRenderer.removeListener('notification:activate', h) }
    },
    onError: (cb: (message: string) => void) => {
      const h = (_: unknown, message: string): void => cb(message)
      ipcRenderer.on('notification:error', h)
      return (): void => { ipcRenderer.removeListener('notification:error', h) }
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch)
  },
  tabs: {
    session: (id: string): Promise<string | null> => ipcRenderer.invoke('tabs:session', id),
    load: () => ipcRenderer.invoke('tabs:load'),
    save: (tabs: { id: string; tool: string; cwd: string; args: string; startedAt: number }[], activeId: string | null) =>
      ipcRenderer.send('tabs:save', tabs, activeId),
    onState: (cb: (id: string, state: string) => void) => {
      const h = (_: unknown, id: string, state: string): void => cb(id, state)
      ipcRenderer.on('tab:state', h)
      return (): void => {
        ipcRenderer.removeListener('tab:state', h)
      }
    }
  },
  pickFolder: (current?: string): Promise<string | null> => ipcRenderer.invoke('dialog:folder', current),
  openExternal: (url: string) => ipcRenderer.send('shell:open', url),
  reveal: (p: string) => ipcRenderer.send('shell:reveal', p),
  pathForFile: (f: File) => webUtils.getPathForFile(f)
}

contextBridge.exposeInMainWorld('roun', api)

export type RounApi = typeof api
