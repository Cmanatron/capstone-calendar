const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseCSV, parseDue, toRecords, generate } = require('./JsonParser');

function fixture(t, settings = {}, files = {}) {
    const prefix = path.join(os.tmpdir(), 'capstone-calendar-test-');
    const rootDir = fs.mkdtempSync(prefix);
    t.after(() => {
        if (!path.resolve(rootDir).startsWith(path.resolve(prefix))) throw new Error('Unexpected fixture path');
        fs.rmSync(rootDir, { recursive: true, force: true });
    });
    fs.mkdirSync(path.join(rootDir, 'CSV'));
    fs.writeFileSync(path.join(rootDir, 'config.json'), JSON.stringify({ LINK: '', YEAR: 2031, ...settings }));
    for (const [name, contents] of Object.entries(files)) {
        fs.writeFileSync(path.join(rootDir, 'CSV', name), contents);
    }
    return rootDir;
}

test('CSV handles quoted titles, commas, escaped quotes, multiline fields, BOM and CRLF', () => {
    assert.deepEqual(parseCSV('\uFEFFtitle,notes,last\r\n"Quarterly Return","A, ""quoted""\nline",\r\n'), [
        ['title', 'notes', 'last'],
        ['Quarterly Return', 'A, "quoted"\nline', '']
    ]);
    assert.throws(() => parseCSV('"unfinished'), /Unterminated/);
    assert.throws(() => parseCSV('"closed"extra'), /Malformed/);
});

test('dates preserve explicit years, use configured years, and reject invented dates', () => {
    assert.equal(parseDue('April 30', 2031), '2031-04-30');
    assert.equal(parseDue('Apr 30 2027', 2031), '2027-04-30');
    assert.equal(parseDue('2028-02-29', 2031), '2028-02-29');
    assert.equal(parseDue('4/30/2027', 2031), '2027-04-30');
    for (const value of ['*', '', 'February 30', '2027-02-29', '2100-02-29', '2026-13-01', 'constructor 30']) {
        assert.equal(parseDue(value, 2031), null, value);
    }
});

test('repository sample produces 21 valid events and warns about three undated rows', () => {
    const warnings = [];
    const records = toRecords(fs.readFileSync(path.join(__dirname, 'CSV', 'Test.csv'), 'utf8'), {
        year: 2031, warn: message => warnings.push(message)
    });
    assert.equal(records.length, 21);
    assert.equal(warnings.length, 3);
    assert.equal(records[0].DUE, '2031-04-30');
    assert.equal(records[0].form, 'https://www.irs.gov/forms-pubs/about-form-941');
    assert.equal(records[0].notes, 'THE Payroll tax return form. Null quarters required, too.');
    assert.ok(!records.some(record => record.title === 'V-5 Monthly'));
});

test('empty LINK uses local files with separate headers and creates date-only all-day events', async t => {
    const rootDir = fixture(t, { LINK: '   ' }, {
        'first.csv': 'DUE,title,form,notes\nApril 30,"Quarterly Return",https://example.org,"A, B"\n',
        'second.export.CSV': 'title,DUE,notes\nOther,May 1,second\n'
    });
    const events = await generate({
        rootDir,
        fetchImpl: () => assert.fail('Empty LINK must not fetch')
    });
    assert.equal(events.length, 2);
    assert.equal(events[0].title, 'Quarterly Return');
    assert.equal(events[0].url, 'https://example.org');
    assert.equal(events[0].description, 'A, B');
    assert.equal(events[1].title, 'Other');
    assert.ok(events.every(event => event.allDay && /^2031-\d{2}-\d{2}$/.test(event.start)));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(rootDir, 'Events.json'), 'utf8')), events);
});

test('null YEAR uses the current year', async t => {
    const rootDir = fixture(t, { YEAR: null }, { 'input.csv': 'DUE,title\nApril 30,Current\n' });
    const events = await generate({ rootDir });
    assert.equal(events[0].start, new Date().getFullYear() + '-04-30');
});

test('spreadsheet download is consumed before generation and replaces the local source', async t => {
    const rootDir = fixture(t, { LINK: 'https://example.org/export.csv' }, {
        'local.csv': 'DUE,title\nApril 30,Local\n'
    });
    const events = await generate({
        rootDir,
        fetchImpl: async target => {
            assert.equal(target, 'https://example.org/export.csv');
            return {
                ok: true,
                text: async () => {
                    await Promise.resolve();
                    assert.ok(!fs.existsSync(path.join(rootDir, 'Events.json')));
                    return 'DUE,title\nMay 2,Downloaded\n';
                }
            };
        }
    });
    assert.deepEqual(events.map(event => event.title), ['Downloaded']);
    assert.equal(events[0].start, '2031-05-02');
});

test('failed downloads and invalid spreadsheet responses preserve previous output', async t => {
    const rootDir = fixture(t, {}, { 'input.csv': 'DUE,title\nApril 30,Existing\n' });
    await generate({ rootDir });
    const previous = fs.readFileSync(path.join(rootDir, 'Events.json'), 'utf8');
    fs.writeFileSync(path.join(rootDir, 'config.json'), JSON.stringify({ LINK: 'https://example.org/export.csv' }));
    for (const fetchImpl of [
        async () => ({ ok: false, status: 403 }),
        async () => { throw new Error('Network unavailable'); },
        async () => ({ ok: true, text: async () => '<html>Sign in</html>' })
    ]) {
        await assert.rejects(generate({ rootDir, fetchImpl }));
        assert.equal(fs.readFileSync(path.join(rootDir, 'Events.json'), 'utf8'), previous);
    }
});
