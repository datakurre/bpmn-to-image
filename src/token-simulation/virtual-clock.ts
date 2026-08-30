/**
 * Deterministic virtual clock for driving bpmn-js-token-simulation's
 * animation inside jsdom.
 *
 * The token animation (see `bpmn-js-token-simulation/lib/animation/Animation.js`)
 * is not CSS-transition based — it schedules itself via `requestAnimationFrame`
 * and computes elapsed time via `Date.now()` each tick, then places the token
 * by calling `getPointAtLength()` on a `<path>` built from the connection's
 * waypoints (see `headless-polyfills.ts` for the polyline-aware polyfill that
 * makes that call return real coordinates in jsdom).
 *
 * That means the animation can be driven completely deterministically: patch
 * `Date.now` to return a virtual clock we control, and replace
 * `requestAnimationFrame` with a manually-flushed queue. Advancing the virtual
 * clock by a fixed step and flushing once per step reproduces exactly one
 * browser animation frame — real wall-clock time (spent rasterizing frames,
 * running the simulator, etc.) never leaks into the animation's timing.
 */

export interface VirtualClock {
  /** Advance the virtual clock by `ms` and run any pending animation frames. */
  advance(ms: number): void;
  /** Current virtual time in ms (matches what patched `Date.now()` returns). */
  now(): number;
  /** Restore the window's original `Date.now`/`requestAnimationFrame`/`cancelAnimationFrame`. */
  restore(): void;
}

/**
 * Patch `win.Date.now`, `win.requestAnimationFrame`, and
 * `win.cancelAnimationFrame` so animation timing is driven by explicit
 * `advance()` calls instead of the real wall clock.
 */
export function installVirtualClock(win: any): VirtualClock {
  const originalDateNow = win.Date.now;
  const originalRAF = win.requestAnimationFrame;
  const originalCAF = win.cancelAnimationFrame;

  let virtualNow = originalDateNow.call(win.Date);
  let nextHandle = 1;
  let callbacks = new Map<number, (time: number) => void>();

  win.Date.now = () => virtualNow;

  win.requestAnimationFrame = (callback: (time: number) => void) => {
    const handle = nextHandle++;
    callbacks.set(handle, callback);
    return handle;
  };

  win.cancelAnimationFrame = (handle: number) => {
    callbacks.delete(handle);
  };

  return {
    now: () => virtualNow,
    advance(ms: number) {
      virtualNow += ms;

      // Callbacks may synchronously schedule new rAF callbacks (the
      // animation reschedules itself every tick) — those belong to the
      // *next* frame, so swap the queue out before running this one.
      const due = callbacks;
      callbacks = new Map();

      for (const callback of due.values()) {
        callback(virtualNow);
      }
    },
    restore() {
      win.Date.now = originalDateNow;
      win.requestAnimationFrame = originalRAF;
      win.cancelAnimationFrame = originalCAF;
      callbacks.clear();
    },
  };
}
