import "./autosave.css";
import {
  createAutoSaveScheduler,
  normalizeAutoSaveSettings,
  type AutoSaveSchedulerOptions,
  type AutoSaveSettings,
} from "./autosave-scheduler";
export {
  DEFAULT_AUTO_SAVE_SETTINGS,
  normalizeAutoSaveSettings,
  type AutoSaveSettings,
} from "./autosave-scheduler";

const messages = {
  zh: {
    title: "自动保存",
    enabled: "自动保存文件",
    interval: "保存间隔",
    hours: "小时",
    minutes: "分钟",
    hint: "定时保存已打开且有文件路径的修改；新文档保留为本地草稿，不会自动弹出另存为。",
    minimum: "保存间隔最短为 1 分钟。",
    selectedMinimum: "已将保存间隔设为最短 1 分钟。",
  },
  en: {
    title: "Auto-save",
    enabled: "Automatically save files",
    interval: "Save interval",
    hours: "Hours",
    minutes: "Minutes",
    hint: "Periodically save changes to files with an existing path. New documents remain local drafts; Save As will not open automatically.",
    minimum: "The minimum interval is 1 minute.",
    selectedMinimum: "The interval has been set to the minimum of 1 minute.",
  },
  pt: {
    title: "Salvamento automático",
    enabled: "Salvar arquivos automaticamente",
    interval: "Intervalo",
    hours: "Horas",
    minutes: "Minutos",
    hint: "Salva alterações em arquivos com um caminho existente. Novos documentos continuam como rascunhos locais, sem abrir Salvar como automaticamente.",
    minimum: "O intervalo mínimo é de 1 minuto.",
    selectedMinimum: "O intervalo foi definido para o mínimo de 1 minuto.",
  },
  fr: {
    title: "Enregistrement automatique",
    enabled: "Enregistrer les fichiers automatiquement",
    interval: "Intervalle",
    hours: "Heures",
    minutes: "Minutes",
    hint: "Enregistre les modifications des fichiers ayant déjà un chemin. Les nouveaux documents restent des brouillons locaux, sans ouvrir Enregistrer sous automatiquement.",
    minimum: "L’intervalle minimum est de 1 minute.",
    selectedMinimum: "L’intervalle a été réglé sur le minimum de 1 minute.",
  },
  de: {
    title: "Automatisch speichern",
    enabled: "Dateien automatisch speichern",
    interval: "Speicherintervall",
    hours: "Stunden",
    minutes: "Minuten",
    hint: "Speichert Änderungen an Dateien mit vorhandenem Pfad. Neue Dokumente bleiben lokale Entwürfe; Speichern unter wird nicht automatisch geöffnet.",
    minimum: "Das Mindestintervall beträgt 1 Minute.",
    selectedMinimum: "Das Intervall wurde auf mindestens 1 Minute gesetzt.",
  },
  ru: {
    title: "Автосохранение",
    enabled: "Автоматически сохранять файлы",
    interval: "Интервал сохранения",
    hours: "Часы",
    minutes: "Минуты",
    hint: "Периодически сохраняет изменения файлов с существующим путём. Новые документы остаются локальными черновиками; окно «Сохранить как» автоматически не открывается.",
    minimum: "Минимальный интервал — 1 минута.",
    selectedMinimum: "Установлен минимальный интервал: 1 минута.",
  },
};

export interface AutoSaveOptions extends AutoSaveSchedulerOptions {
  container: HTMLElement;
  getLocale: () => string;
  onSettingsChange: (settings: AutoSaveSettings) => void;
}

const ROW_HEIGHT = 36;
function createWheel(max: number, onChange: (value: number) => void) {
  const shell = document.createElement("div");
  shell.className = "autosave-wheel-shell";
  const band = document.createElement("div");
  band.className = "autosave-wheel-band";
  band.setAttribute("aria-hidden", "true");
  const wheel = document.createElement("div");
  wheel.className = "autosave-wheel";
  wheel.tabIndex = 0;
  wheel.setAttribute("role", "spinbutton");
  wheel.setAttribute("aria-valuemin", "0");
  wheel.setAttribute("aria-valuemax", String(max));
  wheel.setAttribute("aria-orientation", "vertical");
  const track = document.createElement("div");
  track.className = "autosave-wheel-track";
  track.setAttribute("aria-hidden", "true");
  const rows = Array.from({ length: max + 1 }, (_, value) => {
    const row = document.createElement("div");
    row.className = "autosave-wheel-number";
    row.dataset.value = String(value);
    row.textContent = String(value).padStart(2, "0");
    track.append(row);
    return row;
  });
  wheel.append(track);
  shell.append(band, wheel);
  let current = 0;
  let unit = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = (value: number) => {
    current = Math.max(0, Math.min(max, value));
    wheel.setAttribute("aria-valuenow", String(current));
    wheel.setAttribute("aria-valuetext", `${current} ${unit}`);
    rows.forEach((row, index) =>
      row.classList.toggle("selected", index === current),
    );
  };
  const syncScroll = () => {
    if (
      wheel.clientHeight > 0 &&
      Math.abs(wheel.scrollTop - current * ROW_HEIGHT) > 0.5
    )
      wheel.scrollTop = current * ROW_HEIGHT;
  };
  const choose = (value: number) => {
    clearTimeout(timer);
    update(value);
    syncScroll();
    onChange(current);
  };
  wheel.addEventListener("keydown", (event) => {
    const next: Record<string, number> = {
      ArrowUp: current - 1,
      ArrowDown: current + 1,
      PageUp: current - 5,
      PageDown: current + 5,
      Home: 0,
      End: max,
    };
    if (!Object.hasOwn(next, event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    choose(next[event.key]);
  });
  wheel.addEventListener("click", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      ".autosave-wheel-number",
    );
    if (row) {
      wheel.focus();
      choose(Number(row.dataset.value));
    }
  });
  wheel.addEventListener(
    "scroll",
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // display:none (including a closed settings dialog) reports scrollTop=0.
        // Never persist that layout reset as a user-selected interval.
        if (!wheel.clientHeight || !wheel.getClientRects().length) return;
        const value = Math.max(
          0,
          Math.min(max, Math.round(wheel.scrollTop / ROW_HEIGHT)),
        );
        if (value !== current) {
          update(value);
          onChange(value);
        }
        syncScroll();
      }, 160);
    },
    { passive: true },
  );
  // A closed settings dialog has no scroll layout. Position its wheels when it opens.
  const observer = new ResizeObserver(() => {
    if (!wheel.clientHeight || !wheel.getClientRects().length) {
      clearTimeout(timer);
      return;
    }
    syncScroll();
  });
  observer.observe(wheel);
  return {
    shell,
    element: wheel,
    set(value: number, label: string) {
      clearTimeout(timer);
      unit = label;
      update(value);
      syncScroll();
    },
    destroy() {
      clearTimeout(timer);
      observer.disconnect();
    },
  };
}

export function createAutoSave(options: AutoSaveOptions) {
  const section = document.createElement("section");
  section.className = "autosave-settings";
  section.innerHTML = `<h3 data-autosave-title></h3><label class="setting-row"><span data-autosave-enabled-label></span><span class="switch-control"><input type="checkbox" role="switch" data-autosave-enabled><span class="switch-track" aria-hidden="true"></span></span></label><p class="settings-intro" data-autosave-hint></p><div class="autosave-interval-label" data-autosave-interval></div><div class="autosave-wheels" role="group"><div class="autosave-unit" data-autosave-hours><span class="autosave-unit-label"></span></div><span class="autosave-wheel-separator" aria-hidden="true">:</span><div class="autosave-unit" data-autosave-minutes><span class="autosave-unit-label"></span></div></div><p class="autosave-minimum" role="status" aria-live="polite"></p>`;
  options.container.append(section);
  const enabled = section.querySelector<HTMLInputElement>(
    "[data-autosave-enabled]",
  )!;
  const hourUnit = section.querySelector<HTMLElement>("[data-autosave-hours]")!;
  const minuteUnit = section.querySelector<HTMLElement>(
    "[data-autosave-minutes]",
  )!;
  const minimum = section.querySelector<HTMLElement>(".autosave-minimum")!;
  const localeText = () =>
    messages[options.getLocale() as keyof typeof messages] || messages.en;
  let settings = normalizeAutoSaveSettings(options.getSettings());
  let correctedMinimum = false;
  const scheduler = createAutoSaveScheduler(options);
  const changeTime = (hours: number, minutes: number) => {
    correctedMinimum = hours === 0 && minutes === 0;
    settings = normalizeAutoSaveSettings({
      ...settings,
      intervalMinutes: hours * 60 + minutes,
    });
    options.onSettingsChange({ ...settings });
    scheduler.refresh();
    render();
  };
  const hours = createWheel(23, (value) =>
    changeTime(value, settings.intervalMinutes % 60),
  );
  const minutes = createWheel(59, (value) =>
    changeTime(Math.floor(settings.intervalMinutes / 60), value),
  );
  hours.element.dataset.autosaveWheel = "hours";
  minutes.element.dataset.autosaveWheel = "minutes";
  hourUnit.append(hours.shell);
  minuteUnit.append(minutes.shell);
  enabled.addEventListener("change", () => {
    settings.enabled = enabled.checked;
    options.onSettingsChange({ ...settings });
    scheduler.refresh();
  });
  function render() {
    const t = localeText();
    section.querySelector("[data-autosave-title]")!.textContent = t.title;
    section.querySelector("[data-autosave-enabled-label]")!.textContent =
      t.enabled;
    section.querySelector("[data-autosave-hint]")!.textContent = t.hint;
    section.querySelector("[data-autosave-interval]")!.textContent = t.interval;
    section
      .querySelector(".autosave-wheels")!
      .setAttribute("aria-label", t.interval);
    hourUnit.querySelector(".autosave-unit-label")!.textContent = t.hours;
    minuteUnit.querySelector(".autosave-unit-label")!.textContent = t.minutes;
    hours.element.setAttribute("aria-label", t.hours);
    minutes.element.setAttribute("aria-label", t.minutes);
    hours.element.setAttribute("aria-describedby", "autosave-minimum");
    minutes.element.setAttribute("aria-describedby", "autosave-minimum");
    minimum.id = "autosave-minimum";
    minimum.textContent = correctedMinimum ? t.selectedMinimum : t.minimum;
    enabled.checked = settings.enabled;
    hours.set(Math.floor(settings.intervalMinutes / 60), t.hours);
    minutes.set(settings.intervalMinutes % 60, t.minutes);
  }
  render();
  return {
    runNow: scheduler.runNow,
    get running() {
      return scheduler.running;
    },
    refresh() {
      settings = normalizeAutoSaveSettings(options.getSettings());
      render();
      scheduler.refresh();
    },
    destroy() {
      hours.destroy();
      minutes.destroy();
      scheduler.destroy();
      section.remove();
    },
  };
}
