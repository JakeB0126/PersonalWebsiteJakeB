// Native links remain usable without JavaScript; the dialog adds an in-page view.
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
