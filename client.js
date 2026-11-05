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
        if (activeBridge === token.current) publish(todos, title, sessionId);
      }, [todos, title, sessionId]);

      return null;
    }
    //#endregion

    //#region styles
    const CSS = `
.tp-hud {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  justify-content: center;
  pointer-events: none;
  font-family: var(--dsw-font-family, inherit);
}
.tp-edge {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
  pointer-events: none;
}
.tp-edge-fill {
  position: relative;
  height: 100%;
  background: linear-gradient(90deg, var(--dsw-alias-brand-primary), var(--dsw-alias-state-success-primary));
  background-size: 200% 100%;
  transition: width .55s cubic-bezier(.22, 1, .36, 1);
  animation: tp-drift 2.4s linear infinite;
  box-shadow: 0 0 10px rgba(99, 102, 241, .55);
}
.tp-edge[data-failed="true"] .tp-edge-fill {
  background: linear-gradient(90deg, var(--dsw-alias-state-error-primary), var(--dsw-alias-state-warn-primary));
}
@keyframes tp-drift {
  from { background-position: 0% 50%; }
  to   { background-position: 200% 50%; }
}

/* ---- collapsed pill: horizontal mini bar + node lights ---- */
.tp-pill {
  pointer-events: auto;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 11px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, .16);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1;
  will-change: transform;
  animation: tp-pill-in .32s cubic-bezier(.34, 1.4, .64, 1);
  transition: transform .18s ease, box-shadow .2s ease, border-color .2s ease;
}
.tp-pill:hover { transform: translateY(1px) scale(1.03); box-shadow: 0 8px 24px rgba(0, 0, 0, .22); }
.tp-pill:active { transform: scale(.97); }
.tp-pill[data-failed="true"] { border-color: var(--dsw-alias-state-error-primary); }
.tp-pill[data-leaving="true"] { animation: tp-pill-out .16s ease-in forwards; }

.tp-pill-track {
  position: relative;
  width: 54px;
  height: 5px;
  flex: none;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.tp-pill-fill {
  position: relative;
  height: 100%;
  border-radius: 999px;
  overflow: hidden;
  background-image: linear-gradient(90deg, var(--dsw-alias-brand-primary), var(--dsw-alias-state-success-primary));
  background-size: 200% 100%;
  transition: width .55s cubic-bezier(.22, 1, .36, 1);
  animation: tp-drift 2.4s linear infinite;
}
.tp-pill-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 20%, rgba(255, 255, 255, .5) 50%, transparent 80%);
  transform: translateX(-100%);
  animation: tp-sheen 2.2s ease-in-out infinite;
}
.tp-pill-nodes { display: flex; align-items: center; gap: 4px; }
.tp-pill-node {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1.2px solid var(--dsw-alias-state-idle-primary);
  background: transparent;
  transition: background .25s ease, border-color .25s ease;
}
.tp-pill-node[data-status="completed"] {
  background: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary);
  animation: tp-twinkle 2.6s ease-in-out infinite;
  animation-delay: var(--tp-delay, 0ms);
}
.tp-pill-node[data-status="in_progress"] {
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
  animation: tp-breathe 2.1s ease-in-out infinite;
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
@keyframes tp-pill-in {
  0%   { opacity: 0; transform: scale(.72) translateY(-4px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes tp-pill-out {
  0%   { opacity: 1; transform: scale(1) translateY(0); }
  100% { opacity: 0; transform: scale(.7) translateY(-4px); }
}
@keyframes tp-card-out {
  0%   { opacity: 1; transform: scale(1) translateY(0); }
  100% { opacity: 0; transform: scale(.72) translateY(-6px); }
}

/* ---- expanded card ---- */
.tp-card {
  pointer-events: auto;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px 7px 13px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1);
  box-shadow: 0 8px 28px rgba(0, 0, 0, .16);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-size: 12px;
  line-height: 1;
  color: var(--dsw-alias-label-primary);
  max-width: min(640px, calc(100vw - 40px));
  cursor: pointer;
  user-select: none;
  will-change: transform;
  animation: tp-card-in .34s cubic-bezier(.34, 1.4, .64, 1);
  transition: box-shadow .2s ease, border-color .2s ease, transform .18s ease;
}
.tp-card:hover { transform: translateY(1px); box-shadow: 0 10px 32px rgba(0, 0, 0, .22); }
.tp-card:active { transform: translateY(2px); }
.tp-card[data-complete="true"] {
  border-color: var(--dsw-alias-state-success-primary);
  animation: tp-card-in .34s cubic-bezier(.34, 1.4, .64, 1), tp-glow 1.1s ease-out 1;
}
.tp-card[data-leaving="true"] { animation: tp-card-out .16s ease-in forwards; }
.tp-card[data-failed="true"] {
  border-color: var(--dsw-alias-state-error-primary);
  animation: tp-card-in .34s cubic-bezier(.34, 1.4, .64, 1), tp-shake .45s ease-in-out 1;
}
@keyframes tp-card-in {
  0%   { opacity: 0; transform: translateY(-10px) scale(.95); }
  70%  { opacity: 1; transform: translateY(1px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes tp-glow {
  0%   { box-shadow: 0 0 0 0 var(--dsw-alias-state-success-primary); }
  60%  { box-shadow: 0 0 0 6px transparent, 0 8px 28px rgba(0, 0, 0, .16); }
  100% { box-shadow: 0 8px 28px rgba(0, 0, 0, .16); }
}

.tp-title {
  font-weight: 600;
  letter-spacing: .01em;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tp-title[data-empty="true"] { color: var(--dsw-alias-label-secondary); }
.tp-sep { width: 1px; height: 12px; background: var(--dsw-alias-border-l1); }
.tp-track {
  position: relative;
  flex: 1 1 160px;
  min-width: 80px;
  height: 6px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.tp-fill {
  position: relative;
  height: 100%;
  border-radius: 999px;
  overflow: hidden;
  background: linear-gradient(90deg, var(--dsw-alias-brand-primary), var(--dsw-alias-state-success-primary));
  transition: width .6s cubic-bezier(.22, 1, .36, 1);
}
.tp-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 20%, rgba(255, 255, 255, .45) 50%, transparent 80%);
  transform: translateX(-100%);
  animation: tp-sheen 2.2s ease-in-out infinite;
}
@keyframes tp-sheen {
  0%   { transform: translateX(-100%); }
  55%  { transform: translateX(100%); }
  100% { transform: translateX(100%); }
}
.tp-count {
  display: inline-block;
  animation: tp-bump .35s ease-out;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
}
.tp-count[data-complete="true"] { color: var(--dsw-alias-state-success-primary); font-weight: 600; }
.tp-nodes { display: flex; align-items: center; gap: 6px; }
.tp-node {
  position: relative;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid var(--dsw-alias-state-idle-primary);
  background: transparent;
  transition: background .25s ease, border-color .25s ease, transform .25s ease;
  animation: tp-pop .42s cubic-bezier(.34, 1.6, .64, 1);
  animation-delay: var(--tp-delay, 0ms);
}
.tp-node[data-status="completed"] {
  background: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary);
  animation: tp-pop .42s cubic-bezier(.34, 1.6, .64, 1), tp-twinkle 2.6s ease-in-out infinite;
  animation-delay: var(--tp-delay, 0ms), calc(var(--tp-delay, 0ms) + 500ms);
}
.tp-node[data-status="completed"]::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
  opacity: 0;
  animation: tp-burst .7s ease-out;
}
.tp-node[data-status="in_progress"] {
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
  animation: tp-pop .42s cubic-bezier(.34, 1.6, .64, 1), tp-breathe 2.1s ease-in-out infinite;
  animation-delay: var(--tp-delay, 0ms), 0ms;
}
.tp-node[data-status="in_progress"]::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1.5px solid var(--dsw-alias-brand-primary);
  animation: tp-ring 1.6s ease-out infinite;
}
.tp-node[data-status="failed"] {
  background: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
}
.tp-node[data-status="failed"]::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1.5px solid var(--dsw-alias-state-error-primary);
  animation: tp-ring .9s ease-out infinite;
}
@keyframes tp-pop {
  0%   { transform: scale(.5); }
  60%  { transform: scale(1.35); }
  100% { transform: scale(1); }
}
@keyframes tp-ring {
  0%   { transform: scale(.7); opacity: .9; }
  100% { transform: scale(1.7); opacity: 0; }
}
@keyframes tp-burst {
  0%   { transform: scale(.5); opacity: .6; }
  100% { transform: scale(2.4); opacity: 0; }
}
@keyframes tp-breathe {
  0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, .45); }
  50%      { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0); }
}
@keyframes tp-twinkle {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); opacity: .9; }
  50%      { box-shadow: 0 0 7px 1px rgba(34, 197, 94, .5); opacity: 1; }
}
@keyframes tp-bump {
  0%   { transform: scale(1); }
  45%  { transform: scale(1.22); }
  100% { transform: scale(1); }
}
@keyframes tp-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-3px); }
  40% { transform: translateX(3px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}
.tp-current {
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  transition: opacity .25s ease;
}
.tp-chevron {
  color: var(--dsw-alias-label-secondary);
  opacity: .55;
  font-size: 10px;
  transition: transform .25s ease;
}
.tp-card:hover .tp-chevron { transform: translateY(-1px); }

@media (prefers-reduced-motion: reduce) {
  :root:not([data-tp-motion="full"]) .tp-card,
  :root:not([data-tp-motion="full"]) .tp-pill,
  :root:not([data-tp-motion="full"]) .tp-pill-node,
  :root:not([data-tp-motion="full"]) .tp-pill-fill,
  :root:not([data-tp-motion="full"]) .tp-pill-fill::after,
  :root:not([data-tp-motion="full"]) .tp-node,
  :root:not([data-tp-motion="full"]) .tp-node::before,
  :root:not([data-tp-motion="full"]) .tp-node::after,
  :root:not([data-tp-motion="full"]) .tp-fill::after,
  :root:not([data-tp-motion="full"]) .tp-edge-fill,
  :root:not([data-tp-motion="full"]) .tp-chevron,
  :root:not([data-tp-motion="full"]) .tp-count {
    animation: none !important;
  }
  :root:not([data-tp-motion="full"]) .tp-fill { transition: width .25s ease; }
  :root:not([data-tp-motion="full"]) .tp-node,
  :root:not([data-tp-motion="full"]) .tp-pill-node { transition: background .25s ease, border-color .25s ease; }
}
`;
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
      const edge = h(
        'div',
        {
          key: 'tp-edge',
          className: 'tp-edge',
          'data-failed': edgeFailed ? 'true' : 'false',
        },
        h('div', { className: 'tp-edge-fill', style: { width: pct + '%' } }),
      );

      const miniNodes = list.map((item, index) => {
        const isFailed = !!item && FAILED_MARKER.test(item.content || '');
        const status = isFailed ? 'failed' : (item && item.status) || 'pending';
        return h('span', {
          key: 'mini:' + index + ':' + status,
          className: 'tp-pill-node',
          'data-status': status,
          style: { ['--tp-delay']: (index * 120) + 'ms' },
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
                  style: { ['--tp-delay']: (index * 45) + 'ms' },
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
        edge,
        h('div', { key: 'tp-hud', className: 'tp-hud' }, body),
      );
    }
    //#endregion

    const inject = ['slots', 'locale'];

    /**
     * Registers the bridge seat and the HUD seat.
     * @param ctx - Client root context.
     */
    function apply(ctx) {
      ctx.effect(
        () =>
          ctx.locale.register(NS, {
            zh: { label: '任务进度', done: '全部完成', failed: '失败', collapse: '折叠', expand: '展开' },
            en: { label: 'TASKS', done: 'ALL DONE', failed: 'failed', collapse: 'collapse', expand: 'expand' },
          }),
        'todo-progress-hud: dictionaries',
      );
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
