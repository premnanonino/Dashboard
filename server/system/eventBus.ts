/**
 * Decoupled Pub/Sub Event Bus for real-time Server-Sent Events (SSE) streaming
 * of Telnyx billing updates, SIP trunk state transitions, and CDR events.
 */

export type EventListener<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private readonly subscribers: Map<keyof Events, Set<EventListener<never>>>;

  constructor() {
    this.subscribers = new Map();
  }

  public subscribe<K extends keyof Events>(
    topic: K,
    listener: EventListener<Events[K]>,
  ): () => void {
    let set = this.subscribers.get(topic);
    if (!set) {
      set = new Set();
      this.subscribers.set(topic, set);
    }
    set.add(listener as EventListener<never>);

    return () => {
      set?.delete(listener as EventListener<never>);
    };
  }

  public publish<K extends keyof Events>(topic: K, payload: Events[K]): void {
    const set = this.subscribers.get(topic);
    if (!set) return;
    for (const listener of set) {
      try {
        (listener as EventListener<Events[K]>)(payload);
      } catch {
        // Isolate subscriber failures so one broken client stream never impacts others
      }
    }
  }
}
