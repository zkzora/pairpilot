/**
 * One read at a time, with a UI timeout. A result is kept only if the context it was read
 * for (pair, mode, owner, signer, chain) is still the current one when it lands.
 *
 * The SDK reads behind the monitor take no AbortSignal, so a timed-out read cannot be
 * cancelled. The UI gets its timeout error, but the gate stays locked until the underlying
 * read settles: repeated refreshes never stack concurrent requests on a slow RPC.
 */
export type GateResult<T> =
  | { status: "ok"; value: T } | { status: "error"; error: string } | { status: "stale" }
  /** Another read holds the gate. `overdue`: it already timed out and is still unsettled. */
  | { status: "skipped"; overdue: boolean };

export class ReadGate {
  private pending: Promise<unknown> | null = null;
  private overdue = false;
  constructor(private timeoutMs = 12_000) {}
  /** True until the underlying read settles, even after its timeout was reported. */
  get busy() { return this.pending !== null; }
  async run<T>(key: string, currentKey: () => string, read: () => Promise<T>): Promise<GateResult<T>> {
    if (this.pending) return { status: "skipped", overdue: this.overdue };
    const underlying = read();
    // The lock follows the read itself, not the race below.
    const release = () => { if (this.pending === settled) { this.pending = null; this.overdue = false; } };
    const settled: Promise<void> = underlying.then(release, release);
    this.pending = settled;
    let timer: ReturnType<typeof setTimeout> | undefined, timedOut = false;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { timedOut = this.overdue = true; reject(new Error(`Read timed out after ${this.timeoutMs / 1000} s.`)); }, this.timeoutMs); });
      const value = await Promise.race([underlying, timeout]);
      return currentKey() === key ? { status: "ok", value } : { status: "stale" };
    } catch (e) {
      return currentKey() === key ? { status: "error", error: e instanceof Error ? e.message : String(e) } : { status: "stale" };
    } finally {
      clearTimeout(timer);
      // Not timed out means the read itself settled: free the gate before returning.
      if (!timedOut) release();
    }
  }
}

/** Everything a monitor read depends on. Any change discards reads made for the old value. */
export const monitorKey = (parts: { mode: string; chainId: number; owner: string; signer: string; planId: string; symbols: [string, string] }) =>
  [parts.mode, parts.chainId, parts.owner.toLowerCase(), parts.signer.toLowerCase(), parts.planId, ...parts.symbols].join("|");

/** A read older than this is shown as stale, never as current. */
export const MONITOR_STALE_MS = 45_000;
export const MONITOR_INTERVAL_MS = 15_000;
