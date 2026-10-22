import type { Journal, PairRecord } from "./types";

export class MemoryJournal implements Journal {
  protected records = new Map<string, PairRecord>();
  private locks = new Set<string>();
  async read(id: string) { return structuredClone(this.records.get(id) ?? null); }
  async write(record: PairRecord) { this.records.set(record.plan.id, structuredClone(record)); }
  async exclusive<T>(account: string, work: () => Promise<T>): Promise<T> {
    const key = account.toLowerCase();
    if (this.locks.has(key)) throw new Error("Another pair operation is running for this account.");
    this.locks.add(key);
    try { return await work(); } finally { this.locks.delete(key); }
  }
}

export class BrowserJournal implements Journal {
  async read(id: string): Promise<PairRecord | null> {
    const value = localStorage.getItem(`pairpilot:record:${id}`);
    return value ? JSON.parse(value) as PairRecord : null;
  }
  async write(record: PairRecord) { localStorage.setItem(`pairpilot:record:${record.plan.id}`, JSON.stringify(record)); }
  async exclusive<T>(account: string, work: () => Promise<T>): Promise<T> {
    if (!navigator.locks) throw new Error("This browser does not support cross-tab locking. Use a current browser on localhost.");
    return navigator.locks.request(`pairpilot:account:${account.toLowerCase()}`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error("Another PairPilot tab is using this account.");
      return work();
    });
  }
}
