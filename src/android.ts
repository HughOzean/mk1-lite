/** The bridge is injected only into the Android app's bundled, trusted page. */
declare global {
  interface Window {
    Mark1Android?: {
      openFile(id: string): void;
      takeOpenedFiles?(): string;
      saveFile(id: string, name: string, text: string, uri: string): void;
    };
  }
}
let sequence = 0;
const pending = new Map<
  string,
  {
    resolve: (value: AndroidFile | null) => void;
    reject: (error: Error) => void;
  }
>();
export interface AndroidFile {
  name: string;
  text: string;
  uri: string;
}
export const isAndroidApp = () => !!window.Mark1Android;
window.addEventListener("mark1-android-result", ((event: CustomEvent) => {
  const { id, result, error } = event.detail;
  const request = pending.get(id);
  if (!request) return;
  pending.delete(id);
  if (error) request.reject(new Error(error));
  else request.resolve(result);
}) as EventListener);
export function androidFile(
  action: "open" | "save",
  name = "",
  text = "",
  uri = "",
) {
  return new Promise<AndroidFile | null>((resolve, reject) => {
    const id = String(++sequence);
    pending.set(id, { resolve, reject });
    try {
      if (action === "open") window.Mark1Android!.openFile(id);
      else window.Mark1Android!.saveFile(id, name, text, uri);
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

/** Drain native OS-open requests after workspace restore and on later wakeups. */
export function watchAndroidOpenedFiles(
  onFile: (file: AndroidFile & { error?: string }) => void,
  onError: () => void,
) {
  if (!window.Mark1Android?.takeOpenedFiles) return;
  const drain = () => {
    try {
      const files: (AndroidFile & { error?: string })[] = JSON.parse(
        window.Mark1Android!.takeOpenedFiles!(),
      );
      for (const file of files) onFile(file);
    } catch {
      onError();
    }
  };
  window.addEventListener("mark1-android-opened", drain);
  window.addEventListener("pageshow", drain);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) drain();
  });
  drain();
}
