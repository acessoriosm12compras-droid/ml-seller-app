/**
 * Downloads data as a CSV file with UTF-8 BOM (for correct Excel rendering in pt-BR).
 *
 * @param {string} filename   e.g. "top-produtos-2026-05.csv"
 * @param {string[]} headers  Column headers
 * @param {(string|number|null)[][]} rows  Array of rows (each row is an array of values)
 */
export function downloadCSV(filename, headers, rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    // Wrap in quotes if the value contains commas, quotes or newlines
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ]

  // ﻿ = UTF-8 BOM so Excel opens it correctly
  const blob = new Blob(['﻿' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Returns today's date formatted as YYYY-MM-DD for filenames */
export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
