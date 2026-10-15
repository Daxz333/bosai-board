/** 形状库元数据：左侧面板使用 */
import type { ShapeKind } from '../types'
import { DIAGRAMS, SYMBOLS } from './engineering'

export interface ShapeMeta {
  kind: ShapeKind
  label: string
  group: string
  w: number
  h: number
  description?: string
}

export const SHAPE_GROUPS: { key: ShapeMeta['group']; label: string }[] = [
  { key: 'basic', label: '基础' },
  { key: 'flow', label: '流程' },
  { key: 'arrow', label: '箭头' },
  { key: 'data', label: '数据' },
  { key: 'note', label: '标注' },
  ...DIAGRAMS.filter(d=>d.id!=='free').map(d=>({key:d.id,label:d.label}))
]

export const SHAPE_LIBRARY: ShapeMeta[] = [
  ...SYMBOLS.map(s=>({kind:s.kind,label:s.label,group:s.diagram,w:s.w,h:s.h,description:s.description})),
  { kind: 'rect', label: '矩形', group: 'basic', w: 160, h: 100 },
  { kind: 'roundRect', label: '圆角矩形', group: 'basic', w: 160, h: 100 },
  { kind: 'ellipse', label: '椭圆', group: 'basic', w: 160, h: 100 },
  { kind: 'triangle', label: '三角形', group: 'basic', w: 150, h: 110 },
  { kind: 'diamond', label: '菱形', group: 'basic', w: 150, h: 110 },
  { kind: 'pentagon', label: '五边形', group: 'basic', w: 150, h: 120 },
  { kind: 'hexagon', label: '六边形', group: 'basic', w: 160, h: 110 },
  { kind: 'star', label: '五角星', group: 'basic', w: 150, h: 140 },

  { kind: 'rect', label: '开始/结束', group: 'flow', w: 150, h: 70 },
  { kind: 'parallelogram', label: '输入/输出', group: 'flow', w: 170, h: 90 },
  { kind: 'trapezoid', label: '准备', group: 'flow', w: 160, h: 90 },
  { kind: 'cylinder', label: '数据库', group: 'flow', w: 130, h: 150 },
  { kind: 'document', label: '文档', group: 'flow', w: 150, h: 130 },

  { kind: 'arrow', label: '箭头块', group: 'arrow', w: 180, h: 90 },
  { kind: 'chevron', label: '流程箭头', group: 'arrow', w: 180, h: 90 },

  { kind: 'table', label: '表格', group: 'data', w: 220, h: 140 },
  { kind: 'image', label: '图片', group: 'data', w: 200, h: 150 },

  { kind: 'sticky', label: '便签', group: 'note', w: 170, h: 170 },
  { kind: 'cloud', label: '云形状', group: 'note', w: 190, h: 130 },
  { kind: 'text', label: '文本', group: 'note', w: 200, h: 60 }
]

/** 便签配色 */
export const STICKY_COLORS = [
  '#FFE066', '#FFB4A2', '#B2F2BB', '#A5D8FF', '#D0BFFF', '#FFA8D5', '#D8F5A2', '#FFD8A8'
]

/** 主题色板 */
export const PALETTE = [
  '#FFFFFF', '#F1F3F5', '#868E96', '#212529',
  '#E03131', '#F76707', '#F59F00', '#2F9E44',
  '#0CA678', '#1098AD', '#1C7ED6', '#4263EB',
  '#7048E8', '#C2255C', '#D6336C', '#6741D9'
]

export const LINE_PALETTE = [
  '#212529', '#868E96', '#E03131', '#F76707', '#F59F00',
  '#2F9E44', '#0CA678', '#1098AD', '#1C7ED6', '#7048E8'
]

export const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 72]
export const FONT_FAMILIES = [
  { label: '默认无衬线', value: '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif' },
  { label: '宋体', value: '"SimSun","Songti SC",serif' },
  { label: '楷体', value: '"KaiTi","STKaiti",serif' },
  { label: '黑体', value: '"SimHei","Microsoft YaHei",sans-serif' },
  { label: 'Arial', value: 'Arial,Helvetica,sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman",Times,serif' },
  { label: 'Consolas 代码', value: 'Consolas,"Courier New",monospace' }
]
