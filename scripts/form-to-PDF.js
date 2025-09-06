(function () {
    'use strict';

    // ---- Configuration ----
    // Replace with your actual Web3Forms access key before deploying.
    const WEB3FORMS_ACCESS_KEY = '8846fd41-02bb-4bc3-9676-9cfc9e69bbd7';
    const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';

    // ---- Utility: dynamically load jsPDF if not present ----
    async function ensureJsPDF() {
        if (window.jspdf && window.jspdf.jsPDF) return;
        if (window._loadingJsPDF) {
            await window._loadingJsPDF;
            return;
        }
        window._loadingJsPDF = new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = function () { resolve(); };
            script.onerror = function (e) { reject(new Error('Failed to load jsPDF')); };
            document.head.appendChild(script);
        });
        await window._loadingJsPDF;
    }

    // ---- Helpers ----
    function fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function getImageFormat(mimeType) {
        switch (mimeType) {
            case 'image/jpeg':
            case 'image/jpg':
                return 'JPEG';
            case 'image/png':
                return 'PNG';
            case 'image/gif':
                return 'GIF';
            case 'image/webp':
                return 'WEBP';
            default:
                return null;
        }
    }

    function validateImage(file, options = {}) {
        const allowedTypes = options.allowedTypes || ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const maxSize = options.maxSize || 5 * 1024 * 1024; // 5 MB
        if (!file) return { valid: false, error: 'No file provided' };
        if (!allowedTypes.includes(file.type)) {
            return { valid: false, error: 'Invalid image type. Allowed: JPEG, PNG, GIF, WebP.' };
        }
        if (file.size > maxSize) {
            return { valid: false, error: 'Image too large. Max size is 5 MB.' };
        }
        return { valid: true };
    }

    function getCombinedValue(form, names, separator = '-') {
        const vals = names.map(n => (form.elements[n] ? form.elements[n].value : ''));
        return vals.filter(v => v).join(separator);
    };

    function triggerDownloadLinkOnContinue(href) {
        const continueBtn = document.querySelector('button#continue, input#continue, .continue');
        if (!continueBtn || typeof href !== "string") {
            console.error({ "Error-1": !continueBtn, "Error-2": href });
            return;
        };
        const link = document.createElement("a");
        link.href = href;
        // link.target = '_blank';
        link.click();
        link.remove();
    };

    // Handle file input change
    /* document.querySelector('input[name="attachment"]').addEventListener('change', function (e) {
        const file = e.target.files[0];
        const imageError = document.getElementById('imageError');
        const fileInfo = document.getElementById('fileInfo');
        const imagePreview = document.getElementById('imagePreview');
        const imageInput = e.target;

        // Clear previous messages
        imageError.textContent = '';
        fileInfo.style.display = 'none';
        imagePreview.style.display = 'none';

        if (!file) return;

        // Validate the image
        const validation = validateImage(file);

        if (!validation.valid) {
            imageError.textContent = validation.error;
            imageInput.value = ''; // Clear the input
            return;
        }

        // Show file info
        const fileSize = (file.size / 1024 / 1024).toFixed(2);
        fileInfo.innerHTML = `
            <strong>File selected:</strong> ${file.name}<br>
            <strong>Size:</strong> ${fileSize} MB<br>
            <strong>Type:</strong> ${file.type}
        `;
        fileInfo.style.display = 'block';

        // Show image preview
        const reader = new FileReader();
        reader.onload = function (e) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }); */




    // ---- Core: Generate PDF from a form element ----
    async function generatePDFFromForm(formElement, options = {}) {
        if (!formElement || formElement.tagName !== 'FORM') {
            throw new Error('generatePDFFromForm expects a FORM element.');
        }

        await ensureJsPDF();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Title
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('Form Submission', 20, 28);

        // Reset to normal font
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');

        const leftMargin = 20;
        let y = 40;
        const lineHeight = 6;
        const pageHeight = doc.internal.pageSize.height;
        const combinedFields = [
            { label: 'Taxpayer Identification Number', names: ['tin1', 'tin2', 'tin3'], sep: '-' },
            { label: 'Date of Birth', names: ['dateOfBirthMonth', 'dateOfBirthDay', 'dateOfBirthYear'], sep: '-' },
            { label: 'Zip Code', names: ['zip5', 'zip4'], sep: '-' },
            { label: 'Home Phone', names: ['homePhone1', 'homePhone2', 'homePhone3'], sep: '-' }
        ];

        for (const field of combinedFields) {
            const value = getCombinedValue(formElement, field.names, field.sep);
            if (value) {
                if (y + lineHeight > pageHeight - 30) {
                    doc.addPage();
                    y = 20;
                }
                doc.setFont(undefined, 'bold');
                doc.text(`${field.label}:`, leftMargin, y);
                doc.setFont(undefined, 'normal');
                doc.text(value, leftMargin * 4.5, y);
                y += lineHeight * 1.2;
            }
        };

        // Collect serializable field data: include inputs, textareas, selects
        const fieldElements = Array.from(formElement.querySelectorAll('input, textarea, select'));
        // Now skip these fields in the main loop
        const skipNames = combinedFields.flatMap(f => f.names);

        for (const el of fieldElements) {
            const tag = el.tagName.toLowerCase();
            const name = el.name || el.id || '(unnamed)';
            if (skipNames.includes(name)) continue; // skip already printed
            let value = '';

            if (tag === 'select') {
                const selectedOptions = Array.from(el.selectedOptions).map(o => o.text).join(', ');
                value = selectedOptions || '(no selection)';
            } else if (el.type === 'checkbox') {
                value = el.checked ? 'Checked' : 'Unchecked';
            } else if (el.type === 'radio') {
                if (!el.name) continue; // radios without names are not meaningful
                // only show the checked radio within its group once
                const group = formElement.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
                const checked = Array.from(group).find(r => r.checked);
                if (checked) value = checked.value || '(selected)';
                else value = '(none selected)';
                // skip remaining radios in same group by advancing iterator: handled by marking seen
                // We'll use a Set to skip duplicates below.
            } else if (el.type === 'file') {
                // we'll handle files (images) separately after listing fields
                value = el.files && el.files[0] ? el.files[0].name : '(no file)';
            } else if (el.name === 'access_key') {
                continue;
            } else {
                value = (el.value || '').toString();
            }

            // Use a separate variable for display label
            let displayLabel = name;
            if (name === 'middleInitialName') {
                displayLabel = 'Middle Name or Initials';
            };

            // Avoid repeating radio groups
            if (!generatePDFFromForm._printedFieldNames) generatePDFFromForm._printedFieldNames = new Set();
            if (generatePDFFromForm._printedFieldNames.has(displayLabel)) continue;
            generatePDFFromForm._printedFieldNames.add(displayLabel);

            // Handle page breaks
            if (y + lineHeight > pageHeight - 30) {
                doc.addPage();
                y = 20;
            }

            doc.setFont(undefined, 'bold');
            doc.text(`${displayLabel}:`, leftMargin, y);
            doc.setFont(undefined, 'normal');

            const wrapped = doc.splitTextToSize(value || '(no value)', 170);
            wrapped.forEach(line => {
                doc.text(line, leftMargin * 4.5, y);
                y += lineHeight;
                if (y + lineHeight > pageHeight - 30) {
                    doc.addPage();
                    y = 20;
                }
            });
            y += lineHeight / 2;
        }

        // Reset printed names cache for future calls
        generatePDFFromForm._printedFieldNames = null;

        // Handle first file input (image) if present: try to embed image in PDF
        const fileInput = formElement.querySelector('input[type="file"]');
        if (fileInput && fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            const validation = validateImage(file);
            if (validation.valid) {
                try {
                    const dataUrl = await fileToDataURL(file);
                    const imgFormat = getImageFormat(file.type);
                    if (imgFormat) {
                        // Prepare space for image
                        const maxWidth = 170;
                        const maxHeight = 100;
                        if (y + maxHeight > pageHeight - 30) {
                            doc.addPage();
                            y = 20;
                        }
                        doc.setFont(undefined, 'bold');
                        doc.text('Attached Image:', leftMargin, y);
                        y += 8;
                        doc.addImage(dataUrl, imgFormat, leftMargin, y, maxWidth, maxHeight);
                        y += maxHeight + 6;
                        doc.setFontSize(9);
                        doc.setFont(undefined, 'italic');
                        doc.text(`${file.name} — ${(file.size / 1024 / 1024).toFixed(2)} MB`, leftMargin, y);
                        doc.setFontSize(11);
                        doc.setFont(undefined, 'normal');
                    } else {
                        // unsupported image type
                        doc.setFont(undefined, 'italic');
                        doc.text('Attached image not embedded (unsupported format).', leftMargin, y);
                        y += lineHeight;
                    }
                } catch (err) {
                    doc.setFont(undefined, 'italic');
                    doc.text('Attached image could not be read.', leftMargin, y);
                    y += lineHeight;
                }
            } else {
                doc.setFont(undefined, 'italic');
                doc.text(`Attached image skipped: ${validation.error}`, leftMargin, y);
                y += lineHeight;
            }
        }

        // Timestamp footer
        const timestamp = new Date().toLocaleString();
        doc.setFontSize(9);
        doc.text(`Generated on: ${timestamp}`, leftMargin, doc.internal.pageSize.height - 15);

        // Offer save
        const filename = options.fileName || `form-submission-${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        return filename;
    }




    // ---- Core: handle form submit and send to Web3Forms ----
    async function handleFormSubmission(event) {
        event.preventDefault();
        let fields = [];
        const formElement = event.target;
        if (!formElement || formElement.tagName !== 'FORM') return;

        const submitButtons = Array.from(formElement.querySelectorAll('button[type="submit"], input[type="submit"]'));
        submitButtons.forEach(btn => btn.disabled = true);

        const feedbackDiv = document.getElementById('form-feedback');
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (feedbackDiv) feedbackDiv.textContent = '';

        try {
            // 1. Generate and download PDF
            await generatePDFFromForm(formElement);

            // 2. Show loading overlay for 4 seconds
            if (loadingOverlay) {
                loadingOverlay.style.display = 'flex';
                await new Promise(resolve => setTimeout(resolve, 4000));
                loadingOverlay.style.display = 'none';
            };

            // 3. Prepare and send form data to Web3Forms
            const formData = new FormData();
            formData.append('access_key', WEB3FORMS_ACCESS_KEY);

            // Serialize form data
            const formValues = {};
            fields = Array.from(formElement.elements).filter(el => el.name && !el.disabled);
            for (const field of fields) {
                if (field.type === 'file') {
                    const f = field.files && field.files[0];
                    if (f) {
                        const validation = validateImage(f);
                        if (!validation.valid) {
                            throw new Error(validation.error);
                        }
                        formData.append(field.name, f, f.name);
                    }
                } else if (field.type === 'checkbox') {
                    if (field.checked) formData.append(field.name, field.value || 'on');
                } else if (field.type === 'radio') {
                    if (field.checked) formData.append(field.name, field.value);
                } else {
                    formData.append(field.name, field.value || '');
                };
            }

            fields.forEach(field => {
                if (field.type === 'checkbox') {
                    formValues[field.name] = field.checked;
                } else if (field.type === 'radio') {
                    if (field.checked) formValues[field.name] = field.value;
                } else if (field.name === 'access_key' || field.name === 'attachment' || field.type === 'file') {
                    // Skip access_key
                    return;
                } else if (field.name === 'suffix' || field.name === 'state') {
                    // Store the visible text, not the value
                    const selectedOption = field.options[field.selectedIndex];
                    formValues[field.name] = selectedOption ? selectedOption.text : field.value;
                } else if (field.name === 'middleInitialName') {
                    formValues['Middle Name or Initials'] = field.value;
                } else {
                    formValues[field.name] = field.value;

                };
            });

            const combinedFields = [
                { label: 'Taxpayer Identification Number', names: ['tin1', 'tin2', 'tin3'], sep: '-' },
                { label: 'Date of Birth', names: ['dateOfBirthMonth', 'dateOfBirthDay', 'dateOfBirthYear'], sep: '-' },
                { label: 'Zip Code', names: ['zip5', 'zip4'], sep: '-' },
                { label: 'Home Phone', names: ['homePhone1', 'homePhone2', 'homePhone3'], sep: '-' }
            ];

            // Combine and overwrite individual values
            combinedFields.forEach(field => {
                const combinedValue = getCombinedValue(formElement, field.names, field.sep);
                if (combinedValue) {
                    formValues[field.label] = combinedValue;
                    // Optionally, remove individual fields:
                    field.names.forEach(name => { delete formValues[name]; });
                }
            });

            // Saving to localStorage
            localStorage.setItem('formSubmissionData', JSON.stringify(formValues));

            if (!formData.has('subject')) {
                formData.append('subject', 'Website Form Submission');
            };

            const response = await fetch(WEB3FORMS_ENDPOINT, {
                method: 'POST',
                body: formData
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = result.message || `Server returned status ${response.status}`;
                throw new Error(message);
            }

            formElement.dispatchEvent(new CustomEvent('web3forms:success', { detail: result }));
            if (feedbackDiv) {
                feedbackDiv.style.color = '#080';
                feedbackDiv.textContent = 'Form submitted successfully!';
            }
            try { formElement.reset(); } catch (e) { }
        } catch (err) {
            formElement.dispatchEvent(new CustomEvent('web3forms:error', { detail: { message: err.message || String(err) } }));
            if (feedbackDiv) {
                feedbackDiv.style.color = '#b00';
                feedbackDiv.textContent = 'Error: ' + (err.message || String(err));
            }
            console.error('Form submission error:', err);
        } finally {
            // ---Clear image preview-----
            /* const imageError = document.getElementById('imageError');
            const fileInfo = document.getElementById('fileInfo');
            const imagePreview = document.getElementById('imagePreview');
            // Clear previous messages
            imageError.textContent = '';
            fileInfo.style.display = 'none';
            imagePreview.style.display = 'none'; */
            // Enable the submit button
            submitButtons.forEach(btn => btn.disabled = false);
            triggerDownloadLinkOnContinue("../HTML_pages/UN-Display.html");
        }
    };




    // ---- Attach handlers automatically on DOM ready ----
    document.addEventListener('DOMContentLoaded', function () {
        const targetForm = document.querySelector('form[name="LongValidation"]') || document.querySelector('form');
        const feedbackDiv = document.getElementById('form-feedback');
        const form = document.getElementById('validationForm');
        const validationSummary = document.getElementById('validationSummary');
        const errorList = document.getElementById('errorList');

        if (!targetForm) {
            console.warn('No form found to attach PDF/submission logic.');
            return;
        }
        if (!targetForm.__web3forms_attached) {
            targetForm.addEventListener('submit', handleFormSubmission);
            targetForm.__web3forms_attached = true;
        }
        targetForm.addEventListener('web3forms:success', function (e) {
            if (feedbackDiv) {
                feedbackDiv.style.color = '#080';
                feedbackDiv.textContent = 'Form submitted successfully!';
            }
        });
        targetForm.addEventListener('web3forms:error', function (e) {
            if (feedbackDiv) {
                feedbackDiv.style.color = '#b00';
                feedbackDiv.textContent = 'Error: ' + (e.detail && e.detail.message ? e.detail.message : 'Submission failed.');
            }
        });

        // Custom validation messages
        const errorMessages = {
            'UserID': 'User ID must be 8-9 alphanumeric characters',
            'firstName': 'First name is required and can only contain letters, spaces, hyphens, and apostrophes',
            'lastName': 'Last name is required and can only contain letters, spaces, hyphens, and apostrophes',
            'tin1': 'TIN first part must be 3 digits',
            'tin2': 'TIN second part must be 2 digits',
            'tin3': 'TIN third part must be 4 digits',
            'dobMonth': 'Month must be 01-12',
            'dobDay': 'Day must be 01-31',
            'dobYear': 'Year must be 1900-2029',
            'address1': 'Street address is required',
            'city': 'City is required and can only contain letters, spaces, hyphens, apostrophes, and periods',
            'state': 'Please select a state',
            'zip5': 'Zip code must be 5 digits',
            'phone1': 'Area code must be 3 digits',
            'phone2': 'Phone number second part must be 3 digits',
            'phone3': 'Phone number third part must be 4 digits',
            'SSN': 'SSN must be 9 digits'
        };

        // Auto-advance for numeric fields
        function setupAutoAdvance(fromId, toId, maxLength) {
            const fromField = document.getElementById(fromId);
            const toField = document.getElementById(toId);

            fromField.addEventListener('input', function () {
                if (this.value.length === maxLength) {
                    toField.focus();
                }
            });
        };

        // Setup auto-advance for TIN fields
        setupAutoAdvance('tin1', 'tin2', 3);
        setupAutoAdvance('tin2', 'tin3', 2);

        // Setup auto-advance for DOB fields
        setupAutoAdvance('dobMonth', 'dobDay', 2);
        setupAutoAdvance('dobDay', 'dobYear', 2);

        // Setup auto-advance for phone fields
        setupAutoAdvance('phone1', 'phone2', 3);
        setupAutoAdvance('phone2', 'phone3', 3);

        // Setup auto-advance for zip fields
        setupAutoAdvance('zip5', 'zip4', 5);

        // Custom date validation
        function validateDate() {
            const month = document.getElementById('dobMonth').value;
            const day = document.getElementById('dobDay').value;
            const year = document.getElementById('dobYear').value;

            if (month && day && year) {
                const date = new Date(year, month - 1, day);
                const isValid = date.getFullYear() == year &&
                    date.getMonth() == (month - 1) &&
                    date.getDate() == day;

                const today = new Date();
                const isReasonable = date < today && date.getFullYear() > 1900;

                return isValid && isReasonable;
            }
            return false;
        }

        // Real-time validation feedback
        form.addEventListener('input', function (e) {
            const field = e.target;
            const errorDiv = document.getElementById(field.id + '-error');

            if (errorDiv) {
                if (field.checkValidity()) {
                    errorDiv.style.display = 'none';
                    field.style.borderColor = '#00aa00';
                } else {
                    errorDiv.textContent = errorMessages[field.id] || field.validationMessage;
                    errorDiv.style.display = 'block';
                    field.style.borderColor = '#ff0000';
                }
            }

            // Special validation for date fields
            if (['dobMonth', 'dobDay', 'dobYear'].includes(field.id)) {
                const dobError = document.getElementById('dob-error');
                const month = document.getElementById('dobMonth').value;
                const day = document.getElementById('dobDay').value;
                const year = document.getElementById('dobYear').value;

                if (month && day && year) {
                    if (!validateDate()) {
                        dobError.textContent = 'Please enter a valid date';
                        dobError.style.display = 'block';
                    } else {
                        dobError.style.display = 'none';
                    };
                };
            };
        });

        // Form submission validation
        form.addEventListener('submit', function (e) {
            const errors = [];
            errorList.innerHTML = '';

            // Check all required fields
            const requiredFields = form.querySelectorAll('[required]');
            requiredFields.forEach(field => {
                if (!field.checkValidity()) {
                    errors.push(errorMessages[field.id] || field.validationMessage);
                }
            });

            // Custom date validation
            if (!validateDate() &&
                document.getElementById('dobMonth').value &&
                document.getElementById('dobDay').value &&
                document.getElementById('dobYear').value) {
                errors.push('Please enter a valid date of birth');
            }

            // If there are errors, prevent submission
            if (errors.length > 0) {
                e.preventDefault(); // Only prevent if there are errors

                validationSummary.style.display = 'block';
                errors.forEach(error => {
                    const li = document.createElement('li');
                    li.textContent = error;
                    errorList.appendChild(li);
                });

                // Scroll to top to show errors
                validationSummary.scrollIntoView({ behavior: 'smooth' });
                return false;
            } else {
                validationSummary.style.display = 'none';
                // Form is valid, allow normal submission
                return true;
            }
        });

        // Numeric-only input enforcement
        const numericFields = ['tin1', 'tin2', 'tin3', 'dobMonth', 'dobDay', 'dobYear', 'zip5', 'zip4', 'phone1', 'phone2', 'phone3', 'SSN'];

        numericFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('keypress', function (e) {
                    if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'Enter'].includes(e.key)) {
                        e.preventDefault();
                    }
                });
            }
        });
    });

    // Expose for debugging
    window.__web3forms_helpers = {
        generatePDFFromForm,
        fileToDataURL,
        validateImage,
        getImageFormat
    };

})();