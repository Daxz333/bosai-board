/** 白板核心数据模型 */

export type ToolId =
  | 'select' | 'hand' | 'shape' | 'text' | 'pen' | 'eraser' | 'connector' | 'frame' | 'note' | 'bezier' | 'node'

/** 形状库中的可绘制类型（含表格与图片占位） */
export type ShapeKind =
  | ProfessionalKind
  | 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'diamond' | 'pentagon'
  | 'hexagon' | 'star' | 'cylinder' | 'cloud' | 'arrow' | 'chevron' | 'parallelogram'
  | 'trapezoid' | 'document' | 'sticky' | 'text' | 'frame' | 'group'
  | 'table' | 'image' | 'path'

/** 纯矢量形状（可带文字） */
export type VectorShapeKind = Exclude<ShapeKind, 'table' | 'image'>

export type TextAlign = 'left' | 'center' | 'right'
export type VAlign = 'top' | 'middle' | 'bottom'
export type LineStyle = 'solid' | 'dashed' | 'dotted'
export type ArrowKind = 'none' | 'end' | 'both'
export type RouteKind = 'straight' | 'orthogonal' | 'curve'

export type DiagramType = 'free' | 'useCase' | 'dfd' | 'class' | 'er' | 'sequence' | 'activity' | 'state' | 'component' | 'deployment' | 'package' | 'c4' | 'bpmn' | 'module' | 'network' | 'requirements' | 'object'
  | 'communication' | 'composite' | 'timing' | 'interaction'
export type ProfessionalKind = 'actor' | 'useCase' | 'systemBoundary' | 'umlNote' | 'dfdExternal' | 'dfdProcess' | 'dfdStore' | 'umlClass' | 'umlInterface' | 'umlEnum' | 'erEntity' | 'erWeakEntity' | 'erRelationship' | 'erAttribute' | 'erTable' | 'sequenceParticipant' | 'sequenceFragment' | 'sequenceActivation' | 'activityAction' | 'initialState' | 'finalState' | 'decision' | 'fork' | 'swimlane' | 'umlState' | 'historyState' | 'umlComponent' | 'interfacePort' | 'deploymentDevice' | 'artifact' | 'umlPackage' | 'c4System' | 'c4Container' | 'c4Component' | 'bpmnEvent' | 'bpmnTask' | 'bpmnGateway' | 'bpmnPool' | 'module' | 'networkDevice' | 'requirement' | 'sysmlBlock' | 'umlObject'
  | 'umlComposite' | 'umlPart' | 'timingLifeline' | 'interactionRef' | 'bpmnDataObject' | 'networkService' | 'messageQueue' | 'networkDatabase' | 'testCase'
export type MarkerKind = 'none' | 'arrow' | 'open' | 'triangle' | 'diamond' | 'filledDiamond' | 'circle' | 'one' | 'many' | 'zeroOne' | 'zeroMany' | 'cross'
export type RelationKind = 'association' | 'dependency' | 'generalization' | 'realization' | 'aggregation' | 'composition' | 'include' | 'extend' | 'dataFlow' | 'oneMany' | 'optionalMany' | 'syncMessage' | 'asyncMessage' | 'returnMessage' | 'createMessage' | 'destroyMessage' | 'sequenceFlow' | 'messageFlow' | 'transition' | 'trace'
  | 'communicationMessage'
export interface ModelField { id: string; name: string; type: string; visibility?: '+' | '-' | '#' | '~'; parameters?: string; primary?: boolean; foreign?: boolean; nullable?: boolean }
export interface NamedPort { id: string; name: string; side: Side; offset: number }
export interface EngineeringData {
  code?: string; stereotype?: string; description?: string; goal?: string; precondition?: string; postcondition?: string; mainFlow?: string; exceptionFlow?: string
  attributes?: ModelField[]; operations?: ModelField[]; fields?: ModelField[]; ports?: NamedPort[]
  notation?: 'yourdon' | 'gane'; fragment?: 'alt' | 'opt' | 'loop' | 'par'; condition?: string; secondCondition?: string
  entry?: string; exit?: string; doActivity?: string; technology?: string; protocol?: string; responsibility?: string; requirementText?: string
  timingStates?: string[]
  timeEvents?: {id:string;time:number;state:string;label:string}[]
}
export interface ModelObject { id: string; kind: ProfessionalKind; name: string; data: EngineeringData }
export interface DictionaryEntry { id: string; kind: 'flow' | 'store' | 'item'; name: string; definition: string; modelIds: string[]; flowIds?: string[] }

export interface BaseNode {
  id: string
  kind: ShapeKind | 'line' | 'pencil' | 'connector'
  x: number
  y: number
  w: number
  h: number
  /** 旋转角度（度） */
  rot: number
  /** 层级，越大越靠上 */
  z: number
  name?: string
  locked?: boolean
  hidden?: boolean
  /** 组合父级 id */
  parent?: string | null
  opacity?: number
  /** Model identity and containment are independent of view coordinates. */
  modelId?: string
  semantic?: EngineeringData
  container?: boolean
  childPageId?: string
  layoutLocked?: boolean
  fragmentSplit?: number
  lifeStart?: number
  lifeEnd?: number
  activationFor?: string
  activationStart?: string
  activationEnd?: string
}

export interface StyleProps {
  fill?: string
  fill2?: string
  gradient?: boolean
  stroke?: string
  strokeWidth?: number
  lineStyle?: LineStyle
  radius?: number
  shadow?: boolean
  arrow?: ArrowKind
  route?: RouteKind
}

export interface TextProps {
  text?: string
  fontSize?: number
  fontFamily?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  align?: TextAlign
  valign?: VAlign
  lineHeight?: number
  letterSpacing?: number
}

export interface ShapeNode extends BaseNode, StyleProps, TextProps {
  kind: VectorShapeKind
  /** 非文本图形可无 text 字段 */
  text?: string
  /** 路径点使用相对于对象宽高的坐标，便于保持缩放和工程序列化一致。 */
  anchors?: PathAnchor[]
  closed?: boolean
}

export interface PathAnchor {
  x: number
  y: number
  in?: { x: number; y: number }
  out?: { x: number; y: number }
}

export interface ImageNode extends BaseNode {
  kind: 'image'
  src: string
  corner?: number
  name?: string
}

export interface TableCell {
  text: string
  bold?: boolean
  color?: string
  fill?: string
}

export interface TableNode extends BaseNode {
  kind: 'table'
  rows: number
  cols: number
  data: TableCell[][]
  stroke?: string
  strokeWidth?: number
  fill?: string
  headerFill?: string
  headerColor?: string
  fontSize?: number
  gridWidth?: number
}

export interface LineNode extends BaseNode, TextProps {
  kind: 'line' | 'pencil' | 'connector'
  /** 相对起点坐标的点集（画笔用） */
  points?: { x: number; y: number }[]
  stroke?: string
  strokeWidth?: number
  lineStyle?: LineStyle
  /** 连线端点绑定的节点 */
  from?: { nodeId: string; side: Side; portId?: string }
  to?: { nodeId: string; side: Side; portId?: string }
  arrow?: ArrowKind
  route?: RouteKind
  /** 手工折点（正交连线） */
  bends?: { x: number; y: number }[]
  /** 曲线控制点偏移 */
  curve?: number
  pressure?: number[]
  relation?: RelationKind
  startMarker?: MarkerKind
  endMarker?: MarkerKind
  startLabel?: string
  endLabel?: string
  startRole?: string
  endRole?: string
  startMultiplicity?: string
  endMultiplicity?: string
  labelOffsets?: Partial<Record<'start' | 'middle' | 'end', { x: number; y: number }>>
  messageY?: number
  sequenceIndex?: number
  fragmentId?: string
  fragmentBranch?: number
  avoidObstacles?: boolean
  jumpLines?: boolean
  jumpPoints?: {x:number;y:number}[]
  avoidLabels?: boolean
  autoLabelOffset?: {x:number;y:number}
  messageNumber?: string
}

export type Side = 'top' | 'right' | 'bottom' | 'left' | 'auto'

export type AnyNode = ShapeNode | ImageNode | TableNode | LineNode

export interface Page {
  id: string
  name: string
  background: string
  nodes: Record<string, AnyNode>
  /** z 序 */
  order: string[]
  diagramType?: DiagramType
  notation?: 'yourdon' | 'gane'
  parentPageId?: string
  parentProcessId?: string
  levelLabel?: string
  numberMessages?: boolean
  print?: { width: number; height: number; margin: number }
}

export interface Doc {
  version: number
  /** Stable identity carried by native files and recovery snapshots. */
  documentId?: string
  title: string
  pages: Page[]
  activePageId: string
  createdAt: number
  updatedAt: number
  models?: Record<string, ModelObject>
  dictionary?: DictionaryEntry[]
}

/* ---------------- 视口 / UI 状态 ---------------- */

export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface SnapGuide {
  type: 'v' | 'h'
  pos: number
  from: number
  to: number
}

export interface SelectionBox {
  x: number
  y: number
  w: number
  h: number
}

export const DEFAULT_FONT = '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif'

export function newId(prefix = 'n'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
