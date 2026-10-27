import * as XLSX from 'xlsx';
import { plainValue,displayLabel,vietnamDate } from './presentation';

export type ExportColumn = { key: string; label: string; format?: string };
function exportSheet(title: string, rows: Record<string, any>[], columns: ExportColumn[]) {
  const moneyColumns = columns.map((column, index) => column.format === 'money' ? index + 1 : -1).filter((index) => index >= 0);
  const values = [[title], [], ['STT', ...columns.map((column) => column.label)], ...rows.map((row, index) => [index + 1, ...columns.map((column) => {
    const value = row[column.key];
    if (column.format === 'date' && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return vietnamDate(value);
    if (column.format === 'status' || ['taxMode','direction','source','classification','paymentStatus'].includes(column.key)) return displayLabel(value);
    return typeof value === 'object' ? plainValue(value) : value ?? '';
  })]), ['Tổng cộng', ...columns.map((column, index) => moneyColumns.includes(index + 1) ? ['balance', 'taxDue', 'unitCost', 'unitPrice'].includes(column.key) ? (column.key === 'balance' ? [...new Map(rows.map((row) => [row.accountName || '', Number(row.balance || 0)])).values()].reduce((sum, value) => sum + value, 0) : column.key === 'taxDue' ? Number(rows[rows.length - 1]?.taxDue || 0) : '') : rows.reduce((sum, row) => sum + Number(row[column.key] || 0), 0) : '')]];
  const sheet = XLSX.utils.aoa_to_sheet(values);
  sheet['!cols'] = [{ wch: 8 }, ...columns.map((column) => ({ wch: Math.min(48, Math.max(20, column.label.length + 3)) }))];
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length } }];
  sheet['!autofilter'] = { ref: `A3:${XLSX.utils.encode_cell({ r: rows.length + 2, c: columns.length })}` };
  for (let r = 3; r < values.length; r++) for (const c of moneyColumns) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (cell) cell.z = '#,##0 "₫";[Red]-#,##0 "₫"';
  }
  return sheet;
}

export function exportExcel(title: string, rows: Record<string, any>[], columns: ExportColumn[], fileName = title) {
  exportBooks([{ code: title, title, rows, columns }], fileName);
}

export function exportBooks(books: { code: string; title: string; rows: Record<string, any>[]; columns: ExportColumn[] }[], fileName = 'FinWorkshop-S1-S7') {
  const workbook = XLSX.utils.book_new();
  for (const book of books) XLSX.utils.book_append_sheet(workbook, exportSheet(book.title, book.rows, book.columns), book.code.replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31));
  // SheetJS CE preserves number formats. Add header/title styles to its OOXML archive.
  const archive = XLSX.CFB.read(new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })), { type: 'array' });
  const styles = XLSX.CFB.find(archive, '/xl/styles.xml');
  if (styles) {
    let xml = new TextDecoder().decode(styles.content as Uint8Array);
    const fontCount = Number(xml.match(/<fonts count="(\d+)"/)?.[1]);
    const fillCount = Number(xml.match(/<fills count="(\d+)"/)?.[1]);
    const xfCount = Number(xml.match(/<cellXfs count="(\d+)"/)?.[1]);
    xml = xml.replace(/<fonts count="\d+"/, `<fonts count="${fontCount + 1}"`).replace('</fonts>', '<font><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/><b/></font></fonts>');
    xml = xml.replace(/<fills count="\d+"/, `<fills count="${fillCount + 1}"`).replace('</fills>', '<fill><patternFill patternType="solid"><fgColor rgb="FF244062"/><bgColor indexed="64"/></patternFill></fill></fills>');
    xml = xml.replace(/<cellXfs count="\d+"/, `<cellXfs count="${xfCount + 1}"`).replace('</cellXfs>', `<xf numFmtId="0" fontId="${fontCount}" fillId="${fillCount}" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>`);
    XLSX.CFB.utils.cfb_add(archive, '/xl/styles.xml', new TextEncoder().encode(xml));
    for (let index = 1; index <= books.length; index++) {
      const path = `/xl/worksheets/sheet${index}.xml`;
      const xmlSheet = XLSX.CFB.find(archive, path);
      if (!xmlSheet) continue;
      const sheetXml = new TextDecoder().decode(xmlSheet.content as Uint8Array).replace(/<c\b([^>]*\br="[A-Z]+(?:1|3)")([^>]*)>/g, (_match, a, b) => `<c${a}${b.replace(/\s+s="\d+"/, '')} s="${xfCount}">`);
      XLSX.CFB.utils.cfb_add(archive, path, new TextEncoder().encode(sheetXml));
    }
  }
  const blob = new Blob([XLSX.CFB.write(archive, { type: 'array', fileType: 'zip' }) as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `${fileName}.xlsx`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
