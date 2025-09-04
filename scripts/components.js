'use strict';

// TreasuryDierct Setup Scripts


// Focus outline hiding for mouse users
(function () {
  window.addEventListener('mousedown', function (event) {
    document.body.setAttribute('data-mouse-active', '');
  });

  window.addEventListener('keydown', function (event) {
    document.body.removeAttribute('data-mouse-active');
  });
})();


// Tooltips

$(function () {
  $('[data-toggle="tooltip"]').tooltip();
});


// Forms

(function () {
  window.addEventListener('load', function () {
    var forms = document.getElementsByClassName('needs-validation');
    var validation = Array.prototype.filter.call(forms, function (form) {
      form.addEventListener('submit', function (event) {
        if (form.checkValidity() === false) {
          event.preventDefault();
          event.stopPropagation();
        }
        form.classList.add('was-validated');
      }, false);
    });
  }, false);
})();


// Interest Calculator

(function () {
  window.addEventListener('load', function () {
    var forms = document.getElementsByClassName('interest-calculator');
    var validation = Array.prototype.filter.call(forms, function (form) {
      var initialInvestmentAmount = form.querySelector('[name="initial-investment-amount"]');
      var expectedInterestRate = form.querySelector('[name="expected-interest-rate"]');
      var periodicInvestment = form.querySelector('[name="periodic-investment"]');
      var howOften = form.querySelector('[name="how-often"]');
      var yearsInvested = form.querySelector('[name="years-invested"]');
      var yourFederalTaxRate = form.querySelector('[name="your-federal-tax-rate"]');
      var preTax = form.querySelector('.pre-tax');
      var postTax = form.querySelector('.post-tax');
      function calculateResult(withoutTaxes) {
        var netRateOfReturn = parseFloat(expectedInterestRate.value) * (withoutTaxes ? 1 : 1 - parseInt(yourFederalTaxRate.value) / 100);
        var rateOfReturnPerCycle = netRateOfReturn / 12;
        var compoundIterations = 12 * parseInt(yearsInvested.value);
        var initialGrowth = parseFloat(initialInvestmentAmount.value) * Math.pow(1 + rateOfReturnPerCycle, compoundIterations);
        var periodicGrowth = parseFloat(periodicInvestment.value) * (parseFloat(howOften.value) / 12) * (Math.pow(1 + rateOfReturnPerCycle, compoundIterations) - 1) / rateOfReturnPerCycle;
        return (Math.round((initialGrowth + periodicGrowth) * 100) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      }
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (form.checkValidity() !== false) {
          form.classList.add('was-validated');
          preTax.innerText = calculateResult(true);
          postTax.innerText = calculateResult();
        }
      }, false);
      preTax.innerText = calculateResult(true);
      postTax.innerText = calculateResult();
    });
  }, false);
})();


// Log In (pass params from homepage login box to /log-in/ page)

(function () {
  window.addEventListener('load', function () {
    var accountNumber = document.getElementById('id-accno-942752');
    var queryString = window.location.search;
    var urlParams = new URLSearchParams(queryString);
    if (urlParams.has('accno')) {
      accountNumber.value = urlParams.get('accno');
    }
  }, false);
})();


/**
 * Extract input and select elements inside a form and return structured info.
 * Usage:
 *   const controls = extractFormControls('form[name="LongValidation"]');
 *   console.log(controls);
 *
 * Returns: Array of objects with { name, tag, type, value, checked (if radio/checkbox),
 *           options (for select), selectedOptions, element }.
 */
function extractFormControls(formSelectorOrElement) {
    // Resolve the form element (accepts selector string or DOM element)
    const formElement = typeof formSelectorOrElement === 'string'
        ? document.querySelector(formSelectorOrElement)
        : formSelectorOrElement;

    if (!formElement || formElement.tagName !== 'FORM') {
        throw new Error('A form element or valid form selector must be provided.');
    }

    // Query only input and select elements inside the form
    const controlElements = Array.from(formElement.querySelectorAll('input, select'));

    // Map DOM elements to serializable info objects
    const formControls = controlElements.map((controlElement) => {
        const tagName = controlElement.tagName.toLowerCase();
        const controlInfo = {
            name: controlElement.name || null,
            tag: tagName,                      // "input" or "select"
            type: controlElement.type || null, // e.g. "text", "radio", etc. (for inputs)
            element: controlElement            // raw DOM element (useful for later DOM ops)
        };

        if (tagName === 'select') {
            // Collect options and which ones are selected
            const optionList = Array.from(controlElement.options).map(opt => ({
                value: opt.value,
                text: opt.text,
                selected: opt.selected
            }));
            controlInfo.multiple = controlElement.multiple;
            controlInfo.options = optionList;
            controlInfo.selectedOptions = optionList.filter(o => o.selected);
        } else { // input
            if (controlElement.type === 'checkbox' || controlElement.type === 'radio') {
                controlInfo.checked = controlElement.checked;
                controlInfo.value = controlElement.value;
            } else {
                controlInfo.value = controlElement.value;
            }
        }

        return controlInfo;
    });

    return formControls;
};

// Example: extract controls from the uploaded form named "LongValidation"
const controls = extractFormControls(formEl);
console.log('Extracted form controls:', controls);
