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

export const rosapi = {
  topicTypes: (ros: ROSLIB.Ros) =>
    callRosapi<{ topic_types: TopicType[] }>(ros, 'topic_types').then(r => r.topic_types || []),
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
