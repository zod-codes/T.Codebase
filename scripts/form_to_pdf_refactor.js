/*
  form-to-PDF.refactor.js
  Rewritten by ChatGPT — features:
  - Consistent combined-fields config (TIN, DOB, Phone, ZIP)
  - Stronger validation before PDF generation / sending
  - Confirmation modal (verification popup) showing combined values
  - LocalStorage snapshot preserved (improved: multiple submissions stored, no files), timestamped
  - Access key read from form data attribute (data-access-key) — avoids hard-coding
  - Safer DOM guards, no function-scoped mutable state
  - Uses input event for numeric enforcement and auto-advance
  - Image resizing before embedding in PDF to limit memory
  - Clean error handling and events: web3forms:success / web3forms:error

  Usage:
    - Add attribute `data-access-key="..."` to your <form> if you want client-side sending.
    - If no access key present, PDF generation works but network send will be skipped (and logged).

  Note: Keep reviewing security practices for handling PII. LocalStorage snapshots remain enabled by user request.
*/

(function () {
  'use strict';

  // Configuration
  const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';
  const LOCAL_STORAGE_KEY = 'formSubmissionData';
  const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
  const IMAGE_MAX_DIM = { width: 1200, height: 800 }; // resize cap for embedded images

  // Canonical combined fields definition (single source of truth)
  // Each item: names = array of input name/id parts (name preferred), label = final label, sep = separator when joining
  const COMBINED_FIELDS = [
    { names: ['tin1', 'tin2', 'tin3'], label: 'TIN', sep: '-' },
    { names: ['dobMonth', 'dobDay', 'dobYear'], label: 'Date of Birth', sep: '-' },
    { names: ['phone1', 'phone2', 'phone3'], label: 'Home Phone', sep: '-' },
    { names: ['zip5', 'zip4'], label: 'ZIP', sep: '-' }
  ];

  // Utility: safe DOM query by name or id
  function getControl(form, key) {
    if (!form || !key) return null;
    // prefer name
    const byName = form.elements.namedItem(key);
    if (byName) return byName;
    // fallback to id
    return form.querySelector(`#${CSS.escape(key)}`) || null;
  }

  // Utility: find a friendly label for an input
  function findLabelText(input) {
    if (!input) return '';
    if (input.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (lab) return lab.textContent.trim();
    }
    const parentLabel = input.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();
    return input.getAttribute('aria-label') || input.name || input.id || '(unnamed)';
  }

  // Utility: read file as DataURL
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  // Utility: resize image (File / dataURL) using canvas, returns dataURL (JPEG) and blob
  async function resizeImageFileToDataURL(file, maxWidth, maxHeight) {
    const dataUrl = await fileToDataURL(file);
    return await resizeDataURL(dataUrl, maxWidth, maxHeight);
  }

  function resizeDataURL(dataUrl, maxWidth, maxHeight) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const aspect = width / height;
        if (width > maxWidth) {
          width = maxWidth;
          height = Math.round(width / aspect);
        }
        if (height > maxHeight) {
          height = maxHeight;
          width = Math.round(height * aspect);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // export as JPEG to reduce size
        const newDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(newDataUrl);
      };
      img.onerror = () => reject(new Error('Image load error'));
      img.src = dataUrl;
    });
  }

  // Ensure jsPDF is loaded (UMD build)
  function ensureJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (window._loadingJsPDF) return window._loadingJsPDF;

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.async = true;

    window._loadingJsPDF = new Promise((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load jsPDF'));
      document.head.appendChild(script);
    }).finally(() => { window._loadingJsPDF = null; });

    return window._loadingJsPDF;
  }

  // Validate composite date
  function validateDateParts(month, day, year) {
    const m = Number(month);
    const d = Number(day);
    const y = Number(year);
    if (!m || !d || !y) return { valid: false, reason: 'Missing date parts' };
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
      return { valid: false, reason: 'Invalid date' };
    }
    const now = new Date();
    if (dt > now) return { valid: false, reason: 'Date of birth cannot be in the future' };
    if (y < 1900) return { valid: false, reason: 'Year must be after 1900' };
    return { valid: true };
  }

  // Validate the entire form; returns { valid, errors: [{ field, message }] }
  function validateForm(form) {
    const errors = [];

    // HTML5 validity for named controls
    for (const el of Array.from(form.elements)) {
      // skip buttons
      if (!el.name || el.disabled) continue;
      const tag = el.tagName.toLowerCase();
      const type = (el.type || '').toLowerCase();
      if (type === 'submit' || type === 'button' || type === 'reset') continue;

      // for file inputs, check file constraints separately
      if (type === 'file') continue;

      // rely on browser validity first
      if (typeof el.checkValidity === 'function' && !el.checkValidity()) {
        const label = findLabelText(el);
        const message = el.validationMessage || 'Invalid value';
        errors.push({ field: el.name || el.id, message: `${label}: ${message}` });
      }
    }

    // Combined fields custom checks
    // TIN: require each part be numeric and non-empty (example length checks applied loosely)
    const tinParts = COMBINED_FIELDS.find(c => c.label === 'TIN')?.names || [];
    const tinVals = tinParts.map(k => (getControl(form, k) || {}).value || '');
    if (tinVals.some(v => v.trim() === '')) {
      errors.push({ field: 'TIN', message: 'All TIN parts are required' });
    }
    if (tinVals.some(v => /\D/.test(v))) {
      errors.push({ field: 'TIN', message: 'TIN must contain only digits' });
    }

    // DOB
    const dobParts = COMBINED_FIELDS.find(c => c.label === 'Date of Birth')?.names || [];
    const [m, d, y] = dobParts.map(k => (getControl(form, k) || {}).value || '');
    const dobCheck = validateDateParts(m, d, y);
    if (!dobCheck.valid) errors.push({ field: 'Date of Birth', message: dobCheck.reason });

    // Phone parts numeric
    const phoneParts = COMBINED_FIELDS.find(c => c.label === 'Home Phone')?.names || [];
    const phoneVals = phoneParts.map(k => (getControl(form, k) || {}).value || '');
    if (phoneVals.some(v => v.trim() === '')) errors.push({ field: 'Home Phone', message: 'Phone parts are required' });
    if (phoneVals.some(v => /\D/.test(v))) errors.push({ field: 'Home Phone', message: 'Phone parts must be numeric' });

    // ZIP
    const zipParts = COMBINED_FIELDS.find(c => c.label === 'ZIP')?.names || [];
    const zipVals = zipParts.map(k => (getControl(form, k) || {}).value || '');
    if (zipVals.some(v => v.trim() === '')) errors.push({ field: 'ZIP', message: 'ZIP parts required' });
    if (zipVals.some(v => /\D/.test(v))) errors.push({ field: 'ZIP', message: 'ZIP must be numeric' });

    // Files: verify size and type for file inputs
    for (const fileInput of Array.from(form.querySelectorAll('input[type="file"]'))) {
      if (!fileInput.name) continue;
      const f = fileInput.files && fileInput.files[0];
      if (!f) continue; // optional file
      if (f.size > IMAGE_MAX_BYTES) errors.push({ field: fileInput.name, message: 'File exceeds max size (5MB)' });
      if (!/^image\/(jpeg|png|gif|webp)$/i.test(f.type)) errors.push({ field: fileInput.name, message: 'Unsupported file type' });
    }

    return { valid: errors.length === 0, errors };
  }

  // Build a snapshot object (no file binary content) with combined fields
  function buildSubmissionSnapshot(form) {
    const snapshot = {};

    // first add simple named controls
    for (const el of Array.from(form.elements)) {
      if (!el.name || el.disabled) continue;
      const tag = el.tagName.toLowerCase();
      const type = (el.type || '').toLowerCase();
      if (type === 'file') continue; // skip binary content
      if (type === 'radio') {
        if (!el.checked) continue;
        snapshot[findLabelText(el)] = el.value;
        continue;
      }
      if (type === 'checkbox') {
        snapshot[findLabelText(el)] = !!el.checked;
        continue;
      }
      if (tag === 'select') {
        const opt = el.selectedOptions && el.selectedOptions[0];
        snapshot[findLabelText(el)] = opt ? opt.text : el.value;
        continue;
      }
      snapshot[findLabelText(el)] = el.value;
    }

    // add combined fields (overwrites constituent parts' labels if necessary)
    for (const group of COMBINED_FIELDS) {
      const parts = group.names.map(n => (getControl(form, n) || {}).value || '').filter(s => s !== '');
      if (parts.length === 0) continue;
      snapshot[group.label] = parts.join(group.sep);
      // optionally remove constituent labels (best-effort)
      for (const p of group.names) {
        const control = getControl(form, p);
        if (control) {
          const label = findLabelText(control);
          if (label && snapshot[label]) delete snapshot[label];
        }
      }
    }

    // timestamp
    snapshot.__submittedAt = new Date().toISOString();
    return snapshot;
  }

  // Prepare FormData for sending: include combined fields under single names and append files
  function prepareFormDataForSend(form) {
    const fd = new FormData();

    // access key must come from form dataset (avoid hard-coded key). If missing, we'll still prepare data.
    const accessKey = (form.dataset && form.dataset.accessKey) || '';
    if (accessKey) fd.append('access_key', accessKey);

    // first, append combined fields as single entries
    const combinedNamesUsed = new Set();
    for (const group of COMBINED_FIELDS) {
      const parts = group.names.map(n => (getControl(form, n) || {}).value || '').filter(Boolean);
      if (parts.length) {
        const key = group.label.replace(/\s+/g, '_').toLowerCase();
        fd.append(key, parts.join(group.sep));
        group.names.forEach(n => combinedNamesUsed.add(n));
      }
    }

    // then append regular fields (skip those constituent parts and skip access_key if present)
    for (const el of Array.from(form.elements)) {
      if (!el.name || el.disabled) continue;
      if (combinedNamesUsed.has(el.name)) continue;
      const type = (el.type || '').toLowerCase();
      if (type === 'submit' || type === 'button' || type === 'reset') continue;

      if (type === 'file') {
        const f = el.files && el.files[0];
        if (f) fd.append(el.name, f, f.name);
        continue;
      }

      if (type === 'checkbox') {
        fd.append(el.name, el.checked ? (el.value || 'on') : '');
        continue;
      }

      if (type === 'radio') {
        if (el.checked) fd.append(el.name, el.value);
        continue;
      }

      fd.append(el.name, el.value || '');
    }

    // ensure subject exists
    if (!fd.has('subject')) fd.append('subject', 'Website Form Submission');

    return fd;
  }

  // Save snapshot in localStorage (keep a list of submissions)
  function saveSnapshotToLocalStorage(snapshot) {
    try {
      const prevRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      const prev = prevRaw ? JSON.parse(prevRaw) : [];
      prev.push(snapshot);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(prev));
      return true;
    } catch (e) {
      console.warn('Unable to save snapshot to localStorage', e);
      return false;
    }
  }

  // Show a confirm/verification modal with submission summary; returns Promise<boolean>
  function showConfirmationModal(snapshot) {
    return new Promise((resolve) => {
      // create modal backdrop
      const backdrop = document.createElement('div');
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.style.position = 'fixed';
      backdrop.style.left = '0';
      backdrop.style.top = '0';
      backdrop.style.right = '0';
      backdrop.style.bottom = '0';
      backdrop.style.background = 'rgba(0,0,0,0.5)';
      backdrop.style.display = 'flex';
      backdrop.style.alignItems = 'center';
      backdrop.style.justifyContent = 'center';
      backdrop.style.zIndex = '2147483647';

      const box = document.createElement('div');
      box.style.width = '90%';
      box.style.maxWidth = '700px';
      box.style.maxHeight = '80%';
      box.style.overflow = 'auto';
      box.style.background = '#fff';
      box.style.padding = '18px';
      box.style.borderRadius = '8px';
      box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';

      const title = document.createElement('h2');
      title.textContent = 'Verify submission';
      title.style.marginTop = '0';
      box.appendChild(title);

      const info = document.createElement('p');
      info.textContent = 'Please confirm the details below before we generate your PDF and send the form:';
      box.appendChild(info);

      const list = document.createElement('dl');
      list.style.display = 'grid';
      list.style.gridTemplateColumns = '1fr 1fr';
      list.style.columnGap = '12px';
      list.style.rowGap = '6px';

      // show snapshot entries (limit long values)
      for (const [k, v] of Object.entries(snapshot)) {
        if (k === '__submittedAt') continue;
        const dt = document.createElement('dt');
        dt.style.fontWeight = '600';
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.style.margin = '0 0 8px 0';
        const text = typeof v === 'string' ? v : JSON.stringify(v);
        dd.textContent = text.length > 200 ? text.slice(0, 200) + '…' : text;
        list.appendChild(dt);
        list.appendChild(dd);
      }

      box.appendChild(list);

      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.justifyContent = 'flex-end';
      btnRow.style.gap = '8px';
      btnRow.style.marginTop = '12px';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = () => {
        document.body.removeChild(backdrop);
        resolve(false);
      };

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.textContent = 'Confirm & Send';
      confirmBtn.style.background = '#0b74de';
      confirmBtn.style.color = '#fff';
      confirmBtn.style.border = 'none';
      confirmBtn.style.padding = '8px 12px';
      confirmBtn.style.borderRadius = '6px';
      confirmBtn.onclick = () => {
        document.body.removeChild(backdrop);
        resolve(true);
      };

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(confirmBtn);
      box.appendChild(btnRow);

      backdrop.appendChild(box);
      document.body.appendChild(backdrop);

      // focus the confirm button for keyboard accessibility
      confirmBtn.focus();
    });
  }

  // Generate PDF from form and snapshot. Returns filename when completed.
  async function generatePDFFromForm(form, snapshot, options = {}) {
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const left = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 60;
    const lineHeight = 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Form Submission', left, y);
    y += 28;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    // print combined fields first (use COMBINED_FIELDS order)
    for (const group of COMBINED_FIELDS) {
      const val = snapshot[group.label];
      if (!val) continue;
      if (y + lineHeight > pageHeight - 60) { doc.addPage(); y = 60; }
      doc.setFont('helvetica', 'bold');
      doc.text(`${group.label}:`, left, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(val), left + 140, y);
      y += lineHeight;
    }

    // print other fields
    for (const [label, value] of Object.entries(snapshot)) {
      if (label === '__submittedAt') continue;
      if (COMBINED_FIELDS.some(g => g.label === label)) continue; // already printed
      if (y + lineHeight > pageHeight - 80) { doc.addPage(); y = 60; }
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, left, y);
      doc.setFont('helvetica', 'normal');
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const wrapped = doc.splitTextToSize(text, pageWidth - left - 160);
      doc.text(wrapped, left + 140, y);
      y += lineHeight * Math.max(1, wrapped.length);
    }

    // Try to embed first image file (if any)
    const firstFileInput = form.querySelector('input[type="file"]');
    if (firstFileInput && firstFileInput.files && firstFileInput.files[0]) {
      const file = firstFileInput.files[0];
      if (file.size <= IMAGE_MAX_BYTES && /^image\//.test(file.type)) {
        try {
          const resized = await resizeImageFileToDataURL(file, IMAGE_MAX_DIM.width, IMAGE_MAX_DIM.height);
          // compute placement
          if (y + 150 > pageHeight - 60) { doc.addPage(); y = 60; }
          doc.setFont('helvetica', 'bold');
          doc.text('Attached Image:', left, y);
          y += 12;
          // place image scaled to fit
          const imgProps = doc.getImageProperties(resized);
          const maxW = pageWidth - left * 2 - 20;
          const maxH = 200;
          let w = imgProps.width;
          let h = imgProps.height;
          const ratio = Math.min(maxW / w, maxH / h, 1);
          w = w * ratio; h = h * ratio;
          doc.addImage(resized, 'JPEG', left, y, w, h);
          y += h + 10;
        } catch (e) {
          // ignore embedding error, but print message
          if (y + lineHeight > pageHeight - 60) { doc.addPage(); y = 60; }
          doc.setFont('helvetica', 'italic');
          doc.text('Attached image could not be embedded.', left, y);
          y += lineHeight;
        }
      }
    }

    // footer timestamp
    const footer = `Generated: ${new Date(snapshot.__submittedAt).toLocaleString()}`;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(footer, left, pageHeight - 30);

    const filename = options.filename || `form-submission-${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(filename);
    return filename;
  }

  // Send form data to Web3Forms (or other endpoint). Returns result object.
  async function sendToEndpoint(formData, endpoint = WEB3FORMS_ENDPOINT) {
    try {
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `Request failed: ${res.status}`);
      return { ok: true, result: json };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  // Wire up the main submit logic (guarded)
  async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form || form.tagName !== 'FORM') return;

    // disable submit buttons
    const submitButtons = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));
    submitButtons.forEach(b => b.disabled = true);

    try {
      // 1. validate
      const validation = validateForm(form);
      if (!validation.valid) {
        // show errors in a simple summary area or alert
        const summary = validation.errors.map(e => `${e.field}: ${e.message}`).join('\n');
        // dispatch event
        form.dispatchEvent(new CustomEvent('web3forms:error', { detail: { message: 'Validation failed', errors: validation.errors } }));
        alert('Validation errors:\n' + summary);
        return;
      }

      // 2. build a snapshot (will include combined fields)
      const snapshot = buildSubmissionSnapshot(form);

      // 3. show a verification modal (user must confirm)
      const confirmed = await showConfirmationModal(snapshot);
      if (!confirmed) {
        return;
      }

      // 4. generate PDF (downloads immediately)
      await generatePDFFromForm(form, snapshot);

      // 5. prepare FormData and save snapshot to localStorage (no file binaries in snapshot)
      saveSnapshotToLocalStorage(snapshot);
      const formData = prepareFormDataForSend(form);

      // 6. send if access_key present on form dataset; otherwise, skip sending but return ok.
      if (!form.dataset || !form.dataset.accessKey) {
        console.warn('No access key found on form (data-access-key). Skipping network send.');
        form.dispatchEvent(new CustomEvent('web3forms:success', { detail: { message: 'Local save + PDF complete (no network send configured)' } }));
        alert('Submission saved locally and PDF generated. (No server key configured.)');
        return;
      }

      // show loading indicator (very simple)
      const originalLabel = submitButtons.length ? submitButtons[0].textContent : null;
      submitButtons.forEach(b => b.textContent = 'Sending...');

      const sendResult = await sendToEndpoint(formData);
      if (!sendResult.ok) {
        form.dispatchEvent(new CustomEvent('web3forms:error', { detail: { message: sendResult.error } }));
        alert('Submission failed: ' + sendResult.error);
        return;
      }

      // success
      form.dispatchEvent(new CustomEvent('web3forms:success', { detail: sendResult.result }));
      alert('Submission sent successfully!');
      form.reset();

    } catch (err) {
      console.error(err);
      form.dispatchEvent(new CustomEvent('web3forms:error', { detail: { message: String(err) } }));
      alert('Unexpected error: ' + String(err));
    } finally {
      submitButtons.forEach(b => {
        b.disabled = false;
        if (b.textContent === 'Sending...') b.textContent = 'Submit';
      });
    }
  }

  // Setup numeric-only enforcement and auto-advance for parts
  function setupInputEnhancements(form) {
    // numeric-only handler (input event) that preserves caret
    function numericOnlyHandler(e) {
      const el = e.target;
      const old = el.value;
      const cleaned = old.replace(/\D+/g, '');
      if (cleaned !== old) {
        const pos = el.selectionStart - (old.length - cleaned.length);
        el.value = cleaned;
        try { el.setSelectionRange(Math.max(0, pos), Math.max(0, pos)); } catch (err) {}
      }
    }

    // auto-advance helper: when length reached, focus next
    function setupAutoAdvance(fromName, toName, maxLen) {
      const from = getControl(form, fromName);
      const to = getControl(form, toName);
      if (!from || !to) return;
      from.addEventListener('input', () => {
        if (from.value && from.value.length >= maxLen) {
          try { to.focus(); } catch (e) {}
        }
      });
    }

    // attach numeric only to configured parts
    const numericParts = COMBINED_FIELDS.flatMap(g => g.names);
    new Set(numericParts).forEach(name => {
      const el = getControl(form, name);
      if (el) el.addEventListener('input', numericOnlyHandler);
    });

    // example auto-advance mappings based on parts length assumptions
    // TIN parts: 5-5-3 (example) — adjust as per your HTML
    setupAutoAdvance('tin1', 'tin2', 5);
    setupAutoAdvance('tin2', 'tin3', 5);
    // dob: mm(2)->dd(2)->yyyy(4)
    setupAutoAdvance('dobMonth', 'dobDay', 2);
    setupAutoAdvance('dobDay', 'dobYear', 2);
    // phone
    setupAutoAdvance('phone1', 'phone2', 3);
    setupAutoAdvance('phone2', 'phone3', 3);
    // zip
    setupAutoAdvance('zip5', 'zip4', 5);
  }

  // Initialize on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form[name="LongValidation"]') || document.querySelector('form');
    if (!form) {
      console.warn('No form found on page. Aborting form-to-pdf wiring.');
      return;
    }

    // idempotent attach
    if (form.dataset.__formToPdfAttached) return;
    form.dataset.__formToPdfAttached = '1';

    form.addEventListener('submit', handleFormSubmit);

    // attach basic success/error listeners to show inline messages (optional)
    form.addEventListener('web3forms:success', (e) => {
      console.info('web3forms:success', e.detail);
    });
    form.addEventListener('web3forms:error', (e) => {
      console.warn('web3forms:error', e.detail);
    });

    setupInputEnhancements(form);

    // expose helpers for debugging safely under a namespace
    window.__formToPdfHelpers = {
      validateForm: (f) => validateForm(f || form),
      buildSnapshot: (f) => buildSubmissionSnapshot(f || form),
      prepareFormData: (f) => prepareFormDataForSend(f || form)
    };
  });

})();
