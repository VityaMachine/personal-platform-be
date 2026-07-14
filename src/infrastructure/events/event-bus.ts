import { logger } from '../logger/logger.js';

type EventHandler<TPayload = unknown> = (payload: TPayload) => void | Promise<void>;

export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  public subscribe(eventName: string, handler: EventHandler): () => void {
    const handlers = this.handlers.get(eventName) ?? new Set<EventHandler>();

    handlers.add(handler);
    this.handlers.set(eventName, handlers);

    return () => {
      handlers.delete(handler);
    };
  }

  public async publish(eventName: string, payload: unknown): Promise<void> {
    const handlers = this.handlers.get(eventName);

    if (!handlers?.size) {
      return;
    }

    await Promise.all(
      [...handlers].map(async (handler) => {
        try {
          await handler(payload);
        } catch (error) {
          logger.error({ err: error, eventName }, 'Event handler failed');
        }
      }),
    );
  }
}

export const eventBus = new EventBus();
