/** RFC 4180 CSV with spreadsheet-formula injection protection (cells starting with = + - @ are prefixed with ' ). */
const guardFormula = (value) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
export const csvCell = (value) => `"${guardFormula(String(value ?? '')).replaceAll('"', '""')}"`;
export const toCsv = (rows) => rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
