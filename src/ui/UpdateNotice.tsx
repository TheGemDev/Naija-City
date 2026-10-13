import { useEffect, useState } from 'react';
import './update-notice.css';

/** iOS can reload from its HTTP cache and show the old page again; force a fresh copy of the page first. */
async function refresh() {
  try {
    await Promise.race([
      fetch('/', { cache: 'reload' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
  } catch {
    /* offline or slow: reload anyway */
  }
  // location.reload() can be a no-op in iOS standalone PWAs; navigating to a cache-busted URL is more reliable.
  window.location.href = `/?_r=${Date.now()}`;
}

export function UpdateNotice() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    let checking = false;
    let lastCheckedAt = 0;

    async function checkForUpdate() {
      if (checking || !navigator.onLine || Date.now() - lastCheckedAt < 20_000) return;
      checking = true;
      lastCheckedAt = Date.now();
      try {
        const response = await fetch(`/?__update_check=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Update check failed (${response.status})`);
        const html = await response.text();
        const latestPage = new DOMParser().parseFromString(html, 'text/html');
        const latestCommit = latestPage.querySelector<HTMLMetaElement>('meta[name="kaduna-build"]')?.content;
        const currentCommit = document.querySelector<HTMLMetaElement>('meta[name="kaduna-build"]')?.content;
        if (!latestCommit || !currentCommit) throw new Error('The game build version is missing');
        setUpdateReady(latestCommit !== currentCommit);
      } catch (error) {
        console.error('Could not check for game updates', error);
      } finally {
        checking = false;
      }
    }

    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };
    void checkForUpdate();
    window.addEventListener('focus', checkWhenVisible);
    window.addEventListener('online', checkWhenVisible);
    document.addEventListener('visibilitychange', checkWhenVisible);

    return () => {
      window.removeEventListener('focus', checkWhenVisible);
      window.removeEventListener('online', checkWhenVisible);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <aside className="update-notice" role="status" aria-live="polite">
      <span className="update-notice-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12a8 8 0 1 1-2.6-5.9" />
          <path d="M20 4v5h-5" />
        </svg>
      </span>
      <span className="update-notice-text">
        <b>New update ready</b>
        <small>Refresh to get the latest version</small>
      </span>
      <button className="update-notice-refresh" onClick={() => void refresh()}>
        Refresh
      </button>
    </aside>
  );
}
