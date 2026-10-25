// Planning page behaviour: status filter, search, current-section marker and diagrams.
(() => {
  const q = document.getElementById('q');
  const items = [...document.querySelectorAll('[data-search]')];
  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  let status = 'all';

  function apply() {
    const term = (q?.value || '').trim().toLowerCase();
    let shown = 0;
    for (const el of items) {
      const statusOk = !el.classList.contains('unit') || status === 'all' || el.dataset.status === status;
      const textOk = !term || el.textContent.toLowerCase().includes(term);
      el.hidden = !(statusOk && textOk);
      if (!el.hidden) shown++;
      if (term && textOk && el.tagName === 'DETAILS') el.open = true;
    }
    document.getElementById('noresults').hidden = shown > 0 || !term;
  }

  filterButtons.forEach((b) => b.addEventListener('click', () => {
    status = b.dataset.filter;
    filterButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  }));
  q?.addEventListener('input', apply);

  // Open the unit or decision named in the address (#WU-0003, #D-001).
  const open = () => { const el = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (el?.tagName === 'DETAILS') el.open = true; };
  window.addEventListener('hashchange', open);
  open();

  // Mark the section in view in the tab bar.
  const tabs = [...document.querySelectorAll('.tabs a')];
  const secs = tabs.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) tabs.forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + e.target.id)));
    }, { rootMargin: '-30% 0px -60% 0px' });
    secs.forEach((s) => io.observe(s));
  }

  if (window.mermaid) { window.mermaid.initialize({ startOnLoad: true, theme: 'neutral', fontFamily: 'Onest, Arial, sans-serif' }); }
})();
