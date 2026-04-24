declare module 'roslib' {
  export class Ros {
    constructor(options: { url: string })
    on(event: string, callback: (data?: any) => void): void
    close(): void
    callService<T = any>(serviceName: string, request: any, callback: (response: T) => void): void
  }
  export class Service {
    constructor(options: { ros: Ros; name: string; serviceType: string })
    callService(request: ServiceRequest, callback: (response: any) => void): void
    call(request: any, callback: (response: any) => void): void
  }
  export class ServiceRequest {
    constructor(values?: Record<string, any>)
  }
  export class Topic {
    constructor(options: { ros: Ros; name: string; messageType: string; throttle_rate?: number })
    subscribe(callback: (message: any) => void): void
    unsubscribe(): void
    publish(message: Message): void
  }
  export class Message {
    constructor(values: Record<string, any>)
  }
}
