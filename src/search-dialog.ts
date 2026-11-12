import {
  Decoration,
  ViewPlugin,
  type EditorView,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  searchPanelOpen,
  setSearchQuery,
} from "@codemirror/search";
import "./search-dialog.css";

interface SearchDialogOptions {
  getView: () => EditorView;
  t: (key: string) => string;
  onOpen?: () => void;
}

/** A nonmodal search window. The editor stays interactive behind it. */
export function createSearchDialog({
  getView,
  t,
  onOpen,
}: SearchDialogOptions) {
  const dialog = document.createElement("dialog");
  dialog.id = "search-dialog";
  dialog.className = "search-window";
  dialog.setAttribute("aria-labelledby", "search-window-title");
  dialog.innerHTML = `<div class="search-window-header">
    <h2 id="search-window-title" data-search-i18n="searchReplace"></h2>
    <button type="button" class="search-window-close" data-search-action="close" data-search-label="close">×</button>
  </div>
  <div class="search-window-tabs" role="tablist">
    <button type="button" role="tab" data-search-action="find-mode" data-search-i18n="find"></button>
    <button type="button" role="tab" data-search-action="replace-mode" data-search-i18n="replace"></button>
  </div>
  <div class="search-window-body">
    <label class="search-field"><span data-search-i18n="find"></span><input id="search-find" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" data-search-label="find"></label>
    <label class="search-field" id="search-replace-row"><span data-search-i18n="replace"></span><input id="search-replace" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" data-search-label="replace"></label>
    <div class="search-options">
      <label><input type="checkbox" id="search-case"><span data-search-i18n="matchCase"></span></label>
      <label><input type="checkbox" id="search-regex"><span data-search-i18n="regex"></span></label>
      <label><input type="checkbox" id="search-word"><span data-search-i18n="wholeWord"></span></label>
    </div>
    <p id="search-status" class="search-window-status" role="status" aria-live="polite"></p>
    <div class="search-window-actions">
      <button type="button" data-search-action="previous" data-search-i18n="previous"></button>
      <button type="button" data-search-action="next" data-search-i18n="next"></button>
      <button type="button" data-search-action="replace-one" data-search-i18n="replaceOne"></button>
      <button type="button" class="search-primary" data-search-action="replace-all" data-search-i18n="replaceAll"></button>
    </div>
  </div>`;
  document.body.append(dialog);
  const findInput = dialog.querySelector<HTMLInputElement>("#search-find")!;
  const replaceInput =
    dialog.querySelector<HTMLInputElement>("#search-replace")!;
  const caseInput = dialog.querySelector<HTMLInputElement>("#search-case")!;
  const regexInput = dialog.querySelector<HTMLInputElement>("#search-regex")!;
  const wordInput = dialog.querySelector<HTMLInputElement>("#search-word")!;
  const status = dialog.querySelector<HTMLElement>("#search-status")!;
  let replaceMode = false;
  let updateQueued = false;
  let countTimer: ReturnType<typeof setTimeout> | undefined;

  function query() {
    return new SearchQuery({
      search: findInput.value,
      replace: replaceInput.value,
      caseSensitive: caseInput.checked,
      regexp: regexInput.checked,
      wholeWord: wordInput.checked,
      literal: !regexInput.checked,
    });
  }

  const visibility = StateEffect.define<boolean>();
  const visibleField = StateField.define<boolean>({
    create: () => dialog.open,
    update: (value, transaction) => {
      for (const effect of transaction.effects)
        if (effect.is(visibility)) value = effect.value;
      return value;
    },
  });
  const resultHighlights = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          update.state.field(visibleField, false) !==
            update.startState.field(visibleField, false) ||
          !getSearchQuery(update.state).eq(getSearchQuery(update.startState))
        )
          this.decorations = this.build(update.view);
      }
      build(view: EditorView) {
        const current = getSearchQuery(view.state);
        if (!view.state.field(visibleField) || !current.valid)
          return Decoration.none;
        const marks: ReturnType<ReturnType<typeof Decoration.mark>["range"]>[] =
          [];
        const selected = view.state.selection.main;
        for (const range of view.visibleRanges) {
          const cursor = current.getCursor(view.state, range.from, range.to);
          for (
            let next = cursor.next();
            !next.done && marks.length < 2000;
            next = cursor.next()
          ) {
            const { from, to } = next.value;
            if (from !== to)
              marks.push(
                Decoration.mark({
                  class:
                    from === selected.from && to === selected.to
                      ? "cm-searchMatch cm-searchMatch-selected"
                      : "cm-searchMatch",
                }).range(from, to),
              );
          }
        }
        return Decoration.set(marks, true);
      }
    },
    { decorations: (value) => value.decorations },
  );

  function syncQuery() {
    const view = getView();
    if (searchPanelOpen(view.state)) closeSearchPanel(view);
    if (view.state.field(visibleField, false) === undefined)
      view.dispatch({
        effects: StateEffect.appendConfig.of([visibleField, resultHighlights]),
      });
    const next = query();
    const effects = [];
    if (!getSearchQuery(view.state).eq(next))
      effects.push(setSearchQuery.of(next));
    if (view.state.field(visibleField) !== dialog.open)
      effects.push(visibility.of(dialog.open));
    if (effects.length) view.dispatch({ effects });
    return next;
  }

  function updateCount() {
    if (!dialog.open) return;
    const view = getView();
    const current = query();
    const invalid = !!findInput.value && !current.valid;
    findInput.setAttribute("aria-invalid", String(invalid));
    status.dataset.error = String(invalid);
    const commands = dialog.querySelectorAll<HTMLButtonElement>(
      '[data-search-action="previous"],[data-search-action="next"],[data-search-action="replace-one"],[data-search-action="replace-all"]',
    );
    if (!current.valid) {
      status.textContent = invalid ? t("invalidRegex") : "";
      commands.forEach((button) => (button.disabled = true));
      return;
    }
    try {
      const cursor = current.getCursor(view.state);
      const selected = view.state.selection.main;
      let count = 0;
      let selectedIndex = 0;
      let capped = false;
      for (let next = cursor.next(); !next.done; next = cursor.next()) {
        count++;
        if (next.value.from === selected.from && next.value.to === selected.to)
          selectedIndex = count;
        if (count >= 10000) {
          capped = !cursor.next().done;
          break;
        }
      }
      status.textContent = count
        ? `${selectedIndex ? `${selectedIndex} / ` : ""}${count}${capped ? "+" : ""} ${t("matches")}`
        : t("noMatches");
      commands.forEach((button) => (button.disabled = !count));
    } catch {
      status.dataset.error = "true";
      status.textContent = t("invalidRegex");
      commands.forEach((button) => (button.disabled = true));
    }
  }

  function scheduleCount() {
    clearTimeout(countTimer);
    countTimer = setTimeout(updateCount, 70);
  }

  function setMode(replace: boolean) {
    replaceMode = replace;
    dialog.querySelector<HTMLElement>("#search-replace-row")!.hidden = !replace;
    for (const action of ["replace-one", "replace-all"])
      dialog.querySelector<HTMLElement>(
        `[data-search-action="${action}"]`,
      )!.hidden = !replace;
    dialog
      .querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .forEach((tab) => {
        const active =
          tab.dataset.searchAction === (replace ? "replace-mode" : "find-mode");
        tab.classList.toggle("selected", active);
        tab.setAttribute("aria-selected", String(active));
      });
  }

  function refresh() {
    dialog
      .querySelectorAll<HTMLElement>("[data-search-i18n]")
      .forEach((element) => {
        element.textContent = t(element.dataset.searchI18n!);
      });
    dialog
      .querySelectorAll<HTMLElement>("[data-search-label]")
      .forEach((element) => {
        const label = t(element.dataset.searchLabel!);
        element.title = label;
        element.setAttribute("aria-label", label);
      });
    if (dialog.open) {
      syncQuery();
      updateCount();
    }
  }

  function close() {
    clearTimeout(countTimer);
    if (!dialog.open) return;
    dialog.close();
    const view = getView();
    if (view.state.field(visibleField, false) !== undefined)
      view.dispatch({ effects: visibility.of(false) });
    view.focus();
  }

  function open(replace = false) {
    onOpen?.();
    const view = getView();
    if (searchPanelOpen(view.state)) closeSearchPanel(view);
    if (!findInput.value) {
      const selection = view.state.selection.main;
      const selected = view.state.sliceDoc(selection.from, selection.to);
      if (selected && selected.length <= 500 && !/[\r\n]/.test(selected))
        findInput.value = selected;
    }
    setMode(replace);
    refresh();
    if (!dialog.open) dialog.show();
    syncQuery();
    updateCount();
    findInput.focus();
    findInput.select();
  }

  function run(action: string) {
    const view = getView();
    const current = syncQuery();
    if (!current.valid) {
      updateCount();
      return;
    }
    try {
      if (action === "previous") findPrevious(view);
      else if (action === "next") findNext(view);
      else if (action === "replace-all") replaceAll(view);
      else if (action === "replace-one") {
        const selected = view.state.selection.main;
        const match = current
          .getCursor(view.state, selected.from, selected.to)
          .next();
        if (
          match.done ||
          match.value.from !== selected.from ||
          match.value.to !== selected.to
        )
          findNext(view);
        replaceNext(view);
      }
      updateCount();
    } catch {
      status.dataset.error = "true";
      status.textContent = t("invalidRegex");
    }
  }

  dialog.addEventListener("input", () => {
    syncQuery();
    scheduleCount();
  });
  dialog.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-search-action]",
    );
    if (!button || button.disabled) return;
    const action = button.dataset.searchAction!;
    if (action === "close") close();
    else if (action === "find-mode" || action === "replace-mode") {
      setMode(action === "replace-mode");
      (replaceMode ? replaceInput : findInput).focus();
    } else run(action);
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      run(
        event.target === replaceInput
          ? "replace-one"
          : event.shiftKey
            ? "previous"
            : "next",
      );
    }
  });

  // A title-bar drag makes the window independent of the editor layout.
  const header = dialog.querySelector<HTMLElement>(".search-window-header")!;
  let drag: {
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null = null;
  header.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button"))
      return;
    const bounds = dialog.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: bounds.left,
      top: bounds.top,
    };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const left = Math.max(
      0,
      Math.min(
        innerWidth - dialog.offsetWidth,
        drag.left + event.clientX - drag.x,
      ),
    );
    const top = Math.max(
      0,
      Math.min(innerHeight - 48, drag.top + event.clientY - drag.y),
    );
    dialog.style.left = `${left}px`;
    dialog.style.right = "auto";
    dialog.style.top = `${top}px`;
  });
  const endDrag = () => {
    drag = null;
  };
  header.addEventListener("pointerup", endDrag);
  header.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", () => {
    if (!dialog.open || !dialog.style.left) return;
    const bounds = dialog.getBoundingClientRect();
    dialog.style.left = `${Math.max(0, Math.min(innerWidth - dialog.offsetWidth, bounds.left))}px`;
    dialog.style.top = `${Math.max(0, Math.min(innerHeight - 48, bounds.top))}px`;
  });

  refresh();
  return {
    open,
    close,
    refresh,
    documentChanged() {
      if (!dialog.open || updateQueued) return;
      updateQueued = true;
      queueMicrotask(() => {
        updateQueued = false;
        if (dialog.open) {
          syncQuery();
          scheduleCount();
        }
      });
    },
  };
}
