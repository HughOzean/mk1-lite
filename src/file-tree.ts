import "./file-tree.css";

interface TreeDocument {
  id: string;
  name: string;
  path: string | null;
  file?: File;
}
interface OpenTreeFile {
  path: string | null;
  name: string;
  text: string;
  file?: File;
  root?: string;
}
interface FileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}
interface DirectoryHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterableIterator<[string, FileHandle | DirectoryHandle]>;
  getFileHandle(name: string): Promise<FileHandle>;
  isSameEntry?(other: DirectoryHandle): Promise<boolean>;
}
interface TreeEntry {
  key: string;
  name: string;
  isDirectory: boolean;
  directory?: DirectoryHandle;
  file?: FileHandle;
  parentDirectory?: DirectoryHandle;
}
interface RootState {
  id: string;
  name: string;
  rootKey: string;
  nativePath?: string;
  directory?: DirectoryHandle;
  children: Map<string, TreeEntry[]>;
  expanded: Set<string>;
  loading: Set<string>;
  errors: Set<string>;
  pending: Map<string, Promise<void>>;
  version: number;
}
interface BrowserBinding {
  root: RootState;
  key: string;
}
interface NativeDirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}
const markdownFile = (name: string) => /\.(?:md|markdown|mdown)$/i.test(name);
const basename = (path: string) =>
  path
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || path;
const native = () =>
  !!(window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
const folderIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 6h6l2 2h10v12H3z"/></svg>';
const fileIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 3h8l4 4v14H6z M14 3v5h5"/></svg>';
const arrowIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const refreshIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 7v5h-5 M20 12a8 8 0 1 0-2 6 M20 7l-3-3"/></svg>';

export function createFileTree(options: {
  container: HTMLElement;
  t: (key: string) => string;
  onOpenFile: (file: OpenTreeFile) => void;
  onError?: (message: string) => void;
}) {
  const { container, t, onOpenFile, onError } = options;
  const roots = new Map<string, RootState>();
  const fileBindings = new WeakMap<File, BrowserBinding>();
  const directoryRoots = new WeakMap<DirectoryHandle, RootState>();
  let doc: TreeDocument | null = null;
  let root: RootState | null = null;
  const selectedRoots = new Map<string, RootState>();
  const collapsedRoots = new Set<string>();
  let disposed = false;
  const queuedRefresh = new Set<RootState>();
  let renderHost = container;
  const visibleRoots = () =>
    selectedRoots.size ? [...selectedRoots.values()] : root ? [root] : [];
  const isVisible = (state: RootState) => visibleRoots().includes(state);
  let activeKey = "";
  let generation = 0;
  let loadingDocument = false;
  let picking = false;
  let messageKey: string | null = null;
  let nextRoot = 0;
  container.classList.add("file-tree");

  const picker = () =>
    (
      window as unknown as {
        showDirectoryPicker?: (options?: {
          mode: string;
        }) => Promise<DirectoryHandle>;
      }
    ).showDirectoryPicker;
  const makeRoot = (
    id: string,
    name: string,
    rootKey: string,
    rest: Partial<RootState>,
  ): RootState => ({
    id,
    name,
    rootKey,
    children: new Map(),
    expanded: new Set([rootKey]),
    loading: new Set(),
    errors: new Set(),
    pending: new Map(),
    version: 0,
    ...rest,
  });
  function browserRoot(directory: DirectoryHandle): RootState {
    let state = directoryRoots.get(directory);
    if (!state) {
      const id = `web-folder-${++nextRoot}`;
      state = makeRoot(id, directory.name, id, { directory });
      directoryRoots.set(directory, state);
      roots.set(id, state);
    }
    return state;
  }
  async function invoke<T>(
    command: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  function notifyError(key = "treeError") {
    messageKey = key;
    render();
    onError?.(t(key));
  }

  function render() {
    const previous = container.querySelector<HTMLElement>(".tree-workspaces");
    const scroll = previous?.scrollTop || 0;
    const focused =
      document.activeElement instanceof HTMLElement &&
      container.contains(document.activeElement)
        ? document.activeElement.dataset.focusKey
        : undefined;
    container.replaceChildren();
    renderHost = document.createElement("div");
    renderHost.className = "tree-workspaces";
    container.append(renderHost);
    const states = visibleRoots();
    if (states.length) for (const state of states) renderContent(state);
    else renderContent(null);
    renderHost.scrollTop = scroll;
    const footer = document.createElement("div");
    footer.className = "tree-footer";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tree-open-folder";
    button.innerHTML = folderIcon;
    const label = document.createElement("span");
    label.textContent = t("treeOpenFolder");
    button.append(label);
    button.disabled = picking || (!native() && !picker());
    button.addEventListener("click", () => void openFolder());
    button.dataset.focusKey = "open-folder";
    footer.append(button);
    container.append(footer);
    if (focused)
      [...container.querySelectorAll<HTMLElement>("[data-focus-key]")]
        .find((element) => element.dataset.focusKey === focused)
        ?.focus({ preventScroll: true });
    scheduleWatchSync();
  }
  function renderContent(candidate: RootState | null) {
    if (!doc && !candidate) {
      renderMessage("treeEmpty");
      return;
    }
    if (loadingDocument && !candidate) {
      renderMessage("treeLoading");
      return;
    }
    if (!candidate) {
      renderMessage(
        messageKey ||
          (native()
            ? "treeError"
            : !doc?.file
              ? "treeRestoredNoFile"
              : !picker()
                ? "treeNoDirectoryPicker"
                : "treeNeedsPermission"),
      );
      if (!native() && doc?.file && picker()) {
        const button = document.createElement("button");
        button.className = "tree-choose";
        button.textContent = t("treeChooseFolder");
        button.disabled = picking;
        button.addEventListener("click", () => {
          void chooseFolder();
        });
        renderHost.append(button);
      }
      return;
    }
    const state = candidate;
    const header = document.createElement("div");
    header.className = "tree-root";
    const title = document.createElement("button");
    title.className = "tree-root-title";
    title.type = "button";
    title.dataset.focusKey = `${state.id}:root`;
    title.setAttribute("aria-expanded", String(!collapsedRoots.has(state.id)));
    title.innerHTML = arrowIcon + folderIcon;
    title.addEventListener("click", () => {
      if (collapsedRoots.has(state.id)) {
        collapsedRoots.delete(state.id);
        void refreshRoot(state);
      } else collapsedRoots.add(state.id);
      render();
    });
    const name = document.createElement("span");
    name.textContent = state.name;
    name.title = state.nativePath || state.name;
    title.append(name);
    const refreshButton = document.createElement("button");
    refreshButton.className = "tree-refresh";
    refreshButton.innerHTML = refreshIcon;
    refreshButton.title = t("treeRefresh");
    refreshButton.setAttribute("aria-label", t("treeRefresh"));
    refreshButton.dataset.focusKey = `${state.id}:refresh`;
    refreshButton.addEventListener("click", () => refreshRoot(state));
    header.append(title, refreshButton);
    if (selectedRoots.has(state.id)) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "tree-remove";
      remove.textContent = "×";
      remove.title = t("treeRemoveFolder");
      remove.setAttribute(
        "aria-label",
        `${t("treeRemoveFolder")}: ${state.name}`,
      );
      remove.dataset.focusKey = `${state.id}:remove`;
      remove.addEventListener("click", () => {
        selectedRoots.delete(state.id);
        state.version++;
        state.loading.clear();
        state.pending.clear();
        if (root === state) root = selectedRoots.values().next().value || null;
        render();
        container
          .querySelector<HTMLElement>(".tree-open-folder")
          ?.focus({ preventScroll: true });
      });
      header.append(remove);
    }
    renderHost.append(header);
    if (collapsedRoots.has(state.id)) return;
    if (messageKey) renderMessage(messageKey);
    const list = document.createElement("div");
    list.className = "tree-list";
    list.setAttribute("role", "tree");
    list.setAttribute("aria-label", t("files"));
    function appendChildren(key: string, level: number) {
      if (state.loading.has(key) && !state.children.has(key)) {
        appendNote("treeLoading", level);
        return;
      }
      if (state.errors.has(key)) {
        const retry = document.createElement("button");
        retry.className = "tree-note tree-retry";
        retry.textContent = t("treeError");
        retry.style.setProperty("--tree-depth", String(level));
        retry.title = t("treeRefresh");
        retry.addEventListener("click", () => {
          void loadChildren(state, key, findDirectory(state, key), true);
        });
        list.append(retry);
        if (!state.children.has(key)) return;
      }
      const children = state.children.get(key);
      if (!children) return;
      if (!children.length) {
        appendNote("treeEmptyFolder", level);
        return;
      }
      for (const entry of children) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "tree-row";
        row.dataset.treeKey = entry.key;
        row.dataset.focusKey = `${state.id}:${entry.key}`;
        row.style.setProperty("--tree-depth", String(level));
        row.setAttribute("role", "treeitem");
        row.setAttribute("aria-level", String(level + 1));
        row.title = entry.name;
        const expanded = state.expanded.has(entry.key);
        if (entry.isDirectory) {
          row.setAttribute("aria-expanded", String(expanded));
          row.classList.add("tree-directory");
          if (expanded) row.classList.add("expanded");
        }
        const active =
          !entry.isDirectory &&
          (entry.key === activeKey ||
            (!!state.nativePath &&
              !selectedRoots.size &&
              key === state.rootKey &&
              entry.name === doc?.name));
        row.classList.toggle("active", active);
        row.setAttribute("aria-selected", String(active));
        const arrow = document.createElement("span");
        arrow.className = "tree-arrow";
        if (entry.isDirectory) arrow.innerHTML = arrowIcon;
        const glyph = document.createElement("span");
        glyph.className = "tree-glyph";
        glyph.innerHTML = entry.isDirectory ? folderIcon : fileIcon;
        const label = document.createElement("span");
        label.className = "tree-name";
        label.textContent = entry.name;
        row.append(arrow, glyph, label);
        const toggle = () => {
          if (state.expanded.has(entry.key)) state.expanded.delete(entry.key);
          else {
            state.expanded.add(entry.key);
            void loadChildren(
              state,
              entry.key,
              findDirectory(state, entry.key),
              true,
            );
          }
          render();
        };
        row.addEventListener("click", () => {
          if (entry.isDirectory) toggle();
          else {
            const currentEntry = state.children
              .get(key)
              ?.find((candidate) => candidate.key === entry.key);
            if (currentEntry) void openEntry(state, currentEntry);
          }
        });
        row.addEventListener("keydown", (event) => {
          if (
            entry.isDirectory &&
            ((event.key === "ArrowRight" && !state.expanded.has(entry.key)) ||
              (event.key === "ArrowLeft" && state.expanded.has(entry.key)))
          ) {
            event.preventDefault();
            toggle();
          }
        });
        list.append(row);
        if (entry.isDirectory && expanded) appendChildren(entry.key, level + 1);
      }
    }
    function appendNote(key: string, level: number) {
      const note = document.createElement("p");
      note.className = "tree-note";
      note.style.setProperty("--tree-depth", String(level));
      note.textContent = t(key);
      list.append(note);
    }
    appendChildren(state.rootKey, 0);
    list.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const buttons = Array.from(
        list.querySelectorAll<HTMLButtonElement>(".tree-row"),
      );
      const index = buttons.indexOf(event.target as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      buttons[
        Math.max(
          0,
          Math.min(
            buttons.length - 1,
            index + (event.key === "ArrowDown" ? 1 : -1),
          ),
        )
      ]?.focus();
    });
    renderHost.append(list);
  }
  function renderMessage(key: string) {
    const message = document.createElement("p");
    message.className = "tree-message";
    message.textContent = t(key);
    renderHost.append(message);
  }
  function findDirectory(
    state: RootState,
    key: string,
  ): DirectoryHandle | undefined {
    if (key === state.rootKey) return state.directory;
    for (const entries of state.children.values()) {
      const entry = entries.find((entry) => entry.key === key);
      if (entry?.directory) return entry.directory;
    }
    return undefined;
  }
  async function loadChildren(
    state: RootState,
    key: string,
    directory?: DirectoryHandle,
    force = false,
  ): Promise<void> {
    if (state.children.has(key) && !force) return;
    const pending = state.pending.get(key);
    if (pending) return pending;
    const version = state.version;
    const previous = state.children.get(key);
    const hadError = state.errors.has(key);
    let needsRender = false;
    state.loading.add(key);
    if (!previous && isVisible(state) && !disposed) render();
    const work = (async () => {
      await Promise.resolve();
      try {
        let entries: TreeEntry[];
        if (state.nativePath) {
          const result = await invoke<NativeDirectoryEntry[]>(
            "list_markdown_directory",
            { root: state.nativePath, path: key },
          );
          entries = result
            .filter((entry) => entry.isDirectory || markdownFile(entry.name))
            .map((entry) => ({
              key: entry.path,
              name: entry.name,
              isDirectory: entry.isDirectory,
            }));
        } else {
          if (!directory) throw new Error("Missing directory handle");
          entries = [];
          for await (const [name, handle] of directory.entries()) {
            if (handle.kind === "directory")
              entries.push({
                key: `${key}/${name}`,
                name,
                isDirectory: true,
                directory: handle,
              });
            else if (markdownFile(name))
              entries.push({
                key: `${key}/${name}`,
                name,
                isDirectory: false,
                file: handle,
                parentDirectory: directory,
              });
          }
        }
        if (version !== state.version) return;
        entries.sort(
          (a, b) =>
            Number(b.isDirectory) - Number(a.isDirectory) ||
            a.name.localeCompare(b.name, undefined, {
              numeric: true,
              sensitivity: "base",
            }),
        );
        needsRender =
          hadError ||
          !previous ||
          previous.length !== entries.length ||
          entries.some((entry, index) => {
            const old = previous[index];
            return (
              old.key !== entry.key ||
              old.name !== entry.name ||
              old.isDirectory !== entry.isDirectory
            );
          });
        state.errors.delete(key);
        state.children.set(key, entries);
        if (!collapsedRoots.has(state.id))
          for (const entry of entries)
            if (entry.isDirectory && state.expanded.has(entry.key))
              void loadChildren(state, entry.key, entry.directory, force);
      } catch {
        if (version === state.version) {
          state.errors.add(key);
          needsRender = !hadError;
        }
      } finally {
        if (version === state.version) {
          state.loading.delete(key);
          state.pending.delete(key);
          if (needsRender && isVisible(state) && !disposed) render();
          if (!state.pending.size && queuedRefresh.delete(state))
            queueMicrotask(() => void refreshRoot(state));
        }
      }
    })();
    state.pending.set(key, work);
    return work;
  }
  async function openEntry(state: RootState, entry: TreeEntry) {
    const token = generation;
    try {
      let result: OpenTreeFile;
      if (state.nativePath) {
        const file = await invoke<{
          path: string;
          name: string;
          text: string;
          error?: string;
        }>("read_markdown_tree_file", {
          root: state.nativePath,
          path: entry.key,
        });
        if (file.error) throw new Error(file.error);
        result = {
          path: file.path,
          name: file.name,
          text: file.text,
          root: state.nativePath,
        };
      } else {
        if (!entry.file || !entry.parentDirectory)
          throw new Error("Missing file handle");
        const file = await entry.file.getFile();
        const text = await file.text();
        const containingRoot = selectedRoots.has(state.id)
          ? state
          : browserRoot(entry.parentDirectory);
        fileBindings.set(file, {
          root: containingRoot,
          key: selectedRoots.has(state.id)
            ? entry.key
            : `${containingRoot.rootKey}/${file.name}`,
        });
        result = {
          path: null,
          name: file.name,
          text,
          file,
          root: containingRoot.id,
        };
      }
      if (token !== generation || !isVisible(state)) return;
      onOpenFile(result);
    } catch {
      if (token === generation) notifyError();
    }
  }
  async function openFolder() {
    if (picking) return;
    picking = true;
    const token = generation;
    render();
    try {
      let state: RootState;
      if (native()) {
        const path = await invoke<string | null>(
          "choose_markdown_directory",
          {},
        );
        if (!path || token !== generation) return;
        const id = `native:${path}`;
        state =
          roots.get(id) ||
          makeRoot(id, basename(path), path, { nativePath: path });
        roots.set(id, state);
      } else {
        const select = picker();
        if (!select) return;
        const directory = await select.call(window, { mode: "read" });
        if (token !== generation) return;
        let existing: RootState | undefined;
        for (const candidate of selectedRoots.values()) {
          if (
            candidate.directory &&
            directory.isSameEntry &&
            (await directory.isSameEntry(candidate.directory))
          ) {
            existing = candidate;
            break;
          }
        }
        state = existing || browserRoot(directory);
      }
      selectedRoots.set(state.id, state);
      collapsedRoots.delete(state.id);
      root = state;
      activeKey = doc?.path || "";
      messageKey = null;
      loadingDocument = false;
      await refreshRoot(state);
    } catch (error) {
      if (
        token === generation &&
        (error as { name?: string })?.name !== "AbortError"
      )
        notifyError();
    } finally {
      picking = false;
      render();
    }
  }
  async function chooseFolder() {
    const source = doc;
    const token = generation;
    const select = picker();
    if (!source?.file || !select || picking) return;
    picking = true;
    messageKey = null;
    render();
    try {
      const handle = await select.call(window, { mode: "read" });
      const candidate = await (
        await handle.getFileHandle(source.name)
      ).getFile();
      if (
        candidate.name !== source.file.name ||
        candidate.size !== source.file.size ||
        (await candidate.text()) !== (await source.file.text())
      ) {
        if (token === generation) notifyError("treeWrongFolder");
        return;
      }
      if (token !== generation) return;
      let state: RootState | undefined;
      for (const existing of roots.values())
        if (
          existing.directory &&
          handle.isSameEntry &&
          (await handle.isSameEntry(existing.directory))
        ) {
          state = existing;
          break;
        }
      state ||= browserRoot(handle);
      if (token !== generation) return;
      const binding = { root: state, key: `${state.rootKey}/${source.name}` };
      fileBindings.set(source.file, binding);
      root = state;
      activeKey = binding.key;
      messageKey = null;
      await loadChildren(state, state.rootKey, state.directory);
      render();
    } catch (error) {
      if (
        token === generation &&
        (error as { name?: string })?.name !== "AbortError"
      )
        notifyError("treeWrongFolder");
    } finally {
      picking = false;
      render();
    }
  }
  function setDocument(next: TreeDocument | null) {
    doc = next;
    const token = ++generation;
    root = null;
    activeKey = "";
    messageKey = null;
    loadingDocument = false;
    if (selectedRoots.size) {
      const binding = next?.file && fileBindings.get(next.file);
      root = binding?.root || selectedRoots.values().next().value || null;
      activeKey = next?.path || binding?.key || "";
      render();
      for (const state of visibleRoots())
        if (!collapsedRoots.has(state.id))
          void loadChildren(state, state.rootKey, state.directory);
      return;
    }
    if (!next) {
      render();
      return;
    }
    if (native() && next.path) {
      const documentPath = next.path;
      loadingDocument = true;
      render();
      void (async () => {
        try {
          const path = await invoke<string>("authorize_directory_for_file", {
            path: documentPath,
          });
          if (token !== generation) return;
          const id = `native:${path}`;
          let state = roots.get(id);
          if (!state) {
            state = makeRoot(id, basename(path), path, { nativePath: path });
            roots.set(id, state);
          }
          root = state;
          activeKey = documentPath;
          loadingDocument = false;
          render();
          await loadChildren(state, state.rootKey);
        } catch {
          if (token === generation) {
            loadingDocument = false;
            notifyError();
          }
        }
      })();
      return;
    }
    const binding = next.file && fileBindings.get(next.file);
    if (binding) {
      root = binding.root;
      activeKey = binding.key;
      render();
      void loadChildren(root, root.rootKey, root.directory);
      return;
    }
    if (native()) messageKey = "treeEmpty";
    render();
  }
  function visibleDirectories(state: RootState): string[] {
    if (collapsedRoots.has(state.id)) return [];
    const paths = [state.rootKey];
    const visit = (key: string) => {
      for (const entry of state.children.get(key) || [])
        if (entry.isDirectory && state.expanded.has(entry.key)) {
          paths.push(entry.key);
          visit(entry.key);
        }
    };
    visit(state.rootKey);
    return paths;
  }
  async function refreshRoot(state: RootState) {
    if (!isVisible(state) || collapsedRoots.has(state.id) || disposed) return;
    // Refresh directory listings only. Never read or replace open document text.
    if (state.pending.size) {
      queuedRefresh.add(state);
      return;
    }
    await loadChildren(state, state.rootKey, state.directory, true);
  }
  function refresh() {
    if (!visibleRoots().length) {
      setDocument(doc);
      return;
    }
    for (const state of visibleRoots()) void refreshRoot(state);
  }
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  const watched = new Map<string, string>();
  let watchQueue = Promise.resolve();
  function scheduleWatchSync() {
    if (!native() || disposed) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      watchQueue = watchQueue.then(async () => {
        if (disposed) return;
        const desired = new Map(
          visibleRoots()
            .filter((state) => state.nativePath)
            .map((state) => [state.nativePath!, visibleDirectories(state)]),
        );
        for (const path of watched.keys())
          if (!desired.has(path)) desired.set(path, []);
        for (const [path, paths] of desired) {
          const signature = JSON.stringify(paths);
          if (watched.get(path) === signature) continue;
          try {
            await invoke("watch_markdown_directories", { root: path, paths });
            watched.set(path, signature);
          } catch {
            /* Focus/periodic refresh remains available if native watching fails. */
          }
        }
      });
    }, 80);
  }
  let unlisten: (() => void) | undefined;
  if (native())
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<{ root: string }>("markdown-directory-changed", (event) => {
          const state = visibleRoots().find(
            (state) => state.nativePath === event.payload.root,
          );
          if (state) void refreshRoot(state);
        }),
      )
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {});
  const focusRefresh = () => {
    if (!picking && !loadingDocument && document.visibilityState !== "hidden")
      refresh();
  };
  window.addEventListener("focus", focusRefresh);
  document.addEventListener("visibilitychange", focusRefresh);
  const poll = setInterval(
    () => {
      if (!picking && !loadingDocument && document.visibilityState !== "hidden")
        refresh();
    },
    native() ? 30000 : 5000,
  );
  function dispose() {
    disposed = true;
    clearTimeout(syncTimer);
    clearInterval(poll);
    unlisten?.();
    window.removeEventListener("focus", focusRefresh);
    document.removeEventListener("visibilitychange", focusRefresh);
    for (const state of roots.values()) state.version++;
    for (const path of watched.keys())
      void invoke("watch_markdown_directories", {
        root: path,
        paths: [],
      }).catch(() => {});
  }
  render();
  return { setDocument, refresh, refreshLabels: render, dispose };
}
