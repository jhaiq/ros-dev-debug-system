/**
 * 工作台插件注册表 — 每个工作台面板是一个紧凑版 rqt 插件
 */
import type { ComponentType } from 'react'
import ConsolePanel from './panels/ConsolePanel'
import PlotPanel from './panels/PlotPanel'
import ImagePanel from './panels/ImagePanel'
import TopicsPanel from './panels/TopicsPanel'
import EchoPanel from './panels/EchoPanel'
import TFPanel from './panels/TFPanel'
import PublishPanel from './panels/PublishPanel'
import MonitorPanel from './panels/MonitorPanel'

export interface WorkspacePlugin {
  id: string
  title: string
  component: ComponentType
}

export const PLUGINS: WorkspacePlugin[] = [
  { id: 'console', title: '控制台', component: ConsolePanel },
  { id: 'plot', title: '绘图', component: PlotPanel },
  { id: 'image', title: '图像', component: ImagePanel },
  { id: 'topics', title: '话题列表', component: TopicsPanel },
  { id: 'echo', title: '话题 Echo', component: EchoPanel },
  { id: 'tf', title: 'TF 树', component: TFPanel },
  { id: 'publish', title: '消息发布', component: PublishPanel },
  { id: 'monitor', title: '诊断监视', component: MonitorPanel },
]

export function getPlugin(id: string): WorkspacePlugin | undefined {
  return PLUGINS.find(p => p.id === id)
}
