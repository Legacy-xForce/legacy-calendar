const LOCK_NAME = 'legacycalendar-refresh';

// Fallback where the Web Locks API is missing: serialises within this tab only.
let tail: Promise<unknown> = Promise.resolve();

/**
 * Runs `task` while holding the refresh lock, so only one refresh of the shared grant runs at a
 * time across every tab (Web Locks). The OP rotates the refresh token on each use and revokes the
 * whole grant when an old one comes back, so two overlapping refreshes would sign the user out.
 */
export function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = globalThis.navigator?.locks;
    // The DOM typings model the callback's return value, not the promise it resolves to.
    if (locks) return locks.request(LOCK_NAME, task) as unknown as Promise<T>;
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
}
