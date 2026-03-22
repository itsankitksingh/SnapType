const form = document.querySelector('#popupForm');
const title = document.querySelector('#popupTitle');
const meta = document.querySelector('#popupMeta');
const errorText = document.querySelector('#popupError');
const cancelButton = document.querySelector('#cancelButton');
const closeButton = document.querySelector('#closeButton');
const submitButton = document.querySelector('button[type="submit"]');

let currentPayload = null;
let isSubmitting = false;

function setError(message = '') {
  errorText.textContent = String(message || '').trim();
}

function setSubmitting(nextValue) {
  isSubmitting = Boolean(nextValue);

  if (submitButton) {
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? 'Inserting...' : 'Insert';
  }

  if (cancelButton) {
    cancelButton.disabled = isSubmitting;
  }

  if (closeButton) {
    closeButton.disabled = isSubmitting;
  }
}

function capitalize(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function fieldIdFor(placeholder, index) {
  const safePlaceholder = String(placeholder || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `field-${safePlaceholder || 'placeholder'}-${index}`;
}

function render(payload) {
  currentPayload = payload;
  setSubmitting(false);
  setError('');
  title.textContent = payload.placeholders.length > 0 ? 'Fill placeholders' : 'Ready to insert';
  meta.textContent = payload.placeholders.length > 0
    ? `Add values for ${payload.shortcut || 'this snippet'} before SnapType types it into your active app.`
    : 'No placeholders were found for this snippet.';

  if (!payload.placeholders.length) {
    form.innerHTML = '<p class="empty-copy">No placeholders were found for this snippet.</p>';
    return;
  }

  form.innerHTML = payload.placeholders
    .map(
      (placeholder, index) => `
        <div class="popup-field">
          <label for="${fieldIdFor(placeholder, index)}">${capitalize(placeholder)}</label>
          <input id="${fieldIdFor(placeholder, index)}" name="${placeholder}" type="text" autocomplete="off" />
        </div>
      `
    )
    .join('');

  const firstInput = form.querySelector('input');

  if (firstInput) {
    window.requestAnimationFrame(() => {
      firstInput.focus();
      firstInput.select();
    });
  }
}

async function cancel() {
  if (isSubmitting) {
    return;
  }

  await window.snaptype.cancelPopup();
}

window.snaptype.onPopupOpen((payload) => {
  render(payload);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentPayload || isSubmitting) {
    return;
  }

  setError('');
  setSubmitting(true);

  const formData = new FormData(form);
  const values = {};

  currentPayload.placeholders.forEach((placeholder) => {
    values[placeholder] = String(formData.get(placeholder) || '');
  });

  try {
    const result = await window.snaptype.submitPopup(values);

    if (!result?.ok) {
      setError(result?.error || 'Could not insert snippet text. Please try again.');
      setSubmitting(false);
      return;
    }
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Could not insert snippet text. Please try again.');
    setSubmitting(false);
  }
});

cancelButton.addEventListener('click', () => {
  void cancel();
});

closeButton.addEventListener('click', () => {
  void cancel();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    void cancel();
  }
});
