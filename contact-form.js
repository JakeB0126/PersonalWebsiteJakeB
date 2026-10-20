const form = document.querySelector('#contact-form');
if (form) {
  const submit = form.querySelector('button[type="submit"]');
  const status = document.querySelector('#contact-status');
  let token;
  const report = (message, error = false) => { status.textContent = message; status.setAttribute('role', error ? 'alert' : 'status'); };
  async function initialize() {
    submit.disabled = true;
    try {
      const response = await fetch('/api/contact', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (!response.ok || !data.available || !data.token) throw new Error();
      token = data.token; submit.disabled = false;
      report('Your name, email, and message are used to respond to your inquiry.');
    } catch { report('The contact form is not available yet. Please use LinkedIn for now.', true); }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!token || !form.reportValidity()) return;
    submit.disabled = true; form.setAttribute('aria-busy', 'true'); submit.textContent = 'Sending…'; report('Sending your message…');
    const fields = new FormData(form);
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ name: fields.get('name'), email: fields.get('email'), message: fields.get('message'), website: fields.get('website'), token }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) { report(data.message || 'Your message could not be sent. Please try again later.', true); return; }
      form.reset(); token = null; report(data.message);
    } catch { report('Delivery could not be confirmed. Please wait before retrying; your message may already have been accepted.', true); }
    finally { form.setAttribute('aria-busy', 'false'); submit.textContent = 'Send message'; submit.disabled = !token; }
  });
  initialize();
}
