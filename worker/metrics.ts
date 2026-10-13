// Analytics Engine: cheap counters for dashboards (SELECT ... FROM kaduna_metrics). Never blocks or breaks a request.

/** Record one event. `event` is the index; blobs are labels (shard, route...) and doubles are numbers (count, ms...). */
export function track(env: Env, event: string, data: { blobs?: string[]; doubles?: number[] } = {}): void {
  try {
    env.METRICS?.writeDataPoint({ indexes: [event], blobs: data.blobs ?? [], doubles: data.doubles ?? [] });
  } catch {
    /* metrics are best effort */
  }
}
