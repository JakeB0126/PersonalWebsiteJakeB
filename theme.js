// Run before CSS to apply a saved choice before the first styled paint.
(() => {
  const key = 'jake-portfolio-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let choice = null;
  function readChoice() {
    try {
      const saved = localStorage.getItem(key);
      choice = saved === 'light' || saved === 'dark' ? saved : null;
    } catch { /* Storage may be unavailable; retain the in-memory choice. */ }
  }
  readChoice();

  let button;
  function applyTheme() {
    const theme = choice || (system.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    if (button) {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    }
  }
  applyTheme();
  // Back/Forward may restore an older page from memory after a choice elsewhere.
  window.addEventListener('pageshow', () => { readChoice(); applyTheme(); });
  system.addEventListener('change', () => { if (!choice) applyTheme(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    choice = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
    applyTheme();
  });
  document.addEventListener('DOMContentLoaded', () => {
    button = document.querySelector('.theme-toggle');
    if (!button) return;
    button.hidden = false;
    applyTheme();
    button.addEventListener('click', () => {
      choice = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      try { localStorage.setItem(key, choice); } catch { /* Keep the in-memory choice. */ }
    });
  });
})();
