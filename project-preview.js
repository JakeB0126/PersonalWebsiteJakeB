// Hover-only enhancement. Image areas are decorative, never activation targets.
// Without JS the approved preview screens remain visible.
for (const preview of document.querySelectorAll('.proggy-visual, .cover-preview')) {
  const cover = preview.querySelector('.proggy-preview-toggle, .cover-preview-toggle');
  const screens = preview.querySelector('.proggy-screens, .cover-preview-content');
  const render = visible => {
    preview.dataset.preview = String(visible);
    screens.setAttribute('aria-hidden', String(!visible));
  };
  cover.hidden = false;
  cover.addEventListener('pointerenter', event => {
    render(event.pointerType !== 'touch' && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  });
  cover.addEventListener('pointerleave', () => render(false));
  render(false);
}

const lotus = document.querySelector('.lotus');
if (lotus) {
  lotus.addEventListener('pointerenter', event => {
    lotus.dataset.hover = String(event.pointerType !== 'touch' && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  });
  lotus.addEventListener('pointerleave', () => { lotus.dataset.hover = 'false'; });
}

const attune = document.querySelector('.attune-tile');
if (attune) {
  attune.addEventListener('pointerenter', event => {
    attune.dataset.hover = String(event.pointerType !== 'touch' && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  });
  attune.addEventListener('pointerleave', () => { attune.dataset.hover = 'false'; });
}
