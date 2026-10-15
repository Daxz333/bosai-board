import { useState } from 'react'
import { useStore, reflowConnector } from '../store/board'
import { PALETTE, LINE_PALETTE, FONT_SIZES, FONT_FAMILIES, STICKY_COLORS } from '../engine/library'
import type { AnyNode, ShapeNode, LineNode, TableNode } from '../types'
import { convertToPath } from '../engine/paths'
import EngineeringProperties from './EngineeringProperties'
import { isProfessional, symbolDefinition } from '../engine/engineering'

function ColorPicker({ value, onChange, colors = PALETTE, title }: { value?: string; onChange: (c: string) => void; colors?: string[]; title?: string }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(value || '#000000')
  return (
    <div className="color-wrap">
      <button className="color-swatch-btn" onClick={() => setOpen(!open)} title={title || '颜色'}>
        <span className="swatch" style={{ background: value && value !== 'transparent' ? value : 'transparent' }} />
        <span className="color-label">{value === 'transparent' ? '无' : value?.toUpperCase()}</span>
      </button>
      {open && (
        <>
          <div className="menu-mask" onClick={() => setOpen(false)} />
          <div className="color-pop">
            <div className="color-grid">
              {colors.map((c) => (
                <button key={c} className={`color-cell ${value === c ? 'active' : ''}`} style={{ background: c }} onClick={() => { onChange(c); setOpen(false) }} />
              ))}
            </div>
            <div className="color-custom">
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(custom) ? custom : '#000000'} onChange={(e) => setCustom(e.target.value)} />
              <input className="hex-input" value={custom} onChange={(e) => setCustom(e.target.value)} spellCheck={false} />
              <button onClick={() => { onChange(custom); setOpen(false) }}>确定</button>
            </div>
            {title === '填充色' && (
              <button className="color-none" onClick={() => { onChange('transparent'); setOpen(false) }}>设为无填充</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function NumField({ label, value, onChange, step = 1, min, max, suffix }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string
}) {
  const [txt, setTxt] = useState('')
  const [focus, setFocus] = useState(false)
  const shown = focus ? txt : String(Math.round(value * 10) / 10)
  const apply = (raw: string) => {
    const v = parseFloat(raw)
    if (!Number.isNaN(v)) onChange(clampN(v, min, max))
  }
  return (
    <label className="num-field">
      <span className="nf-label">{label}</span>
      <input
        value={shown}
        onFocus={() => { setTxt(String(Math.round(value * 10) / 10)); setFocus(true) }}
        onBlur={(e) => { setFocus(false); apply(e.target.value) }}
        onChange={(e) => {
          const v = e.target.value
          if (v === '' || /^-?\d*\.?\d*$/.test(v)) { setTxt(v); apply(v) }
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        onWheel={(e) => { e.preventDefault(); onChange(clampN(value + (e.deltaY < 0 ? step : -step), min, max)) }}
      />
      {suffix && <span className="nf-suffix">{suffix}</span>}
    </label>
  )
}

function clampN(v: number, min?: number, max?: number) {
  if (Number.isNaN(v)) return 0
  return Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v))
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="prop-section">
      <div className="sec-head" onClick={() => setOpen(!open)}>
        <span className={`caret ${open ? 'open' : ''}`}>›</span>
        {title}
      </div>
      {open && <div className="sec-body">{children}</div>}
    </div>
  )
}

export default function PropertyPanel() {
  const s = useStore()
  const sel = s.selected()
  const one = sel.length === 1 ? sel[0] : null
  const shape = one as ShapeNode | null
  const line = one as LineNode | null
  const table = one?.kind === 'table' ? one as TableNode : null
  const isLine = one && (one.kind === 'line' || one.kind === 'pencil' || one.kind === 'connector')
  const isShape = one && !isLine && one.kind !== 'table' && one.kind !== 'image' && one.kind !== 'group'

  const patch = (p: Partial<AnyNode>, label?: string) => {
    if (!one) return
    if (label) s.commit(label)
    s.updateNodes([one.id], (n) => Object.assign(n, p))
  }
  const patchAll = (p: Partial<AnyNode>, label?: string) => {
    if (!sel.length) return
    s.updateNodes(sel.map((n) => n.id), (n) => Object.assign(n, p), label)
  }
  const patchText = (p: Record<string, any>, label?: string) => patchAll(p, label)

  const setSelectionX = (v: number) => {
    if (sel.length === 1) s.moveNodes([one!.id],Math.round(v)-one!.x,0,'修改位置')
    else s.moveNodes(sel.map((n) => n.id), Math.round(v) - r.x, 0, '修改位置')
  }
  const setSelectionY = (v: number) => {
    if (sel.length === 1) s.moveNodes([one!.id],0,Math.round(v)-one!.y,'修改位置')
    else s.moveNodes(sel.map((n) => n.id), 0, Math.round(v) - r.y, '修改位置')
  }
  const setSelectionW = (v: number) => {
    const w = Math.max(1, v)
    if (sel.length === 1) patch({ w }, '修改尺寸')
    else s.scaleNodes(sel.map((n) => n.id), r, { ...r, w })
  }
  const setSelectionH = (v: number) => {
    const h = Math.max(1, v)
    if (sel.length === 1) patch({ h }, '修改尺寸')
    else s.scaleNodes(sel.map((n) => n.id), r, { ...r, h })
  }

  if (!sel.length) {
    return (
      <div className="prop-panel empty">
        <div className="panel-title">属性</div>
        <div className="empty-hint">未选中元素<br /><span>在画布上点选图形后可编辑属性</span></div>
        <Section title="画布设置">
          <div className="row">
            <span className="row-label">背景</span>
            <ColorPicker value={s.page().background} onChange={(c) => s.setPageBg(c)} title="页面背景" />
          </div>
          <div className="row">
            <span className="row-label">网格</span>
            <button className={`mini-toggle ${s.gridVisible ? 'on' : ''}`} onClick={() => s.toggleGrid()}>{s.gridVisible ? '显示' : '隐藏'}</button>
            <span className="row-label ml">吸附</span>
            <button className={`mini-toggle ${s.snapEnabled ? 'on' : ''}`} onClick={() => s.toggleSnap()}>{s.snapEnabled ? '开' : '关'}</button>
          </div>
          <div className="row">
            <span className="row-label">网格大小</span>
            <NumField label="" value={s.gridSize} onChange={(v) => s.setGridSize(Math.max(4, v))} step={4} min={4} max={200} suffix="px" />
          </div>
        </Section>
      </div>
    )
  }

  const r = s.selectionRect()!

  return (
    <div className="prop-panel">
      <div className="panel-title">属性 · {sel.length > 1 ? `${sel.length} 个元素` : (one?.name || kindLabel(one!))}</div>
      {one&&<EngineeringProperties node={one}/>}
      {isShape && shape && shape.kind !== 'text' && !isProfessional(shape) && <Section title="矢量路径">
        {shape.kind === 'path' ? <button className="wide-btn" onClick={() => s.setTool('node')}>编辑锚点与贝塞尔手柄 A</button>
          : <button className="wide-btn" onClick={() => {
            s.updateNode(shape.id, convertToPath(shape), '转换为矢量路径'); s.setTool('node')
          }}>转换为可编辑路径</button>}
      </Section>}

      <Section title="位置与尺寸">
        <div className="grid2">
          <NumField label="X" value={sel.length > 1 ? r.x : one!.x} onChange={setSelectionX} />
          <NumField label="Y" value={sel.length > 1 ? r.y : one!.y} onChange={setSelectionY} />
          <NumField label="宽" value={sel.length > 1 ? r.w : one!.w} onChange={setSelectionW} min={1} />
          <NumField label="高" value={sel.length > 1 ? r.h : one!.h} onChange={setSelectionH} min={1} />
        </div>
        <div className="grid2">
          <NumField label="旋转" value={sel.length > 1 ? 0 : (one!.rot || 0)} onChange={(v) => patchAll({ rot: v }, '旋转')} suffix="°" />
          <NumField label="不透明" value={Math.round((sel.length === 1 ? (one!.opacity ?? 1) : 1) * 100)} onChange={(v) => patchAll({ opacity: Math.max(0, Math.min(1, v / 100)) }, '修改透明度')} min={0} max={100} suffix="%" />
        </div>
      </Section>

      {!isLine && (
        <Section title="填充">
          <div className="row">
            <span className="row-label">颜色</span>
            <ColorPicker value={(shape as any)?.fill} onChange={(c) => patch({ fill: c } as any)} title="填充色" />
          </div>
          {sel.length === 1 && shape && (shape.kind === 'sticky') && (
            <div className="row">
              <span className="row-label">便签色</span>
              <div className="inline-swatches">
                {STICKY_COLORS.map((c) => (
                  <button key={c} className={`sw ${(shape as any).fill === c ? 'active' : ''}`} style={{ background: c }} onClick={() => patch({ fill: c } as any)} />
                ))}
              </div>
            </div>
          )}
          <div className="row">
            <span className="row-label">渐变</span>
            <button className={`mini-toggle ${(shape as any)?.gradient ? 'on' : ''}`} onClick={() => patch({ gradient: !(shape as any)?.gradient } as any)}>{(shape as any)?.gradient ? '开' : '关'}</button>
            {(shape as any)?.gradient && <ColorPicker value={(shape as any).fill2} onChange={(c) => patch({ fill2: c } as any)} colors={PALETTE} title="渐变第二色" />}
          </div>
        </Section>
      )}

      <Section title="描边">
        {!isLine && (
          <div className="row">
            <span className="row-label">颜色</span>
            <ColorPicker value={(shape as any)?.stroke} onChange={(c) => patchAll({ stroke: c } as any)} colors={LINE_PALETTE} title="描边色" />
          </div>
        )}
        {isLine && (
          <div className="row">
            <span className="row-label">颜色</span>
            <ColorPicker value={(line as any)?.stroke} onChange={(c) => patch({ stroke: c } as any)} colors={LINE_PALETTE} title="线条颜色" />
          </div>
        )}
        <div className="grid2">
          <NumField label="粗细" value={sel.length === 1 ? ((shape as any)?.strokeWidth ?? (line as any)?.strokeWidth ?? 2) : 2}
            onChange={(v) => isLine ? patch({ strokeWidth: Math.max(0.5, v) } as any) : patchAll({ strokeWidth: Math.max(0, v) } as any)} min={0.5} />
          {!isLine && (
            <NumField label="圆角" value={(shape as any)?.radius ?? 0} onChange={(v) => patch({ radius: Math.max(0, v) } as any)} min={0} />
          )}
        </div>
        <div className="row">
          <span className="row-label">线型</span>
          <div className="seg">
            {(['solid', 'dashed', 'dotted'] as const).map((k) => (
              <button key={k} className={((line as any)?.lineStyle ?? (shape as any)?.lineStyle) === k ? 'active' : ''}
                onClick={() => isLine ? patch({ lineStyle: k } as any) : patchAll({ lineStyle: k } as any)}>
                {k === 'solid' ? '实线' : k === 'dashed' ? '虚线' : '点线'}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="row-label">阴影</span>
          <button className={`mini-toggle ${(shape as any)?.shadow ? 'on' : ''}`} onClick={() => patchAll({ shadow: !(shape as any)?.shadow } as any)}>{(shape as any)?.shadow ? '开' : '关'}</button>
        </div>
      </Section>

      {isLine && line && (
        <Section title="连线">
          {line.kind === 'connector' && <>
            <input className="text-area" aria-label="连线标签" placeholder="连线标签，如：是 / 否" value={line.text || ''}
              onFocus={() => s.commit('编辑连线标签')} onChange={e => patch({ text: e.target.value })} />
            <button className="wide-btn" onClick={() => {
              s.updateNode(line.id, { bends: undefined }, '恢复自动路由'); reflowAll()
            }}>恢复自动路由</button>
          </>}
          <div className="row">
            <span className="row-label">箭头</span>
            <div className="seg">
              {([['none', '无'], ['end', '单向'], ['both', '双向']] as const).map(([k, lb]) => (
                <button key={k} className={((line as any).arrow || 'end') === k ? 'active' : ''} onClick={() => patch({ arrow: k, startMarker:undefined, endMarker:undefined, relation:undefined } as any,'修改箭头')}>{lb}</button>
              ))}
            </div>
          </div>
          {line.kind === 'connector' && (
            <div className="row">
              <span className="row-label">路径</span>
              <div className="seg">
                {([['straight', '直线'], ['orthogonal', '折线'], ['curve', '曲线']] as const).map(([k, lb]) => (
                  <button key={k} className={(line.route || 'straight') === k ? 'active' : ''} onClick={() => {
                    s.commit('修改连线')
                    s.updateNodes([line.id], (n) => Object.assign(n, { route: k }))
                    // 立即重算几何
                    setTimeout(() => reflowAll(), 0)
                  }}>{lb}</button>
                ))}
              </div>
            </div>
          )}
          <div className="row tip-row">选中连线后拖动圆点修改端点或折点；Delete 删除对象。</div>
        </Section>
      )}

      {(isShape || sel.length > 1) && (
        <Section title="文字">
          <textarea
            className="text-area"
            placeholder="输入文字内容…"
            value={sel.length === 1 ? (shape?.text || '') : ''}
            onChange={(e) => patchText({ text: e.target.value })}
            onBlur={(e) => s.commit('编辑文字')}
            rows={2}
          />
          <div className="row">
            <span className="row-label">字号</span>
            <select className="sel" value={shape?.fontSize ?? 14} onChange={(e) => patchText({ fontSize: Number(e.target.value) })}>
              {FONT_SIZES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <span className="row-label ml">颜色</span>
            <ColorPicker value={shape?.color} onChange={(c) => patchText({ color: c })} colors={LINE_PALETTE} title="文字颜色" />
          </div>
          <div className="row">
            <span className="row-label">字体</span>
            <select className="sel grow" value={shape?.fontFamily || FONT_FAMILIES[0].value} onChange={(e) => patchText({ fontFamily: e.target.value })}>
              {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="row">
            <span className="row-label">样式</span>
            <div className="seg">
              <button className={shape?.bold ? 'active' : ''} onClick={() => patchText({ bold: !shape?.bold })}><b>B</b></button>
              <button className={shape?.italic ? 'active' : ''} onClick={() => patchText({ italic: !shape?.italic })}><i>I</i></button>
              <button className={shape?.underline ? 'active' : ''} onClick={() => patchText({ underline: !shape?.underline })}><u>U</u></button>
            </div>
            <div className="seg">
              <button className={shape?.align === 'left' ? 'active' : ''} onClick={() => patchText({ align: 'left' })} title="左对齐">⇤</button>
              <button className={(!shape?.align || shape?.align === 'center') ? 'active' : ''} onClick={() => patchText({ align: 'center' })} title="居中">⇔</button>
              <button className={shape?.align === 'right' ? 'active' : ''} onClick={() => patchText({ align: 'right' })} title="右对齐">⇥</button>
            </div>
          </div>
          <div className="row">
            <span className="row-label">垂直</span>
            <div className="seg">
              {([['top', '顶'], ['middle', '中'], ['bottom', '底']] as const).map(([k, lb]) => (
                <button key={k} className={(shape?.valign || 'middle') === k ? 'active' : ''} onClick={() => patchText({ valign: k })}>{lb}</button>
              ))}
            </div>
            <span className="row-label ml">行距</span>
            <NumField label="" value={shape?.lineHeight ?? 1.5} onChange={(v) => patchText({ lineHeight: Math.max(0.6, v) })} step={0.1} min={0.6} max={4} />
          </div>
        </Section>
      )}

      {table && (
        <Section title="表格">
          <div className="row">
            <span className="row-label">行</span>
            <NumField label="" value={table.rows} onChange={(v) => {
              const rows = Math.max(1, Math.round(v))
              const data = Array.from({ length: rows }, (_, r) =>
                Array.from({ length: table.cols }, (_, c) => table.data[r]?.[c] || { text: '' }))
              s.updateNodes([table.id], (n) => Object.assign(n, { rows, data }), '修改表格')
            }} min={1} max={20} />
            <span className="row-label ml">列</span>
            <NumField label="" value={table.cols} onChange={(v) => {
              const cols = Math.max(1, Math.round(v))
              const data = Array.from({ length: table.rows }, (_, r) =>
                Array.from({ length: cols }, (_, c) => table.data[r]?.[c] || { text: '' }))
              s.updateNodes([table.id], (n) => Object.assign(n, { cols, data }), '修改表格')
            }} min={1} max={20} />
          </div>
          <div className="row">
            <span className="row-label">表头底色</span>
            <ColorPicker value={table.headerFill} onChange={(c) => patch({ headerFill: c } as any)} title="表头颜色" />
          </div>
          <div className="row">
            <span className="row-label">网格色</span>
            <ColorPicker value={table.stroke} onChange={(c) => patch({ stroke: c } as any)} colors={LINE_PALETTE} title="网格颜色" />
          </div>
          <div className="tip-row">双击表格可逐格编辑文字。</div>
        </Section>
      )}

      <Section title="排列">
        <div className="arrange-grid">
          <button title="置顶" onClick={() => s.bringToFront(s.selection)}>置顶</button>
          <button title="上移一层" onClick={() => s.bringForward(s.selection)}>上移</button>
          <button title="下移一层" onClick={() => s.sendBackward(s.selection)}>下移</button>
          <button title="置底" onClick={() => s.sendToBack(s.selection)}>置底</button>
        </div>
        <div className="align-grid">
          {([['left', '左对齐'], ['hcenter', '水平居中'], ['right', '右对齐']] as const).map(([k, lb]) => (
            <button key={k} onClick={() => s.align(k)}>{lb}</button>
          ))}
          {([['top', '顶对齐'], ['vcenter', '垂直居中'], ['bottom', '底对齐']] as const).map(([k, lb]) => (
            <button key={k} onClick={() => s.align(k)}>{lb}</button>
          ))}
        </div>
        <div className="row">
          <button className="wide-btn" onClick={() => s.distribute('h')}>水平等距分布</button>
          <button className="wide-btn" onClick={() => s.distribute('v')}>垂直等距分布</button>
        </div>
        <div className="row">
          <button className="wide-btn" onClick={() => s.group(s.selection)}>组合 Ctrl+G</button>
          <button className="wide-btn" onClick={() => s.ungroup()}>取消组合</button>
        </div>
        <div className="row">
          <button className="wide-btn" onClick={() => s.duplicate(s.selection)}>再制 Ctrl+D</button>
          <button className="wide-btn danger" onClick={() => s.removeNodes(s.selection)}>删除</button>
        </div>
      </Section>
    </div>
  )
}

function kindLabel(n: AnyNode): string {
  if(isProfessional(n)) return symbolDefinition(n.kind)!.label
  const map: Record<string, string> = {
    rect: '矩形', roundRect: '圆角矩形', ellipse: '椭圆', triangle: '三角形', diamond: '菱形',
    pentagon: '五边形', hexagon: '六边形', star: '五角星', cylinder: '数据库', cloud: '云形状',
    arrow: '箭头块', chevron: '流程箭头', parallelogram: '平行四边形', trapezoid: '梯形',
    document: '文档', sticky: '便签', text: '文本', table: '表格', image: '图片',
    line: '直线', pencil: '画笔', connector: '连接线', group: '组合', frame: '框架'
  }
  return map[n.kind] || n.kind
}

function reflowAll() {
  const st = useStore.getState()
  const page = st.page()
  const ids = page.order.filter((id) => page.nodes[id]?.kind === 'connector')
  if (!ids.length) return
  st.updateNodes(ids, (n) => {
    const ln = n as LineNode
    Object.assign(n, reflowConnector(ln, (id) => page.nodes[id]))
  })
}
