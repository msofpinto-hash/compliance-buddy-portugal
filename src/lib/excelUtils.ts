import ExcelJS from 'exceljs';

// ==================== TYPES ====================

export interface ColumnConfig {
  header: string;
  key: string;
  width?: number;
}

export interface SheetData {
  name: string;
  columns: ColumnConfig[];
  rows: Record<string, any>[];
}

// ==================== EXPORT UTILITIES ====================

/**
 * Creates and downloads an Excel file with multiple sheets
 */
export async function exportToExcel(
  sheets: SheetData[],
  fileName: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    
    // Set columns
    worksheet.columns = sheet.columns.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width || 15,
    }));
    
    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    };
    headerRow.border = {
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
    
    // Add data rows
    sheet.rows.forEach(row => {
      worksheet.addRow(row);
    });
  }
  
  // Generate buffer and download
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, fileName);
}

/**
 * Creates and downloads a simple Excel file with a single sheet
 */
export async function exportSimpleExcel(
  data: Record<string, any>[],
  columns: ColumnConfig[],
  sheetName: string,
  fileName: string
): Promise<void> {
  await exportToExcel([{ name: sheetName, columns, rows: data }], fileName);
}

function downloadBuffer(buffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ==================== IMPORT UTILITIES ====================

/**
 * Reads an Excel file and returns the data as JSON
 */
export async function readExcelFile(
  file: File
): Promise<{ sheets: Map<string, Record<string, any>[]>; firstSheet: Record<string, any>[] }> {
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  
  const sheets = new Map<string, Record<string, any>[]>();
  let firstSheet: Record<string, any>[] = [];
  let isFirst = true;
  
  workbook.eachSheet((worksheet) => {
    const data = worksheetToJson(worksheet);
    sheets.set(worksheet.name, data);
    if (isFirst) {
      firstSheet = data;
      isFirst = false;
    }
  });
  
  return { sheets, firstSheet };
}

/**
 * Reads Excel from ArrayBuffer
 */
export async function readExcelBuffer(
  buffer: ArrayBuffer
): Promise<{ sheets: Map<string, Record<string, any>[]>; firstSheet: Record<string, any>[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const sheets = new Map<string, Record<string, any>[]>();
  let firstSheet: Record<string, any>[] = [];
  let isFirst = true;
  
  workbook.eachSheet((worksheet) => {
    const data = worksheetToJson(worksheet);
    sheets.set(worksheet.name, data);
    if (isFirst) {
      firstSheet = data;
      isFirst = false;
    }
  });
  
  return { sheets, firstSheet };
}

/**
 * Reads Excel and returns raw array data (for custom parsing)
 */
export async function readExcelAsArray(
  file: File
): Promise<any[][]> {
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  
  const data: any[][] = [];
  worksheet.eachRow((row) => {
    const rowData: any[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      rowData.push(getCellValue(cell));
    });
    data.push(rowData);
  });
  
  return data;
}

function getCellValue(cell: ExcelJS.Cell): any {
  const value = cell.value;
  
  if (value === null || value === undefined) {
    return '';
  }
  
  // Handle rich text
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((rt: any) => rt.text).join('');
  }
  
  // Handle hyperlinks
  if (typeof value === 'object' && 'text' in value) {
    return value.text;
  }
  
  // Handle formulas
  if (typeof value === 'object' && 'result' in value) {
    return value.result;
  }
  
  // Handle dates
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  
  return value;
}

function worksheetToJson(worksheet: ExcelJS.Worksheet): Record<string, any>[] {
  const data: Record<string, any>[] = [];
  const headers: string[] = [];
  
  // Get headers from first row
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(getCellValue(cell) || `Column${colNumber}`);
  });
  
  // Get data from remaining rows
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row
    
    const rowData: Record<string, any> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) {
        rowData[header] = getCellValue(cell);
      }
    });
    
    // Only add row if it has some content
    if (Object.values(rowData).some(v => v !== '' && v !== null && v !== undefined)) {
      data.push(rowData);
    }
  });
  
  return data;
}
