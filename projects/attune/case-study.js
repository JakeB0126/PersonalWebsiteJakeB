// Artifact links remain usable without JavaScript; the dialog adds an in-page view.
const imageDialog = document.querySelector('.image-dialog');
const expandedImage = imageDialog.querySelector('img');
const imageDescription = imageDialog.querySelector('.image-description');
let imageTrigger;
if (typeof imageDialog.showModal === 'function') {
  for (const link of document.querySelectorAll('[data-image]')) {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      imageTrigger = link;
      expandedImage.src = link.href;
      expandedImage.alt = link.querySelector('img').alt;
      imageDescription.textContent = expandedImage.alt;
      imageDialog.showModal();
      imageDialog.scrollTop = 0;
    });
  }
  imageDialog.querySelector('.close-image').addEventListener('click', () => imageDialog.close());
  imageDialog.addEventListener('click', event => {
    if (event.target !== imageDialog) return;
    const bounds = imageDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) imageDialog.close();
  });
  imageDialog.addEventListener('close', () => imageTrigger?.focus({ preventScroll: true }));
}

// Only the embedded same-origin study can resize its frame. The child reports its
// content height, keeping mobile layouts in the page rather than nested scrolling.
const mosaicFrame = document.querySelector('.mosaic-embed');
window.addEventListener('message', event => {
  if (!mosaicFrame || event.source !== mosaicFrame.contentWindow || event.origin !== window.location.origin) return;
  if (event.data?.type !== 'attune:mosaic-height' || !Number.isFinite(event.data.height)) return;
  const height = Math.ceil(Math.max(400, Math.min(2400, event.data.height))) + 2;
  if (Math.abs(mosaicFrame.getBoundingClientRect().height - height) > 2) mosaicFrame.style.height = `${height}px`;
});
