export interface AutoSaveSettings {
  enabled: boolean;
  intervalMinutes: number;
}

export const DEFAULT_AUTO_SAVE_SETTINGS: Readonly<AutoSaveSettings> =
  Object.freeze({
    enabled: true,
    intervalMinutes: 15,
  });

export function normalizeAutoSaveSettings(
  value?: Partial<AutoSaveSettings> | null,
): AutoSaveSettings {
  const minutes = value?.intervalMinutes;
  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : true,
    intervalMinutes:
      typeof minutes === "number" && Number.isFinite(minutes)
        ? Math.max(1, Math.min(23 * 60 + 59, Math.round(minutes)))
        : 15,
  };
}

export interface AutoSaveClock {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AutoSaveSchedulerOptions {
  getSettings: () => AutoSaveSettings;
  /** False while manual saves, file pickers, close prompts, or updates are active. */
  canSave: () => boolean;
  /** Saves dirty documents that already have a persistent path. Never opens Save As. */
  save: () => Promise<void | boolean>;
  onError?: (error: unknown) => void;
  clock?: AutoSaveClock;
}

export function createAutoSaveScheduler(options: AutoSaveSchedulerOptions) {
  const clock = options.clock || {
    setTimeout: (callback: () => void, delay: number) =>
      globalThis.setTimeout(callback, delay),
    clearTimeout: (handle: unknown) =>
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  let settings = normalizeAutoSaveSettings(options.getSettings());
  let timer: unknown;
  let pendingTimer = false;
  let running = false;
  let destroyed = false;
  let generation = 0;
  const clear = () => {
    if (pendingTimer) clock.clearTimeout(timer);
    pendingTimer = false;
  };
  const schedule = () => {
    clear();
    if (destroyed || !settings.enabled || running) return;
    pendingTimer = true;
    timer = clock.setTimeout(() => {
      pendingTimer = false;
      void run();
    }, settings.intervalMinutes * 60_000);
  };
  const run = async () => {
    if (destroyed || running) return;
    clear();
    settings = normalizeAutoSaveSettings(options.getSettings());
    if (!settings.enabled) return;
    const startedGeneration = generation;
    running = true;
    try {
      if (options.canSave()) await options.save();
    } catch (error) {
      options.onError?.(error);
    } finally {
      running = false;
      if (!destroyed) {
        if (startedGeneration !== generation)
          settings = normalizeAutoSaveSettings(options.getSettings());
        schedule();
      }
    }
  };
  schedule();
  return {
    runNow: run,
    get running() {
      return running;
    },
    refresh() {
      if (destroyed) return;
      const next = normalizeAutoSaveSettings(options.getSettings());
      if (
        next.enabled === settings.enabled &&
        next.intervalMinutes === settings.intervalMinutes
      )
        return;
      settings = next;
      generation++;
      schedule();
    },
    destroy() {
      destroyed = true;
      generation++;
      clear();
    },
  };
}
