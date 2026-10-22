import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";

/**
 * Records the dashboard demo video against the local dev server (npm run dev).
 * Part 1 is SIMULATION (labeled on screen): a HYPE/SOL pair whose second signature is
 * rejected, the close review and recovery to flat. Part 2 is TESTNET read-only: live
 * HYPE/SOL books and Setup. No wallet is connected and nothing is signed.
 */
const base = process.env.PAIRPILOT_URL ?? "http://127.0.0.1:3000";
const dir = "evidence/demo";
await rm(`${dir}/raw`, { recursive: true, force: true });
await mkdir(`${dir}/raw`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PAIRPILOT_CHROMIUM });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: `${dir}/raw`, size: { width: 1280, height: 800 } } });
const page = await context.newPage();
const pause = (ms = 1600) => page.waitForTimeout(ms);
const click = async (p: Page, name: string, exact = true) => { await p.getByRole("button", { name, exact }).click(); await pause(); };
try {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Preview pair", exact: true }).waitFor();
  await pause(2500);
  // Part 1: simulation of a rejected second signature and its recovery.
  await page.getByLabel("Pair", { exact: true }).selectOption({ label: "HYPE / SOL" }); await pause();
  await page.getByLabel("Failure scenario").selectOption("second-rejected"); await pause();
  await click(page, "Preview pair"); await pause(2500);
  await click(page, "Execute simulation"); await pause(3500);
  await page.getByRole("button", { name: "Execution journal" }).click(); await pause(2500);
  await click(page, "Close remaining exposure"); await pause(3000);
  await click(page, "Execute simulated close"); await pause(3000);
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Activity" }).click(); await pause(3000);
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Trade" }).click(); await pause();
  await click(page, "New pair");
  // Part 2: testnet, read-only.
  await page.getByRole("radio", { name: "Testnet", exact: true }).click();
  await page.getByText("SNAPSHOT", { exact: true }).waitFor({ timeout: 60_000 }); await pause(3500);
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Setup" }).click(); await pause(3500);
  await page.getByRole("radio", { name: "Local CLI", exact: true }).click(); await pause(3000);
} finally {
  await context.close();
  await browser.close();
}
const [video] = await readdir(`${dir}/raw`);
await rename(`${dir}/raw/${video}`, `${dir}/pairpilot-demo.webm`);
await rm(`${dir}/raw`, { recursive: true, force: true });
console.log(`Recorded ${dir}/pairpilot-demo.webm`);
