import test from "node:test";
import assert from "node:assert/strict";
import {
  createAutoSaveScheduler,
  normalizeAutoSaveSettings,
  type AutoSaveSettings,
} from "../src/autosave-scheduler.ts";

function clock() {
  let now = 0,
    id = 0;
  const jobs = new Map<number, { at: number; callback: () => void }>();
  return {
    setTimeout(callback: () => void, delay: number) {
      const handle = ++id;
      jobs.set(handle, { at: now + delay, callback });
      return handle;
    },
    clearTimeout(handle: unknown) {
      jobs.delete(handle as number);
    },
    async advance(milliseconds: number) {
      const end = now + milliseconds;
      for (;;) {
        const next = [...jobs]
          .sort((a, b) => a[1].at - b[1].at)
          .find(([, job]) => job.at <= end);
        if (!next) break;
        now = next[1].at;
        jobs.delete(next[0]);
        next[1].callback();
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      now = end;
    },
    count: () => jobs.size,
  };
}

test("autosave defaults to 15 minutes and validates zero/invalid/out-of-range settings", () => {
  assert.deepEqual(normalizeAutoSaveSettings(), {
    enabled: true,
    intervalMinutes: 15,
  });
  assert.deepEqual(
    normalizeAutoSaveSettings({ enabled: false, intervalMinutes: 0 }),
    { enabled: false, intervalMinutes: 1 },
  );
  assert.equal(
    normalizeAutoSaveSettings({ intervalMinutes: Infinity }).intervalMinutes,
    15,
  );
  assert.equal(
    normalizeAutoSaveSettings({ intervalMinutes: -5 }).intervalMinutes,
    1,
  );
  assert.equal(
    normalizeAutoSaveSettings({ intervalMinutes: 2000 }).intervalMinutes,
    1439,
  );
});

test("autosave waits the configured interval, skips busy states, and does not run while disabled", async () => {
  const time = clock();
  let saves = 0,
    available = true;
  let settings: AutoSaveSettings = { enabled: true, intervalMinutes: 15 };
  const scheduler = createAutoSaveScheduler({
    clock: time,
    getSettings: () => settings,
    canSave: () => available,
    save: async () => {
      saves++;
    },
  });
  await time.advance(14 * 60_000);
  assert.equal(saves, 0);
  await time.advance(60_000);
  assert.equal(saves, 1);
  available = false;
  await time.advance(15 * 60_000);
  assert.equal(saves, 1);
  settings = { enabled: false, intervalMinutes: 15 };
  scheduler.refresh();
  assert.equal(time.count(), 0);
  await time.advance(60 * 60_000);
  assert.equal(saves, 1);
  settings = { enabled: true, intervalMinutes: 1 };
  available = true;
  scheduler.refresh();
  await time.advance(60_000);
  assert.equal(saves, 2);
  scheduler.destroy();
  assert.equal(time.count(), 0);
});

test("autosave prevents overlap and uses settings changed during an active save", async () => {
  const time = clock();
  let saves = 0;
  let release!: () => void;
  let settings: AutoSaveSettings = { enabled: true, intervalMinutes: 1 };
  const scheduler = createAutoSaveScheduler({
    clock: time,
    getSettings: () => settings,
    canSave: () => true,
    save: () => {
      saves++;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  });
  await time.advance(60_000);
  assert.equal(saves, 1);
  assert.equal(scheduler.running, true);
  await scheduler.runNow();
  await time.advance(60 * 60_000);
  assert.equal(saves, 1);
  settings = { enabled: true, intervalMinutes: 2 };
  scheduler.refresh();
  release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await time.advance(119_999);
  assert.equal(saves, 1);
  await time.advance(1);
  assert.equal(saves, 2);
  scheduler.destroy();
  release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(time.count(), 0);
});

test("autosave catches save failures, reports them and retries on the next interval", async () => {
  const time = clock();
  let saves = 0,
    errors = 0;
  const scheduler = createAutoSaveScheduler({
    clock: time,
    getSettings: () => ({ enabled: true, intervalMinutes: 1 }),
    canSave: () => true,
    save: async () => {
      saves++;
      throw new Error("write failed");
    },
    onError: () => {
      errors++;
    },
  });
  await time.advance(60_000);
  assert.equal(saves, 1);
  assert.equal(errors, 1);
  assert.equal(scheduler.running, false);
  await time.advance(60_000);
  assert.equal(saves, 2);
  assert.equal(errors, 2);
  scheduler.destroy();
});

test("unchanged settings refreshes do not postpone the next scheduled save", async () => {
  const time = clock();
  let saves = 0;
  const scheduler = createAutoSaveScheduler({
    clock: time,
    getSettings: () => ({ enabled: true, intervalMinutes: 15 }),
    canSave: () => true,
    save: async () => {
      saves++;
    },
  });
  await time.advance(14 * 60_000);
  scheduler.refresh();
  scheduler.refresh();
  await time.advance(60_000);
  assert.equal(saves, 1);
  scheduler.destroy();
});
