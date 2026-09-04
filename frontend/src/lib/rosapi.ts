/**
 * rosapi 调用助手 — 已按 rosbridge_suite ros2 分支 rosapi/README.md 核实服务清单
 */
import ROSLIB from 'roslib'
import type { RosTypeDef } from './message-def'

/** Promise 化的 rosapi 服务调用；失败时 reject（错误信息含服务名） */
export function callRosapi<T = any>(
  ros: ROSLIB.Ros,
  service: string,
  request: Record<string, any> = {},
  timeoutMs = 8000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!ros) { reject(new Error('未连接 rosbridge')); return }
    const svc = new ROSLIB.Service({ ros, name: `/rosapi/${service}`, serviceType: `rosapi_msgs/srv/${service}` })
    const timer = setTimeout(() => reject(new Error(`rosapi/${service} 超时`)), timeoutMs)
    svc.callService(new ROSLIB.ServiceRequest(request), (resp: T) => {
      clearTimeout(timer)
      resolve(resp)
    }, (err: any) => {
      clearTimeout(timer)
      reject(new Error(err?.message || `rosapi/${service} 调用失败`))
    })
  })
}

export interface TopicType { name: string; type: string }

/**
 * 话题类型列表 — 兼容两种 rosapi：
 * - 新版 (2.7.0+，Jazzy/Kilted apt)：/rosapi/topics 返回 {topics, types}（按索引对齐）
 * - 旧版 (Humble 等)：/rosapi/topic_types 返回 {topic_types: [{name, type}]}
 */
export const rosapi = {
  topicTypes: async (ros: ROSLIB.Ros): Promise<TopicType[]> => {
    try {
      const r = await callRosapi<{ topics?: string[]; types?: string[] }>(ros, 'topics')
      // 新版 rosapi：types 数组与 topics 按索引对齐；旧版返回 {topics} 无 types 字段 → 走旧接口
      if (Array.isArray(r.topics) && Array.isArray(r.types) && r.types.length === r.topics.length) {
        return r.topics.map((name, i) => ({ name, type: r.types?.[i] || '' }))
      }
    } catch { /* 走旧 API */ }
    const old = await callRosapi<{ topic_types?: TopicType[] }>(ros, 'topic_types')
    return old.topic_types || []
  },
  topicType: (ros: ROSLIB.Ros, topic: string) =>
    callRosapi<{ type: string }>(ros, 'topic_type', { topic }).then(r => r.type || ''),
  serviceType: (ros: ROSLIB.Ros, service: string) =>
    callRosapi<{ type: string }>(ros, 'service_type', { service }).then(r => r.type || ''),
  /** 服务列表 — 兼容新旧 rosapi（新：{services}；旧：{services}+/rosapi/service_types） */
  services: async (ros: ROSLIB.Ros): Promise<TopicType[]> => {
    const r = await callRosapi<{ services?: string[]; types?: string[] }>(ros, 'services')
    const services = r.services || []
    let types = r.types || []
    if (services.length > 0 && types.length === 0) {
      try { types = (await callRosapi<{ types?: string[] }>(ros, 'service_types')).types || [] } catch { /* 新版无此服务 */ }
    }
    return services.map((name, i) => ({ name, type: types[i] || '' }))
  },
  topicsForType: (ros: ROSLIB.Ros, type: string) =>
    callRosapi<{ topics: string[] }>(ros, 'topics_for_type', { type }).then(r => r.topics || []),
  servicesForType: (ros: ROSLIB.Ros, type: string) =>
    callRosapi<{ services: string[] }>(ros, 'services_for_type', { type }).then(r => r.services || []),
  actionServers: (ros: ROSLIB.Ros) =>
    callRosapi<{ action_servers: string[] }>(ros, 'action_servers').then(r => r.action_servers || []),
  actionType: (ros: ROSLIB.Ros, action: string) =>
    callRosapi<{ type: string }>(ros, 'action_type', { action }).then(r => r.type || ''),
  messageDetails: (ros: ROSLIB.Ros, type: string) =>
    callRosapi<{ typedefs: RosTypeDef[] }>(ros, 'message_details', { type }).then(r => r.typedefs || []),
  serviceRequestDetails: (ros: ROSLIB.Ros, type: string) =>
    callRosapi<{ typedefs: RosTypeDef[] }>(ros, 'service_request_details', { type }).then(r => r.typedefs || []),
  serviceResponseDetails: (ros: ROSLIB.Ros, type: string) =>
    callRosapi<{ typedefs: RosTypeDef[] }>(ros, 'service_response_details', { type }).then(r => r.typedefs || []),
  actionGoalDetails: (ros: ROSLIB.Ros, type: string) =>
    callRosapi<{ typedefs: RosTypeDef[] }>(ros, 'action_goal_details', { type }).then(r => r.typedefs || []),
  actionResultDetails: (ros: ROSLIB.Ros, type: string) =>
    callRosapi<{ typedefs: RosTypeDef[] }>(ros, 'action_result_details', { type }).then(r => r.typedefs || []),
  actionFeedbackDetails: (ros: ROSLIB.Ros, type: string) =>
    callRosapi<{ typedefs: RosTypeDef[] }>(ros, 'action_feedback_details', { type }).then(r => r.typedefs || []),
}
