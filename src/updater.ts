import "./updater.css";
import type { Update } from "@tauri-apps/plugin-updater";

const text = {
  en: {
    title: "Update available",
    description: "A new version of Mk.1 Lite is available.",
    install: "Update and restart",
    later: "Later",
    close: "Close",
    checking: "Checking for updates…",
    downloading: "Downloading update…",
    saving: "Saving open documents…",
    installing: "Installing update…",
    latest: "You are using the latest version.",
    failed: "Could not update. Check your connection and try again.",
    postponed: "Update postponed. Save your documents before trying again.",
    restart: "Update installed. Restart the app to finish.",
    detail:
      "Your open documents will be saved before installation. The app will restart after updating.",
  },
  zh: {
    title: "发现新版本",
    description: "Mk.1 Lite 有可用的新版本。",
    install: "更新并重启",
    later: "稍后",
    close: "关闭",
    checking: "正在检查更新…",
    downloading: "正在下载更新…",
    saving: "正在保存打开的文档…",
    installing: "正在安装更新…",
    latest: "当前已是最新版本。",
    failed: "更新失败，请检查网络连接后重试。",
    postponed: "已暂缓更新，请先保存文档后重试。",
    restart: "更新已安装，请重启应用以完成更新。",
    detail: "安装前会保存打开的文档，更新完成后应用将自动重启。",
  },
  fr: {
    title: "Mise à jour disponible",
    description: "Une nouvelle version de Mk.1 Lite est disponible.",
    install: "Mettre à jour et redémarrer",
    later: "Plus tard",
    close: "Fermer",
    checking: "Recherche de mises à jour…",
    downloading: "Téléchargement de la mise à jour…",
    saving: "Enregistrement des documents ouverts…",
    installing: "Installation de la mise à jour…",
    latest: "Vous utilisez la dernière version.",
    failed: "Échec de la mise à jour. Vérifiez la connexion et réessayez.",
    postponed:
      "Mise à jour reportée. Enregistrez les documents avant de réessayer.",
    restart: "Mise à jour installée. Redémarrez l’application pour terminer.",
    detail:
      "Les documents ouverts seront enregistrés avant l’installation. L’application redémarrera ensuite.",
  },
  de: {
    title: "Update verfügbar",
    description: "Eine neue Version von Mk.1 Lite ist verfügbar.",
    install: "Aktualisieren und neu starten",
    later: "Später",
    close: "Schließen",
    checking: "Updates werden gesucht…",
    downloading: "Update wird heruntergeladen…",
    saving: "Offene Dokumente werden gespeichert…",
    installing: "Update wird installiert…",
    latest: "Du verwendest die neueste Version.",
    failed: "Update fehlgeschlagen. Verbindung prüfen und erneut versuchen.",
    postponed:
      "Update verschoben. Dokumente vor einem erneuten Versuch speichern.",
    restart: "Update installiert. App zum Abschließen neu starten.",
    detail:
      "Offene Dokumente werden vor der Installation gespeichert. Die App startet danach neu.",
  },
  pt: {
    title: "Atualização disponível",
    description: "Uma nova versão do Mk.1 Lite está disponível.",
    install: "Atualizar e reiniciar",
    later: "Mais tarde",
    close: "Fechar",
    checking: "Verificando atualizações…",
    downloading: "Baixando atualização…",
    saving: "Salvando documentos abertos…",
    installing: "Instalando atualização…",
    latest: "Você está usando a versão mais recente.",
    failed:
      "Não foi possível atualizar. Verifique a conexão e tente novamente.",
    postponed:
      "Atualização adiada. Salve os documentos antes de tentar novamente.",
    restart: "Atualização instalada. Reinicie o aplicativo para concluir.",
    detail:
      "Os documentos abertos serão salvos antes da instalação. O aplicativo será reiniciado depois.",
  },
  ru: {
    title: "Доступно обновление",
    description: "Доступна новая версия Mk.1 Lite.",
    install: "Обновить и перезапустить",
    later: "Позже",
    close: "Закрыть",
    checking: "Проверка обновлений…",
    downloading: "Загрузка обновления…",
    saving: "Сохранение открытых документов…",
    installing: "Установка обновления…",
    latest: "Установлена последняя версия.",
    failed: "Не удалось обновить. Проверьте соединение и повторите попытку.",
    postponed: "Обновление отложено. Сохраните документы и повторите попытку.",
    restart: "Обновление установлено. Перезапустите приложение для завершения.",
    detail:
      "Перед установкой открытые документы будут сохранены. Затем приложение перезапустится.",
  },
};
type UpdateText = typeof text.en;
export interface DesktopUpdaterOptions {
  enabled: boolean;
  getLocale: () => string;
  /** Must save all dirty documents and return false if any save fails or is cancelled. */
  beforeInstall: () => Promise<boolean>;
}

export function createDesktopUpdater(options: DesktopUpdaterOptions) {
  const dialog = document.createElement("dialog");
  dialog.id = "desktop-updater";
  dialog.setAttribute("aria-labelledby", "updater-title");
  dialog.setAttribute("aria-describedby", "updater-message");
  dialog.innerHTML = `<div class="updater-heading"><span class="updater-symbol" aria-hidden="true">↓</span><h2 id="updater-title"></h2></div><p id="updater-message" role="status" aria-live="polite"></p><p class="updater-version"></p><pre class="updater-notes"></pre><progress class="updater-progress" hidden></progress><p class="updater-detail"></p><div class="updater-actions"><button type="button" data-updater-later></button><button type="button" data-updater-install></button></div>`;
  document.body.append(dialog);
  const message = dialog.querySelector<HTMLElement>("#updater-message")!;
  const version = dialog.querySelector<HTMLElement>(".updater-version")!;
  const notes = dialog.querySelector<HTMLElement>(".updater-notes")!;
  const detail = dialog.querySelector<HTMLElement>(".updater-detail")!;
  const progress = dialog.querySelector<HTMLProgressElement>("progress")!;
  const later = dialog.querySelector<HTMLButtonElement>(
    "[data-updater-later]",
  )!;
  const install = dialog.querySelector<HTMLButtonElement>(
    "[data-updater-install]",
  )!;
  let busy = false,
    working = false,
    installing = false,
    destroyed = false;
  let pending: Update | null = null;
  let previousFocus: HTMLElement | null = null;
  const t = (): UpdateText =>
    text[options.getLocale() as keyof typeof text] || text.en;
  const modal = (body: string, update?: Update) => {
    const labels = t();
    dialog.querySelector("h2")!.textContent = labels.title;
    message.textContent = body;
    version.textContent = update
      ? `${update.currentVersion} → ${update.version}`
      : "";
    notes.textContent = update?.body || "";
    notes.hidden = !update?.body;
    detail.textContent = update ? labels.detail : "";
    detail.hidden = !update;
    later.textContent = update ? labels.later : labels.close;
    install.textContent = labels.install;
    install.hidden = !update;
    install.disabled = false;
    later.disabled = false;
    progress.hidden = true;
    if (!dialog.open) {
      previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
    }
  };
  const dismiss = async () => {
    if (working) return;
    dialog.close();
    previousFocus?.focus();
    const resource = pending;
    pending = null;
    if (resource) await resource.close().catch(() => {});
  };
  later.addEventListener("click", () => void dismiss());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    void dismiss();
  });
  install.addEventListener("click", async () => {
    const update = pending;
    if (!update || working) return;
    working = true;
    later.disabled = true;
    install.disabled = true;
    progress.hidden = false;
    progress.removeAttribute("value");
    message.textContent = t().downloading;
    let total = 0,
      downloaded = 0;
    try {
      await update.download(
        (event) => {
          if (event.event === "Started") total = event.data.contentLength || 0;
          if (event.event === "Progress") downloaded += event.data.chunkLength;
          if (total > 0) {
            progress.max = total;
            progress.value = Math.min(downloaded, total);
          }
        },
        { timeout: 120_000 },
      );
      message.textContent = t().saving;
      // The modal stays open throughout download, save, install, and relaunch.
      // No editor interaction is possible after the final dirty-document check.
      if (!(await options.beforeInstall())) {
        working = false;
        await update.close().catch(() => {});
        pending = null;
        modal(t().postponed);
        return;
      }
      installing = true;
      message.textContent = t().installing;
      await update.install();
      const restart = async () => {
        message.textContent = t().restart;
        try {
          const { relaunch } = await import("@tauri-apps/plugin-process");
          await relaunch();
        } catch {
          // The package is already installed. Keep editor input locked and allow
          // retrying restart rather than continuing in the old process.
          progress.hidden = true;
          install.disabled = false;
          install.textContent = t().install;
          install.onclick = () => void restart();
        }
      };
      await restart();
    } catch {
      installing = false;
      working = false;
      pending = null;
      await update.close().catch(() => {});
      modal(t().failed);
    }
  });
  const check = async (manual = false) => {
    if (!options.enabled || busy || working || pending || destroyed) return;
    busy = true;
    if (manual) modal(t().checking);
    try {
      const updater = await import("@tauri-apps/plugin-updater");
      const update = await updater.check({ timeout: 15_000 });
      if (destroyed) {
        await update?.close().catch(() => {});
        return;
      }
      if (!update) {
        if (manual) modal(t().latest);
        return;
      }
      pending = update;
      modal(t().description, update);
    } catch {
      if (manual && !destroyed) modal(t().failed);
      // Background network failures do not interrupt writing; the next scheduled
      // check or an explicit user check retries the configured HTTPS endpoint.
    } finally {
      busy = false;
    }
  };
  const startup = options.enabled
    ? window.setTimeout(() => void check(), 8_000)
    : undefined;
  const interval = options.enabled
    ? window.setInterval(() => void check(), 6 * 60 * 60 * 1000)
    : undefined;
  return {
    check,
    get installationInProgress() {
      return installing;
    },
    get updateInProgress() {
      return working;
    },
    destroy() {
      destroyed = true;
      window.clearTimeout(startup);
      window.clearInterval(interval);
      if (!working) {
        void dismiss();
        dialog.remove();
      }
    },
  };
}
