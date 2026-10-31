import { acquireLock, addAlert, finishJob, releaseLock, startJob } from "@bias/db";
import type { JobEnv } from "./env";

/** Wraps a job: single-flight lock (replaces pg advisory lock), job_runs bookkeeping, time budget. */
export async function runJob(env: JobEnv, name: string, budgetMs: number, fn: (deadline: number) => Promise<string>) {
  const holder = `${name}:${process.env.GITHUB_RUN_ID ?? "local"}:${Math.random().toString(36).slice(2, 8)}`;
  if (!(await acquireLock(env.db, name, holder, budgetMs + 120_000))) {
    env.log(`${name}: another run holds the lock, exiting`);
    return;
  }
  const id = await startJob(env.db, name);
  try {
    const summary = await fn(Date.now() + budgetMs);
    await finishJob(env.db, id, true, summary);
    env.log(`${name}: ok — ${summary}`);
  } catch (e) {
    const msg = (e as Error).stack ?? String(e);
    await finishJob(env.db, id, false, "", msg.slice(0, 4000));
    await addAlert(env.db, "critical", `${name} failed: ${(e as Error).message}`.slice(0, 500));
    env.log(`${name}: FAILED`, e);
    process.exitCode = 1;
  } finally {
    await releaseLock(env.db, name, holder);
  }
}
