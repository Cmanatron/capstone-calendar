const fs = require('node:fs');
const path = require('node:path');

// Read complete records so quoted commas, escaped quotes, and newlines survive.
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let closedQuote = false;
    text = text.replace(/^\uFEFF/, '');

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    quoted = false;
                    closedQuote = true;
                }
            } else {
                field += char;
            }
        } else if (char === ',' || char === '\n' || char === '\r') {
            row.push(field);
            field = '';
            closedQuote = false;
            if (char !== ',') {
                rows.push(row);
                row = [];
                if (char === '\r' && text[i + 1] === '\n') i++;
            }
        } else if (char === '"' && field === '' && !closedQuote) {
            quoted = true;
        } else if (closedQuote || char === '"') {
            throw new Error('Malformed CSV quoting');
        } else {
            field += char;
        }
    }

    if (quoted) throw new Error('Unterminated quoted CSV field');
    if (field !== '' || row.length || closedQuote) rows.push([...row, field]);
    return rows;
}

const months = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

function parseDue(value, defaultYear) {
    let year = defaultYear;
    let month;
    let day;
    const input = value.trim();
    let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (match) {
        year = Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
    } else if ((match = /^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i.exec(input))) {
        month = months[match[1].toLowerCase()];
        day = Number(match[2]);
        if (match[3]) year = Number(match[3]);
    } else if ((match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(input))) {
        month = Number(match[1]);
        day = Number(match[2]);
        if (match[3]) year = Number(match[3]);
    } else {
        return null;
    }

    if (!Number.isInteger(year) || year < 1 || year > 9999 ||
        !Number.isInteger(month) || month < 1 || month > 12) return null;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > daysInMonth[month - 1]) return null;
    return [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

function toRecords(text, { year, source = 'CSV', warn = console.warn }) {
    const rows = parseCSV(text);
    const headerIndex = rows.findIndex(row => row.some(value => value.trim()));
    if (headerIndex < 0) return [];
    const keys = rows[headerIndex].map(key => {
        const normalized = key.trim().toLowerCase();
        return normalized === 'due' ? 'DUE' : normalized;
    });
    if (!keys.includes('DUE') || !keys.includes('title')) {
        throw new Error(source + ': CSV must contain DUE and title headers');
    }

    const records = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.every(value => !value.trim())) continue;
        const record = {};
        keys.forEach((key, index) => {
            if (key) record[key] = row[index]?.trim() || null;
        });
        const due = parseDue(record.DUE || '', year);
        if (!due) {
            warn(source + ', record ' + (i + 1) + ': skipped unsupported or missing DUE ' +
                JSON.stringify(record.DUE) + ' (' + (record.title || 'Untitled event') + ')');
            continue;
        }
        records.push({ ...record, DUE: due });
    }
    return records;
}

function toEvents(records) {
    return records.map(record => ({
        title: record.title || '(Untitled event)',
        start: record.DUE,
        allDay: true,
        url: record.form || null,
        description: record.notes || null,
        category: record.jurisdiction || null
    }));
}

async function generate({ rootDir = __dirname, fetchImpl = globalThis.fetch, warn = console.warn } = {}) {
    const settings = JSON.parse(fs.readFileSync(path.join(rootDir, 'config.json'), 'utf8'));
    const year = settings.YEAR ?? new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1 || year > 9999) {
        throw new Error('YEAR must be an integer between 1 and 9999, or null for the current year');
    }

    const target = (settings.LINK || '').trim();
    const sources = [];
    if (target) {
        const response = await fetchImpl(target);
        if (!response.ok) throw new Error('Spreadsheet download failed: HTTP ' + response.status);
        sources.push({ source: 'Spreadsheet', text: await response.text() });
    } else {
        const csvDir = path.join(rootDir, 'CSV');
        for (const entry of fs.readdirSync(csvDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.csv') {
                sources.push({ source: entry.name, text: fs.readFileSync(path.join(csvDir, entry.name), 'utf8') });
            }
        }
    }

    if (!sources.length) throw new Error('No CSV input files found');
    const records = sources.flatMap(input => toRecords(input.text, { year, source: input.source, warn }));
    const events = toEvents(records);
    fs.writeFileSync(path.join(rootDir, 'Calendar.json'), JSON.stringify(records, null, 2) + '\n');
    fs.writeFileSync(path.join(rootDir, 'Events.json'), JSON.stringify(events, null, 2) + '\n');
    return events;
}

if (require.main === module) {
    generate().then(events => {
        console.log('Generated ' + events.length + ' calendar events.');
    }).catch(error => {
        console.error('Calendar generation failed: ' + error.message);
        process.exitCode = 1;
    });
}

module.exports = { parseCSV, parseDue, toRecords, toEvents, generate };
