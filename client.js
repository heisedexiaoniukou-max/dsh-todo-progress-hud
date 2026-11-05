/**
 * Client half of the todo-progress HUD.
 *
 * One seat: `conversation.input.dock` under the shipped `todo` id, so the bar replaces
 * the stock todo panel instead of adding a second one. It reads the session `todos`
 * projection directly and renders the whole task surface in a single collapsible bar:
 * header (label, thin track, counter, current step) plus the item list.
 *
 * The last written list is cached per session because the host clears the projection on
 * every `turn/start`. Styles use only `--dsw-alias-*` theme tokens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-todo-progress-hud',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'todoProgress';
    const EMPTY = Object.freeze([]);
    const FALLBACK = { label: '任务', done: '全部完成', failed: '失败', collapse: '折叠', expand: '展开' };
    const STORAGE_KEY = 'todo-progress-hud:collapsed';
    const MOTION_KEY = 'todo-progress-hud:motion';
    /** A todo node marked with these leading glyphs is rendered as failed. */
    const FAILED_MARKER = /^[\s]*[⚠✗❌]/u;

    //#region last known list
    /**
     * The host resets the `todos` projection to null on every `turn/start`, which would
     * blank the bar between a new turn starting and that turn's first `todo_write`.
     * Keep the last list each session actually wrote and fall back to it while null.
     */
    const lastKnownTodos = new Map();

    function cacheTodos(sessionId, todos) {
      if (!Array.isArray(todos)) return;
      if (todos.length === 0) lastKnownTodos.delete(sessionId);
      else lastKnownTodos.set(sessionId, todos);
    }

    function cachedTodos(sessionId) {
      return lastKnownTodos.get(sessionId) || EMPTY;
    }

    /**
     * Whether the conversation is inside a running turn. The host blanks the `todos`
     * projection between turns; without this signal a stale list would keep the bar
     * visible after the conversation already finished.
     */
    function useChatRunning() {
      const probe = () => (typeof document === 'undefined' ? false : !!document.querySelector('[data-chat-running]'));
      const [running, setRunning] = React.useState(probe);
      React.useEffect(() => {
        const check = () => setRunning(probe());
        const root = document.body || document.documentElement;
        if (!root) return undefined;
        const observer = new MutationObserver(check);
        observer.observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['data-chat-running'],
        });
        check();
        return () => observer.disconnect();
      }, []);
      return running;
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

    //#region styles
    const CSS = `
.tp-hud {
  --tp-accent: #4f6df5;
  --tp-accent-soft: color-mix(in srgb, var(--tp-accent) 16%, transparent);
  display: flex;
  justify-content: center;
  width: 100%;
  font-family: var(--dsw-font-family, inherit);
}
@media (prefers-color-scheme: dark) {
  .tp-hud { --tp-accent: #7d92ff; }
}
:root[data-ds-theme="dark"] .tp-hud { --tp-accent: #7d92ff; }
.tp-panel {
  width: 100%;
  max-width: var(--dsh-chat-content-width, 748px);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, .06));
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: calc(var(--dsh-content-font-size, 14px) - 2px);
  line-height: 1.35;
  animation: tp-row-in .18s ease-out;
}
.tp-panel[data-complete="true"] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, var(--dsw-alias-border-l1));
}
.tp-panel[data-failed="true"] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, var(--dsw-alias-border-l1));
}
.tp-head {
  display: flex;
  align-items: center;
  gap: .7em;
  width: 100%;
  padding: .5em .8em;
  margin: 0;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.tp-head:hover { background: color-mix(in srgb, var(--dsw-alias-label-secondary) 5%, transparent); }
.tp-title {
  flex: none;
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}
.tp-track {
  position: relative;
  flex: 1 1 auto;
  min-width: 60px;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 14%, transparent);
  overflow: hidden;
}
.tp-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--tp-accent);
  transition: width .6s cubic-bezier(.3, .9, .35, 1);
}
.tp-panel[data-complete="true"] .tp-fill { background: var(--dsw-alias-state-success-primary); }
.tp-count {
  flex: none;
  font-variant-numeric: tabular-nums;
  transition: color .3s ease;
}
.tp-panel[data-complete="true"] .tp-count {
  color: var(--dsw-alias-state-success-primary);
  font-weight: 600;
}
.tp-current {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
}
.tp-chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: .85em;
}
.tp-list {
  list-style: none;
  margin: 0;
  padding: 0 .8em .55em;
  display: flex;
  flex-direction: column;
  gap: .3em;
}
.tp-item {
  display: flex;
  align-items: baseline;
  gap: .55em;
  min-width: 0;
}
.tp-dot {
  flex: none;
  width: .5em;
  height: .5em;
  border-radius: 50%;
  border: 1.2px solid color-mix(in srgb, var(--dsw-alias-label-secondary) 45%, transparent);
  background: transparent;
  transform: translateY(-1px);
  transition: background .3s ease, border-color .3s ease;
}
.tp-item[data-status="completed"] .tp-dot {
  background: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary);
}
.tp-item[data-status="in_progress"] .tp-dot {
  background: var(--tp-accent);
  border-color: var(--tp-accent);
  box-shadow: 0 0 0 3px var(--tp-accent-soft);
}
.tp-item[data-status="failed"] .tp-dot {
  background: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
}
.tp-item-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tp-item[data-status="completed"] .tp-item-text { color: var(--dsw-alias-label-tertiary); }
.tp-item[data-status="failed"] .tp-item-text { color: var(--dsw-alias-state-error-primary); }
@keyframes tp-row-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  :root:not([data-tp-motion="full"]) .tp-panel { animation: none !important; }
  :root:not([data-tp-motion="full"]) .tp-fill { transition: width .2s ease; }
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

    //#region dock seat
    /**
     * One collapsible bar that owns the whole task surface: the header carries the
     * progress (label, thin track, counter, current step) and the body lists every item.
     * It registers under the shipped `todo` id, so it replaces the stock dock panel
     * instead of stacking a second bar next to it.
     */
    function TodoDock(props) {
      const t = props.t;
      const tr = (key) => (typeof t === 'function' ? t(key) : (FALLBACK[key] ?? key));
      const useProjection = props.useProjection;
      const sessionId = props.sessionId;
      const rawTodos = typeof useProjection === 'function' ? useProjection('todos') : null;

      React.useEffect(() => {
        cacheTodos(sessionId, rawTodos);
      }, [sessionId, rawTodos]);

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

      const [collapsed, setCollapsed] = React.useState(readCollapsed);
      const toggle = React.useCallback(() => {
        setCollapsed((value) => {
          writeCollapsed(!value);
          return !value;
        });
      }, []);

      const running = useChatRunning();
      // Between turns the projection is null on purpose: show the remembered list only
      // while a turn is running, otherwise the bar would outlive the conversation.
      const list = Array.isArray(rawTodos) ? rawTodos : running ? cachedTodos(sessionId) : EMPTY;
      const total = list.length;
      if (total === 0) return null;

      let done = 0;
      let failed = 0;
      let active = null;
      for (const item of list) {
        if (!item) continue;
        if (FAILED_MARKER.test(item.content || '')) failed += 1;
        if (item.status === 'completed') done += 1;
        else if (item.status === 'in_progress' && active === null) active = item;
      }
      const complete = done === total;
      const pct = Math.round((done / total) * 100);

      return h(
        React.Fragment,
        null,
        h('style', { key: 'tp-style' }, CSS),
        h(
          'div',
          { className: 'tp-hud' },
          h(
            'div',
            {
              className: 'tp-panel',
              'data-complete': complete ? 'true' : 'false',
              'data-failed': failed > 0 ? 'true' : 'false',
            },
            h(
              'button',
              {
                type: 'button',
                className: 'tp-head',
                'aria-expanded': !collapsed,
                title: complete ? tr('done') : done + '/' + total,
                onClick: toggle,
              },
              h('span', { className: 'tp-title' }, tr('label')),
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
              h('span', { className: 'tp-count' }, complete ? tr('done') : done + '/' + total),
              complete || !active ? null : h('span', { className: 'tp-current' }, active.content),
              h('span', { className: 'tp-chevron', 'aria-hidden': true }, collapsed ? '\u2304' : '\u2303'),
            ),
            collapsed
              ? null
              : h(
                  'ul',
                  { className: 'tp-list' },
                  list.map((item, index) => {
                    const isFailed = !!item && FAILED_MARKER.test(item.content || '');
                    const status = isFailed ? 'failed' : (item && item.status) || 'pending';
                    return h(
                      'li',
                      { key: index + ':' + status, className: 'tp-item', 'data-status': status },
                      h('span', { className: 'tp-dot', 'aria-hidden': true }),
                      h('span', { className: 'tp-item-text' }, (item && item.content) || ''),
                    );
                  }),
                ),
          ),
        ),
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
            zh: { label: '任务', done: '全部完成', failed: '失败', collapse: '折叠', expand: '展开' },
            en: { label: 'Tasks', done: 'all done', failed: 'failed', collapse: 'collapse', expand: 'expand' },
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
            // Reusing the shipped cell: one bar with everything in it.
            name: 'conversation.input.dock',
            id: 'todo',
            order: 0,
            locale: NS,
          },
          TodoDock,
        ),
      );
    }

    return { apply, inject };
  },
});
