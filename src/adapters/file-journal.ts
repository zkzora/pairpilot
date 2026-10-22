import { mkdir, readFile, writeFile, rename, rmdir } from "node:fs/promises";
import { join } from "node:path";
import type { Journal, PairRecord } from "../core/types";

/** Single-host file journal, atomic writes and an exclusive filesystem account lock. */
export class FileJournal implements Journal {
  constructor(private directory = ".pairpilot") {}
  private filename(id: string) {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid pair journal ID.");
    return join(this.directory, `${id}.json`);
  }
  async read(id: string): Promise<PairRecord | null> {
    try { return JSON.parse(await readFile(this.filename(id), "utf8")) as PairRecord; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  }
  async write(record: PairRecord) {
    await mkdir(this.directory, { recursive: true });
    const target = this.filename(record.plan.id), temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, target);
  }
  async exclusive<T>(account: string, work: () => Promise<T>) {
    if (!/^(0x[a-fA-F0-9]{40}|simulation)$/.test(account)) throw new Error("Invalid account lock.");
    await mkdir(this.directory, { recursive: true });
    const lock = join(this.directory, `lock-${account.toLowerCase()}`);
    try { await mkdir(lock); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Account is locked by another process. After a crash, verify no PairPilot process is running before removing the empty lock directory: ${lock}`);
      throw error;
    }
    try { return await work(); } finally { await rmdir(lock); }
  }
}
