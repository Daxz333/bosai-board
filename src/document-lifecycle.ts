import { useStore } from './store/board'
import { validateDocument } from './engine/document-validation'

let pendingSave: { sessionId: string; task: Promise<boolean> } | null = null

export function saveDocument(): Promise<boolean> {
  const sessionId = useStore.getState().sessionId
  if (pendingSave?.sessionId === sessionId) return pendingSave.task
  const task = saveCurrentDocument()
  pendingSave = { sessionId, task }
  void task.finally(() => { if (pendingSave?.task === task) pendingSave = null })
  return task
}

async function saveCurrentDocument(): Promise<boolean> {
  const state = useStore.getState()
  const api = (window as any).boardAPI
  if (!api?.saveFile) { alert('请在桌面应用中保存工程文件'); return false }
  const { documentId, sessionId, revision } = state
  let content: string
  try {
    validateDocument(state.doc)
    content = JSON.stringify(state.doc, null, 2)
  } catch (error) {
    alert('保存失败：工程结构无效：' + String(error))
    return false
  }
  try {
    const result = await api.saveFile({ path: state.filePath, defaultName: `${state.doc.title || '未命名白板'}.bosai`, content })
    if (!result?.ok) {
      if (!result?.canceled) alert('保存失败：' + (result?.error || '未知错误'))
      return false
    }
    return useStore.getState().confirmSaved(documentId, sessionId, revision, result.path)
  } catch (error) {
    alert('保存失败：' + String(error))
    return false
  }
}

/** One guard for new, open, import and native window close. */
export async function protectCurrentDocument(action: string): Promise<boolean> {
  while (useStore.getState().dirty) {
    const id = useStore.getState().sessionId
    if (confirm(`当前工程有未保存改动。是否先保存，再${action}？`)) {
      if (!await saveDocument()) return false
      if (useStore.getState().sessionId !== id) return false
      continue // An edit made while the write was pending still needs a save.
    }
    if (!confirm(`放弃当前工程的未保存改动并${action}？选择“取消”可返回编辑。`)) return false
    return useStore.getState().sessionId === id
  }
  return true
}
