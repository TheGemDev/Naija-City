/** Where the code lives. Naija City is AGPL-3.0 open source. */
export const REPO_URL = 'https://github.com/TheGemDev/Naija-City';

/** A pill for the front page: the game is open source. */
export function OpenSourceChip() {
  return (
    <a className="lchip" href={REPO_URL} target="_blank" rel="noopener noreferrer" title="Naija City is now open source">
      <span aria-hidden="true">🔓</span> Open source
    </a>
  );
}

/** The settings row, shared by the profile sheet and the phone's settings. */
export function OpenSourceSettings() {
  return (
    <>
      <h4>Open source</h4>
      <div className="list-card">
        <a className="settings-option" href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <span>
            <b>Naija City is now open source</b>
            <small>Read the code, run your own city, or help build it on GitHub (AGPL-3.0)</small>
          </span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </>
  );
}
