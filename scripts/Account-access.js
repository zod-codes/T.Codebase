const acct = document.querySelector('input[name="UserID"]');
const continuebtn = document.querySelector('button.action');
const url = "../HTML_pages/UN-AccountCreate.html";


continuebtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (document.querySelector('#error')) {
        return;
    };
    const obj = JSON.parse(localStorage.getItem('formSubmissionData'));

    if (obj.UserID === acct.value) {
        const link = document.createElement("a");
        link.href = url;
        // link.target = '_blank';
        link.click();
        link.remove();
        acct.value = "";
        console.log('Passed', obj);
    } else {
        console.log('failed', obj, obj.UserID);
        const errorEl = document.createElement('p');
        errorEl.style.color = 'red'
        errorEl.id = 'error'
        errorEl.textContent = 'Error logging in, the account inputed does not match what\'s in our database.'
        document.querySelector('form#Login').appendChild(errorEl);
        setTimeout(function () {
            document.querySelector('form#Login').removeChild(errorEl);
            errorEl.remove();
        }, 3000)
    };
});