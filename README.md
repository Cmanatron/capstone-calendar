# Capstone Calendar

Requires Node.js 18 or newer. No dependency installation is needed.

1. Run node JsonParser.js (or npm run build) to generate Calendar.json and Events.json.
2. Serve this folder over HTTP, for example with python -m http.server 8000.
3. Open http://localhost:8000/Calendar_Application.html or http://localhost:8000/calendar.html.

With an empty LINK in config.json, generation reads every CSV file in CSV/.
Set LINK to a CSV export URL to use that spreadsheet instead. The download finishes
before events are generated; download errors stop generation without replacing existing data.

YEAR defaults to the current year when null. Set it to a number to generate another
year. Explicit years in dates are preserved. Supported dates include April 30,
Apr 30 2027, 4/30/2027, and 2027-04-30. Events use date-only values and are all-day.
Rows with missing dates, wildcards such as *, or invalid dates are skipped with a
warning. Supply actual dates for these rows; recurrence rules cannot be inferred
from a wildcard. Regenerate after changing inputs and before publishing the site,
including the generated JSON files in the deployed folder.

Run regression checks with node --test JsonParser.test.js (or npm test).
