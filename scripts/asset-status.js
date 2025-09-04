// JS: hard-set active pill background from an existing stylesheet selector.
// Place after DOM or inside your existing IIFE. Non-clickable pills (no click handlers).
(function () {
    const container = document.getElementById('statusBar');
    if (!container) return;
    const steps = Array.from(container.querySelectorAll('.step'));
    const pills = steps.map(s => s.querySelector('.pill'));
    // read selector from data attribute (fallback to body)
    const sourceSel = (container.dataset.activeColorSource || '').trim();
    function resolveColor() {
        if (sourceSel) {
            try {
                const src = document.querySelector(sourceSel);
                if (src) {
                    const cs = getComputedStyle(src);
                    // prefer backgroundColor then color
                    return cs.backgroundColor && cs.backgroundColor !== 'transparent' ? cs.backgroundColor : cs.color;
                }
            } catch (e) { /* invalid selector -> ignore */ }
        }
        // fallback -- try a CSS var if you use it, else a safe default
        const rootCS = getComputedStyle(document.documentElement);
        return rootCS.getPropertyValue('--accent').trim() || '#0b6fc0';
    }
    const activeColor = resolveColor();

    function apply(index) {
        const idx = Math.max(1, Math.min(steps.length, Number(index || 1)));
        container.dataset.step = idx;
        steps.forEach((el, i) => {
            el.classList.toggle('current', i === idx - 1);
            const pill = pills[i];
            if (!pill) return;
            // hard-set style: active pill gets computed color, others get bland
            if (i === idx - 1) {
                pill.style.background = activeColor;
                pill.style.color = '#fff';
            } else {
                pill.style.background = '';
                pill.style.color = '';
            }
        });
    }

    // expose API and init
    window.statusBar = { set: apply, element: container };
    apply(Number(container.dataset.step) || 1);
    window.statusBar.set(1)
})();
