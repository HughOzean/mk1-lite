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
    const oldList = container.querySelector<HTMLElement>(".tree-list");
    const scroll = oldList?.scrollTop || 0;
    const focused = container.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.treeKey
      : undefined;
    const rows = new Map<string, HTMLButtonElement>();
    container.replaceChildren();
    if (!doc) {
      renderMessage("treeEmpty");
      return;
    }
    if (loadingDocument) {
      renderMessage("treeLoading");
      return;
    }
    if (!root) {
      renderMessage(
        messageKey ||
          (native()
            ? "treeError"
            : !doc.file
              ? "treeRestoredNoFile"
              : !picker()
                ? "treeNoDirectoryPicker"
                : "treeNeedsPermission"),
      );
      if (!native() && doc.file && picker()) {
        const button = document.createElement("button");
        button.className = "tree-choose";
        button.textContent = t("treeChooseFolder");
        button.disabled = picking;
        button.addEventListener("click", () => {
          void chooseFolder();
        });
        container.append(button);
      }
      return;
    }
    const state = root;
    const header = document.createElement("div");
    header.className = "tree-root";
    const title = document.createElement("span");
    title.className = "tree-root-title";
    title.innerHTML = folderIcon;
    const name = document.createElement("span");
    name.textContent = state.name;
    name.title = state.nativePath || state.name;
    title.append(name);
    const refreshButton = document.createElement("button");
    refreshButton.className = "tree-refresh";
    refreshButton.innerHTML = refreshIcon;
    refreshButton.title = t("treeRefresh");
    refreshButton.setAttribute("aria-label", t("treeRefresh"));
    refreshButton.addEventListener("click", refresh);
    header.append(title, refreshButton);
    container.append(header);
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
          void loadChildren(state, key, findDirectory(state, key));
        });
        list.append(retry);
        return;
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
        rows.set(entry.key, row);
        const toggle = () => {
          if (state.expanded.has(entry.key)) state.expanded.delete(entry.key);
          else {
            state.expanded.add(entry.key);
            void loadChildren(state, entry.key, entry.directory);
          }
          render();
        };
        row.addEventListener("click", () => {
          if (entry.isDirectory) toggle();
          else void openEntry(state, entry);
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
    container.append(list);
    list.scrollTop = scroll;
    if (focused) rows.get(focused)?.focus({ preventScroll: true });
  }
  function renderMessage(key: string) {
    const message = document.createElement("p");
    message.className = "tree-message";
    message.textContent = t(key);
    container.append(message);
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
  ): Promise<void> {
    if (state.children.has(key)) return;
    const pending = state.pending.get(key);
    if (pending) return pending;
    const version = state.version;
    state.loading.add(key);
    state.errors.delete(key);
    if (root === state) render();
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
        state.children.set(key, entries);
        for (const entry of entries)
          if (entry.isDirectory && state.expanded.has(entry.key))
            void loadChildren(state, entry.key, entry.directory);
      } catch {
        if (version === state.version) state.errors.add(key);
      } finally {
        if (version === state.version) {
          state.loading.delete(key);
          state.pending.delete(key);
          if (root === state) render();
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
        const containingRoot = browserRoot(entry.parentDirectory);
        fileBindings.set(file, {
          root: containingRoot,
          key: `${containingRoot.rootKey}/${file.name}`,
        });
        result = {
          path: null,
          name: file.name,
          text,
          file,
          root: containingRoot.id,
        };
      }
      if (token !== generation || root !== state) return;
      onOpenFile(result);
    } catch {
      if (token === generation) notifyError();
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
  function refresh() {
    if (!root) {
      setDocument(doc);
      return;
    }
    const state = root;
    state.version++;
    state.children.clear();
    state.loading.clear();
    state.errors.clear();
    state.pending.clear();
    void loadChildren(state, state.rootKey, state.directory);
    render();
  }
  render();
  return { setDocument, refresh, refreshLabels: render };
}
