import type { ImportResult } from '../engine/import-svg'
import { useStore } from '../store/board'
import { protectCurrentDocument } from '../document-lifecycle'
import { validateDocument } from '../engine/document-validation'

export default function ImportDialog({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  const total=result.doc.pages.reduce((sum,p)=>sum+p.order.length,0)
  const accept=async () => {
    try { validateDocument(result.doc) }
    catch (error) { alert('导入结果无效：' + String(error)); return }
    if (!await protectCurrentDocument('导入工程副本')) return
    const s=useStore.getState()
    // Imported foreign documents are never used as the native save path.
    s.loadDoc(result.doc); s.clearRecoverySnapshot(); s.setDirty(true); onClose()
  }
  return <div className="modal-mask" onClick={onClose}>
    <div className="modal import-dialog" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><h3>{result.format.toUpperCase()} 可编辑转换预览</h3><button onClick={onClose}>✕</button></div>
      <div className="modal-body">
        <p>「{result.doc.title}」：{result.doc.pages.length} 个页面，{total} 个可编辑对象。</p>
        <p>导入为新工程副本，保存使用 .bosai，不覆盖原文件。</p>
        {result.warnings.length>0 ? <>
          <h4>兼容性提示（{result.warnings.length} 项）</h4>
          <p>当前是有限转换，并非完整无损兼容。请检查以下未保留或被转换的内容：</p>
          <ul className="import-warnings">{result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
        </> : <p>当前转换未检测到不支持的元素；仍请核对文字和版式。</p>}
      </div>
      <div className="import-footer"><button className="btn-outline" onClick={onClose}>取消</button><button className="btn-primary" onClick={accept}>确认导入副本</button></div>
    </div>
  </div>
}
