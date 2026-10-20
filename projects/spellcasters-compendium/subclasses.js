/* Presentation only: all views, values and geometry are precomputed in Python. */
(() => {
  const root = document.querySelector('[data-subclass-explorer]');
  if (!root) return;
  const views = [...root.querySelectorAll('[data-view]')];
  const status = root.querySelector('.sub-inspection');
  const controls = root.querySelector('.sub-controls');
  controls.hidden = false;
  const inspect = el => { if (el.dataset.tip) status.textContent = el.dataset.tip; };
  const activate = el => {
    inspect(el);
    const name = el.dataset.select;
    if (name === 'detail') return;
    views.forEach(view => { view.hidden = view.dataset.view !== name; });
    controls.querySelectorAll('[data-select]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.select === name)));
    status.textContent = name === 'all'
      ? 'All six classes. Rings use recorded subclasses only. Missing records are accounted for below.'
      : `${name} selected. The breakdown shows each count, its share of recorded subclasses and its share of all class records.`;
    if (el.tagName.toLowerCase() === 'path') controls.querySelector(`[data-select="${name}"]`).focus({preventScroll:true});
  };
  root.addEventListener('pointerover', event => { const el=event.target.closest('[data-tip]'); if(el)inspect(el); });
  root.addEventListener('focusin', event => { const el=event.target.closest('[data-tip]'); if(el)inspect(el); });
  root.addEventListener('click', event => { const el=event.target.closest('[data-select]'); if(el)activate(el); });
  root.addEventListener('keydown', event => {
    const el=event.target.closest('path[data-select]');
    if(el && (event.key==='Enter'||event.key===' ')){event.preventDefault();activate(el);}
    if(event.key==='Escape'){activate(controls.querySelector('[data-select="all"]'));controls.querySelector('[data-select="all"]').focus({preventScroll:true});}
  });
})();
