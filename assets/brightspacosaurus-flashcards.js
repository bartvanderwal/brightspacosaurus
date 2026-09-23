document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.bso-flashcards').forEach(function (section) {
    const cards = section.querySelectorAll('.bso-flashcard');
    const show = function (visible) {
      cards.forEach(function (card) {
        const definition = card.querySelector('.bso-flashcard-definition');
        const button = card.querySelector('.bso-flashcard-toggle');
        if (definition) definition.hidden = !visible;
        if (button) button.setAttribute('aria-expanded', String(visible));
      });
    };
    const toolbar = document.createElement('div');
    toolbar.className = 'bso-flashcard-toolbar';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'bso-flashcard-global-toggle';
    toggle.textContent = 'Show definitions';
    toggle.addEventListener('click', function () {
      const hidden = section.querySelector('.bso-flashcard-definition[hidden]');
      const visible = Boolean(hidden);
      show(visible);
      toggle.textContent = visible ? 'Hide definitions' : 'Show definitions';
    });
    toolbar.appendChild(toggle);
    section.insertBefore(toolbar, section.firstChild);
    cards.forEach(function (card) {
      const button = card.querySelector('.bso-flashcard-toggle');
      if (button) button.addEventListener('click', function () {
        const definition = card.querySelector('.bso-flashcard-definition');
        if (!definition) return;
        const visible = definition.hidden;
        definition.hidden = !visible;
        button.setAttribute('aria-expanded', String(visible));
      });
    });
    show(false);
  });
});
