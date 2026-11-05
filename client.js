/**
 * Client half of the todo-progress HUD.
 *
 * Two seats, one shared snapshot:
 *  - `conversation.input.dock`  → an invisible bridge that reads the session `todos`
 *    and `title` projections through the slot's `useProjection` hook and publishes them
 *    module-locally.
 *  - `shell.overlay`            → the visible HUD, rendered in the frame-wide floating
 *    layer above every column, so it stays fixed at the top while the chat scrolls.
 *
 * Features: top progress edge + floating pill (bar, count, milestone lights),
 * click-to-collapse into a ring, session title, red failed nodes (⚠/✗/❌ prefix),
 * and reduced-motion support. Styles use only `--dsw-alias-*` theme tokens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-todo-progress-hud',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'todoProgress';
    const EMPTY = Object.freeze([]);
    const FALLBACK = { label: '任务进度', done: '全部完成', failed: '失败', collapse: '折叠', expand: '展开' };
    const STORAGE_KEY = 'todo-progress-hud:collapsed';
    const MOTION_KEY = 'todo-progress-hud:motion';
    /** A todo node marked with these leading glyphs is rendered as failed. */
    const FAILED_MARKER = /^[\s]*[⚠✗❌]/u;

    //#region shared snapshot
    /** Immutable snapshot shared by both seats. */
    let snapshot = { todos: EMPTY, title: '', sessionId: '' };
    const listeners = new Set();
    /**
     * The bridge currently owning the snapshot. A conversation switch can mount the
     * next bridge before the previous one unmounts; without this guard the leaving
     * bridge would publish an empty list and blank the HUD in the new conversation.
     */
    let activeBridge = null;
    /**
     * Host semantics: the `todos` projection resets to null on every `turn/start`.
     * Remember the last list each session actually wrote so the HUD survives the
     * gap between a new turn starting and that turn's first `todo_write`.
     */
    const lastKnownTodos = new Map();

    function rememberTodos(sessionId, todos) {
      if (Array.isArray(todos)) {
        if (todos.length === 0) lastKnownTodos.delete(sessionId);
        else lastKnownTodos.set(sessionId, todos);
        return todos;
      }
      const cached = lastKnownTodos.get(sessionId);
      return Array.isArray(cached) ? cached : null;
    }

    function publish(todos, title, sessionId) {
      const nextTodos = Array.isArray(todos) ? todos : EMPTY;
      const nextTitle = typeof title === 'string' ? title : '';
      const nextSessionId = typeof sessionId === 'string' ? sessionId : '';
      if (
        snapshot.todos === nextTodos &&
        snapshot.title === nextTitle &&
        snapshot.sessionId === nextSessionId
      ) {
        return;
      }
      snapshot = { todos: nextTodos, title: nextTitle, sessionId: nextSessionId };
      for (const listener of listeners) listener();
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    /** React hook: current snapshot, re-rendering on every publish. */
    function useSnapshot() {
      const [value, setValue] = React.useState(snapshot);
      React.useEffect(() => subscribe(() => setValue(snapshot)), []);
      return value;
    }

    function readCollapsed() {
      try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
      } catch {
        return false;
      }
    }

    function writeCollapsed(value) {
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
      } catch {
        /* storage unavailable: keep the in-memory preference only */
      }
    }
    //#endregion

    //#region bridge seat
    /**
     * Invisible bridge: `useProjection` is only available on a session-scoped slot,
     * so this seat forwards the todo list and the session title into the snapshot.
     */
    function TodoBridge(props) {
      const useProjection = props.useProjection;
      const sessionId = props.sessionId;
      const todos = typeof useProjection === 'function' ? useProjection('todos') : null;
      const title = typeof useProjection === 'function' ? useProjection('title') : null;
      const token = React.useRef(null);
      if (token.current === null) token.current = {};

      // Claim ownership on mount and release only if still the owner on unmount.
      React.useEffect(() => {
        activeBridge = token.current;
        return () => {
          if (activeBridge === token.current) {
            activeBridge = null;
            publish(null, null, null);
          }
        };
      }, []);

      // Publish projection updates only while this bridge owns the snapshot.
      React.useEffect(() => {
        if (activeBridge === token.current) publish(rememberTodos(sessionId, todos), title, sessionId);
      }, [todos, title, sessionId]);

      return null;
    }
    //#endregion

    //#region styles
    const CSS = `
.tp-hud {
  position: fixed;
  right: 16px;
  bottom: calc(var(--dsh-composer-height, 152px) + 16px);
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: none;
  font-family: var(--dsw-font-family, inherit);
}
/* ---- liquid glass surface shared by the card and the collapsed pill ---- */
.tp-card,
.tp-pill {
  pointer-events: auto;
  position: relative;
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: min(640px, calc(100vw - 40px));
  padding: .55em .95em;
  border-radius: 999px;
  font-size: calc(var(--dsh-content-font-size, 14px) - 2px);
  line-height: 1;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  user-select: none;
  border: 1px solid transparent;
  background: var(--dsw-alias-bg-overlay);
  background:
    radial-gradient(140% 120% at 14% 0%, rgba(255, 255, 255, .5) 0%, rgba(255, 255, 255, 0) 46%),
    linear-gradient(180deg,
      color-mix(in srgb, var(--dsw-alias-bg-overlay) 50%, transparent),
      color-mix(in srgb, var(--dsw-alias-bg-overlay) 32%, transparent));
  backdrop-filter: blur(26px) saturate(1.9) brightness(1.05);
  -webkit-backdrop-filter: blur(26px) saturate(1.9) brightness(1.05);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .55),
    0 4px 14px rgba(0, 0, 0, .08);
  transition: transform .18s ease, box-shadow .2s ease, border-color .2s ease;
}
.tp-card::before,
.tp-pill::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(90% 70% at 18% -20%, rgba(255, 255, 255, .5) 0%, rgba(255, 255, 255, 0) 62%),
    linear-gradient(180deg, rgba(255, 255, 255, .14), rgba(255, 255, 255, 0) 55%);
  pointer-events: none;
}
/* The rim: a 1px gradient ring, bright on the lit edge and dim at the bottom,
   so the capsule reads as a refracting pane instead of a filled plate. */
.tp-card::after,
.tp-pill::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(150deg,
    rgba(255, 255, 255, .85) 0%,
    rgba(255, 255, 255, .18) 30%,
    rgba(255, 255, 255, .06) 62%,
    rgba(255, 255, 255, .5) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}
.tp-card:hover,
.tp-pill:hover {
  transform: translateY(1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .55),
    0 6px 18px rgba(0, 0, 0, .1);
}
.tp-card:active,
.tp-pill:active { transform: translateY(2px); }
.tp-card[data-complete="true"],
.tp-pill[data-complete="true"] { border-color: var(--dsw-alias-state-success-primary); }
.tp-card[data-failed="true"],
.tp-pill[data-failed="true"] { border-color: var(--dsw-alias-state-error-primary); }
.tp-card { gap: .7em; animation: tp-card-in .22s ease-out; }
.tp-card[data-leaving="true"] { animation: tp-card-out .14s ease-in forwards; }

/* ---- expanded card contents ---- */
.tp-title {
  font-weight: 600;
  white-space: nowrap;
  max-width: 13em;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-primary);
}
.tp-sep {
  width: 1px;
  height: 1em;
  background: color-mix(in srgb, var(--dsw-alias-border-l1) 80%, transparent);
}
.tp-track {
  position: relative;
  flex: 0 1 10em;
  min-width: 4.5em;
  height: .36em;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 20%, transparent);
  overflow: hidden;
}
.tp-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--dsw-alias-brand-primary), var(--dsw-alias-state-success-primary));
  transition: width .6s cubic-bezier(.3, .9, .35, 1);
}
.tp-count {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  transition: color .3s ease;
}
.tp-count[data-complete="true"] { color: var(--dsw-alias-state-success-primary); font-weight: 600; }
.tp-nodes { display: inline-flex; align-items: center; gap: .4em; }
.tp-node {
  width: .6em;
  height: .6em;
  border-radius: 50%;
  border: 1.2px solid var(--dsw-alias-state-idle-primary);
  background: transparent;
  transition: background .35s ease, border-color .35s ease, box-shadow .35s ease;
}
.tp-node[data-status="completed"] {
  background: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary);
}
.tp-node[data-status="in_progress"] {
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 .22em color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent);
}
.tp-node[data-status="failed"] {
  background: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
}
.tp-current {
  max-width: 12em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
}
.tp-chevron { color: var(--dsw-alias-label-secondary); opacity: .5; font-size: .85em; }
.tp-card:hover .tp-chevron { opacity: .8; }

/* ---- collapsed pill contents ---- */
.tp-pill {
  gap: .6em;
  padding: .5em .8em;
  font-size: calc(var(--dsh-content-font-size, 14px) - 3px);
  animation: tp-pill-in .24s cubic-bezier(.34, 1.3, .64, 1);
}
.tp-pill[data-leaving="true"] { animation: tp-pill-out .14s ease-in forwards; }
.tp-pill-track {
  position: relative;
  width: 3.4em;
  height: .32em;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 20%, transparent);
  overflow: hidden;
}
.tp-pill-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--dsw-alias-brand-primary), var(--dsw-alias-state-success-primary));
  transition: width .6s cubic-bezier(.3, .9, .35, 1);
}
.tp-pill-nodes { display: inline-flex; align-items: center; gap: .28em; }
.tp-pill-node {
  width: .44em;
  height: .44em;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-state-idle-primary);
  background: transparent;
  transition: background .2s ease, border-color .2s ease;
}
.tp-pill-node[data-status="completed"] {
  background: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary);
}
.tp-pill-node[data-status="in_progress"] {
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
}
.tp-pill-node[data-status="failed"] {
  background: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
}
.tp-pill-count {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}
.tp-pill[data-complete="true"] .tp-pill-count { color: var(--dsw-alias-state-success-primary); }

@keyframes tp-card-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: none; }
}
@keyframes tp-card-out {
  from { opacity: 1; transform: none; }
  to   { opacity: 0; transform: scale(.94); }
}
@keyframes tp-pill-in {
  from { opacity: 0; transform: translateY(-4px) scale(.94); }
  to   { opacity: 1; transform: none; }
}
@keyframes tp-pill-out {
  from { opacity: 1; transform: none; }
  to   { opacity: 0; transform: scale(.9); }
}
@media (prefers-reduced-motion: reduce) {
  :root:not([data-tp-motion="full"]) .tp-card,
  :root:not([data-tp-motion="full"]) .tp-pill { animation: none !important; }
  :root:not([data-tp-motion="full"]) .tp-fill,
  :root:not([data-tp-motion="full"]) .tp-pill-fill { transition: width .2s ease; }
}
`;
    //#endregion

    //#region running pill
    /**
     * Restyle the built-in "deep diving" row into a compact floating pill: the class
     * names are content-hashed by the owning plugin, so every selector anchors on
     * the stable `data-chat-running` attribute plus a class-name substring.
     */
    const RUNNING_CSS = `
[data-chat-running] {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  margin: 4px 0 10px;
  padding: .5em .9em;
  border-radius: 999px;
  font-size: calc(var(--dsh-content-font-size, 14px) - 3px);
  line-height: 1;
  color: var(--dsw-alias-label-secondary);
  border: 1px solid transparent;
  background: var(--dsw-alias-bg-overlay);
  background:
    radial-gradient(140% 120% at 14% 0%, rgba(255, 255, 255, .5) 0%, rgba(255, 255, 255, 0) 46%),
    linear-gradient(180deg,
      color-mix(in srgb, var(--dsw-alias-bg-overlay) 50%, transparent),
      color-mix(in srgb, var(--dsw-alias-bg-overlay) 32%, transparent));
  backdrop-filter: blur(26px) saturate(1.9) brightness(1.05);
  -webkit-backdrop-filter: blur(26px) saturate(1.9) brightness(1.05);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .55),
    0 4px 14px rgba(0, 0, 0, .08);
  animation: tp-run-in .22s ease-out;
}
[data-chat-running]::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(150deg,
    rgba(255, 255, 255, .85) 0%,
    rgba(255, 255, 255, .18) 30%,
    rgba(255, 255, 255, .06) 62%,
    rgba(255, 255, 255, .5) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}
[data-chat-running] [class*="runningDivider"] { display: none !important; }
/* TextShimmer paints a cloned label inside an absolutely positioned decoration
   layer; over the glass pill it shows up as a ghost double, so drop it. */
[data-chat-running] [class*="decoration"] { display: none !important; }
[data-chat-running] [class*="runningIcon"] {
  position: relative;
  display: inline-flex;
  flex: none;
  width: 1.3em;
  height: 1.3em;
  color: var(--dsw-alias-brand-primary);
}
[data-chat-running] [class*="runningContent"] {
  display: inline-flex;
  align-items: center;
  gap: .6em;
  min-width: 0;
}
[data-chat-running] [class*="runningText"] {
  font-variant-numeric: tabular-nums;
  letter-spacing: .01em;
  color: var(--dsw-alias-label-secondary);
}
@keyframes tp-run-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  :root:not([data-tp-motion="full"]) [data-chat-running] { animation: none !important; }
}
`;

    /** Drop the trailing "···" the built-in label appends, keeping the pill tidy. */
    function trimRunningEllipsis() {
      for (const el of document.querySelectorAll('[data-chat-running] [data-shimmer-text]')) {
        const next = el.getAttribute('data-shimmer-text').replace(/\s*·{3}\s*$/, '');
        if (next !== el.getAttribute('data-shimmer-text')) el.setAttribute('data-shimmer-text', next);
      }
      const nodes = document.querySelectorAll('[data-chat-running] [class*="runningText"]');
      for (const node of nodes) {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let text = walker.nextNode();
        while (text !== null) {
          const next = text.nodeValue.replace(/\s*·{3}\s*$/, '');
          if (next !== text.nodeValue) text.nodeValue = next;
          text = walker.nextNode();
        }
      }
    }
    //#endregion

    //#region HUD seat
    /**
     * The visible HUD: a full-width progress edge plus either the expanded pill or the
     * collapsed ring. Clicking toggles between them; the choice persists in localStorage.
     */
    function TodoHud(props) {
      const t = props.t;
      const tr = (key) => (typeof t === 'function' ? t(key) : (FALLBACK[key] ?? key));
      const { todos, title } = useSnapshot();

      // Opt-in escape hatch for hosts whose OS asks for reduced motion but who still
      // want the full effect: localStorage['todo-progress-hud:motion'] = 'full'.
      React.useEffect(() => {
        let full = false;
        try {
          full = window.localStorage.getItem(MOTION_KEY) === 'full';
        } catch {
          /* storage unavailable */
        }
        if (full) document.documentElement.dataset.tpMotion = 'full';
        else delete document.documentElement.dataset.tpMotion;
      }, []);

      const list = todos || EMPTY;
      const total = list.length;

      let done = 0;
      let active = null;
      let failed = 0;
      for (const item of list) {
        if (!item) continue;
        if (FAILED_MARKER.test(item.content || '')) failed += 1;
        if (item.status === 'completed') done += 1;
        else if (item.status === 'in_progress' && active === null) active = item;
      }
      const complete = total > 0 && done === total;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;

      const [collapsed, setCollapsed] = React.useState(readCollapsed);
      const [leaving, setLeaving] = React.useState(false);
      const busy = React.useRef(false);
      // Play a short exit animation on the current shape, then swap and let the
      // incoming shape play its entrance: collapse/expand is a morph, not a jump.
      const toggle = React.useCallback(() => {
        if (busy.current) return;
        busy.current = true;
        setLeaving(true);
        window.setTimeout(() => {
          setCollapsed((value) => {
            writeCollapsed(!value);
            return !value;
          });
          setLeaving(false);
          busy.current = false;
        }, 150);
      }, []);

      // The HUD stays visible for as long as the conversation owns a todo list,
      // including a fully completed one: an auto-hiding bar reads as "broken"
      // when the next conversation opens with no visible progress.
      if (total === 0) return null;

      const titleText = title && title.trim() ? title.trim() : '';
      const summary = `${titleText || tr('label')} · ${done}/${total}`;
      const failedCount = failed > 0 ? ' · ' + tr('failed') + ' ' + failed : '';
      const edgeFailed = failed > 0;

      const styleEl = h('style', { key: 'tp-style' }, CSS);
      const miniNodes = list.map((item, index) => {
        const isFailed = !!item && FAILED_MARKER.test(item.content || '');
        const status = isFailed ? 'failed' : (item && item.status) || 'pending';
        return h('span', {
          key: 'mini:' + index + ':' + status,
          className: 'tp-pill-node',
          'data-status': status,
        });
      });

      const body = collapsed
        ? h(
            'button',
            {
              key: 'tp-pill',
              type: 'button',
              className: 'tp-pill',
              'data-failed': edgeFailed ? 'true' : 'false',
              'data-complete': complete ? 'true' : 'false',
              'data-leaving': leaving ? 'true' : 'false',
              title: summary + failedCount + ' · ' + tr('expand'),
              'aria-label': summary + failedCount,
              'aria-expanded': false,
              onClick: toggle,
            },
            h(
              'div',
              { className: 'tp-pill-track' },
              h('div', { className: 'tp-pill-fill', style: { width: pct + '%' } }),
            ),
            h('div', { className: 'tp-pill-nodes' }, miniNodes),
            h('span', { className: 'tp-pill-count' }, complete ? '\u2713' : done + '/' + total),
          )
        : h(
            'div',
            {
              key: 'tp-card',
              className: 'tp-card',
              role: 'button',
              tabIndex: 0,
              'data-complete': complete ? 'true' : 'false',
              'data-failed': edgeFailed ? 'true' : 'false',
              'data-leaving': leaving ? 'true' : 'false',
              title: summary + failedCount + ' · ' + tr('collapse'),
              'aria-label': summary + failedCount,
              'aria-expanded': true,
              onClick: toggle,
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggle();
                }
              },
            },
            h(
              'span',
              { className: 'tp-title', 'data-empty': titleText ? 'false' : 'true' },
              titleText || tr('label'),
            ),
            h('span', { className: 'tp-sep' }),
            h(
              'div',
              {
                className: 'tp-track',
                role: 'progressbar',
                'aria-valuemin': 0,
                'aria-valuemax': 100,
                'aria-valuenow': pct,
              },
              h('div', { className: 'tp-fill', style: { width: pct + '%' } }),
            ),
            h(
              'span',
              { key: 'count:' + pct, className: 'tp-count', 'data-complete': complete ? 'true' : 'false' },
              complete ? tr('done') : done + '/' + total,
            ),
            h(
              'div',
              { className: 'tp-nodes' },
              list.map((item, index) => {
                const isFailed = !!item && FAILED_MARKER.test(item.content || '');
                const status = isFailed ? 'failed' : (item && item.status) || 'pending';
                return h('span', {
                  key: index + ':' + status,
                  className: 'tp-node',
                  'data-status': status,
                  title: (item && item.content) || '',
                });
              }),
            ),
            complete
              ? null
              : h(
                  'span',
                  { className: 'tp-current', title: active ? active.content : '' },
                  active ? active.content : '',
                ),
            h('span', { className: 'tp-chevron', 'aria-hidden': true }, '⌃'),
          );

      return h(
        React.Fragment,
        null,
        styleEl,
        h('div', { key: 'tp-hud', className: 'tp-hud' }, body),
      );
    }
    //#endregion

    const inject = ['slots', 'locale'];

    /**
     * Registers the bridge seat and the HUD seat.
     * @param ctx - Client root context.
     */
    /** Build marker: lets the browser tell which bundle it actually loaded. */
    const BUILD = '1.7.4';

    function apply(ctx) {
      if (typeof window !== 'undefined') window.__TP_HUD = { build: BUILD };

      ctx.effect(
        () =>
          ctx.locale.register(NS, {
            zh: { label: '任务进度', done: '全部完成', failed: '失败', collapse: '折叠', expand: '展开' },
            en: { label: 'TASKS', done: 'ALL DONE', failed: 'failed', collapse: 'collapse', expand: 'expand' },
          }),
        'todo-progress-hud: dictionaries',
      );
      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.dshPlugin = 'dsh-todo-progress-hud/running-pill';
        tag.textContent = RUNNING_CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'todo-progress-hud:running-pill-css');

      ctx.effect(() => {
        trimRunningEllipsis();
        let frame = 0;
        const schedule = () => {
          if (frame !== 0) return;
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            trimRunningEllipsis();
          });
        };
        const root = document.body || document.documentElement;
        const observer = new MutationObserver(schedule);
        if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });
        return () => {
          observer.disconnect();
          if (frame !== 0) window.cancelAnimationFrame(frame);
        };
      }, 'todo-progress-hud:running-pill-trim');

      ctx.slots.inject('conversation.input.dock', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.dock',
            id: 'todo-progress-bridge',
            order: 900,
          },
          TodoBridge,
        ),
      );
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'todo-progress-hud',
            order: 900,
            locale: NS,
          },
          TodoHud,
        ),
      );
    }

    return { apply, inject };
  },
});
