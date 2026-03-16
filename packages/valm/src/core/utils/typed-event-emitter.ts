import { EventEmitter } from 'eventemitter3'

export class TypedEventEmitter<TEvents extends { [K in keyof TEvents]: (...args: any[]) => void }> {
  private emitter = new EventEmitter()

  on<K extends keyof TEvents>(event: K, listener: TEvents[K]): () => void {
    this.emitter.on(event as string, listener)
    return () => this.emitter.off(event as string, listener)
  }

  off<K extends keyof TEvents>(event: K, listener: TEvents[K]): void {
    this.emitter.off(event as string, listener)
  }

  emit<K extends keyof TEvents>(event: K, ...args: Parameters<TEvents[K]>): boolean {
    return this.emitter.emit(event as string, ...args)
  }

  once<K extends keyof TEvents>(event: K, listener: TEvents[K]): () => void {
    this.emitter.once(event as string, listener)
    return () => this.emitter.off(event as string, listener)
  }

  removeAllListeners(event?: keyof TEvents): void {
    this.emitter.removeAllListeners(event as string)
  }

  listenerCount(event: keyof TEvents): number {
    return this.emitter.listenerCount(event as string)
  }
}
