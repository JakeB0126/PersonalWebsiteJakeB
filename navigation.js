// Progressive enhancement: navigation stays visible if JavaScript is unavailable.
const header = document.querySelector('.site-header');
const toggle = header.querySelector('.menu-toggle');
const navigation = header.querySelector('.site-nav');
const links = [...navigation.querySelectorAll('a')];
const mobile = window.matchMedia('(max-width: 48rem)');

function setMenu(open, restoreFocus = false) {
  toggle.setAttribute('aria-expanded', String(open));
  toggle.querySelector('[data-menu-label]').textContent = open ? 'Close' : 'Menu';
  toggle.querySelector('.menu-symbol').textContent = open ? '−' : '+';
  navigation.hidden = mobile.matches && !open;
  if (restoreFocus) toggle.focus();
}

function syncViewport() {
  const focusInside = navigation.contains(document.activeElement);
  const focusOnToggle = document.activeElement === toggle;
  toggle.hidden = !mobile.matches;
  setMenu(false, mobile.matches && focusInside);
  if (!mobile.matches && focusOnToggle) links[0].focus();
}

// Normalize the explicit index filename to the homepage route.
function pagePath(pathname) {
  return pathname.replace(/\/index\.html$/, '/');
}

function syncLocation() {
  const currentPath = pagePath(window.location.pathname);
  const sectionLink = links.find(link =>
    pagePath(link.pathname) === currentPath && link.hash && link.hash === window.location.hash
  );
  links.forEach(link => {
    const samePage = pagePath(link.pathname) === currentPath;
    const active = sectionLink ? link === sectionLink : samePage && !link.hash;
    if (active) link.setAttribute('aria-current', link.hash ? 'location' : 'page');
    else link.removeAttribute('aria-current');
  });
  setMenu(false);
}

toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
header.addEventListener('keydown', event => {
  if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
    event.preventDefault();
    setMenu(false, true);
  }
});
header.addEventListener('click', event => {
  const link = event.target.closest('a[href]');
  if (!link) return;
  setMenu(false);
  // Keep native page/PDF navigation and browser history; focus only local fragments.
  if (link.hash && pagePath(link.pathname) === pagePath(window.location.pathname)) {
    document.getElementById(decodeURIComponent(link.hash.slice(1)))?.focus({ preventScroll: true });
  }
});
document.addEventListener('click', event => {
  if (!header.contains(event.target) && toggle.getAttribute('aria-expanded') === 'true') setMenu(false);
});
header.addEventListener('focusout', event => {
  if (event.relatedTarget && !header.contains(event.relatedTarget)) setMenu(false);
});
window.addEventListener('hashchange', syncLocation);
window.addEventListener('pageshow', syncLocation);
mobile.addEventListener('change', syncViewport);
syncViewport();
syncLocation();
