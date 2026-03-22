const form = document.querySelector('#popupForm');
const title = document.querySelector('#popupTitle');
const cancelButton = document.querySelector('#cancelButton');
const closeButton = document.querySelector('#closeButton');

let currentPayload = null;

function capitalize(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function render(payload) {
  currentPayload = payload;
  title.textContent = payload.placeholders.length > 0 ? 'Fill placeholders' : 'Ready to insert';

  if (!payload.placeholders.length) {
    form.innerHTML = '<p class="empty-copy">No placeholders were found for this snippet.</p>';
    return;
  }

  form.innerHTML = payload.placeholders
    .map(
      (placeholder) => `
        <div class="popup-field">
          <label for="field-${placeholder}">${capitalize(placeholder)}</label>
          <input id="field-${placeholder}" name="${placeholder}" type="text" autocomplete="off" />
        </div>
      `
    )
    .join('');

  const firstInput = form.querySelector('input');

  if (firstInput) {
    firstInput.focus();
  }
}

async function cancel() {
  await window.snaptype.cancelPopup();
}

window.snaptype.onPopupOpen((payload) => {
  render(payload);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentPayload) {
    return;
  }

  const formData = new FormData(form);
  const values = {};

  currentPayload.placeholders.forEach((placeholder) => {
    values[placeholder] = String(formData.get(placeholder) || '');
  });

  await window.snaptype.submitPopup(values);
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
