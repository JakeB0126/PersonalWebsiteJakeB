// Presentation only. All statistical values and chart geometry are built in Python.
(() => {
  const root = document.documentElement;
  const button = document.querySelector('[data-theme-toggle]');
  let saved;
  try { saved = localStorage.getItem('dnd-story-theme'); } catch (_) {}
  root.dataset.theme = saved === 'light' ? 'light' : 'dark';
  const current = () => root.dataset.theme;
  function update() {
    const dark = current() === 'dark';
    button.textContent = dark ? 'Light mode' : 'Dark mode';
    button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    button.setAttribute('aria-pressed', String(dark));
  }
  button.hidden = false;
  update();
  button.addEventListener('click', () => {
    root.dataset.theme = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('dnd-story-theme', root.dataset.theme); } catch (_) {}
    update();
  });
})();
