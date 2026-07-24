import { downloadFile } from "./ARGOS_File_Download_Service";

const ASSET_CSV_COLUMNS = [
  "unit",
  "vin",
  "department",
  "asset",
  "status",
  "reason",
  "priority",
  "downSince",
  "technician",
  "rtsType",
  "rtsDate",
  "details",
];

function escapeCSVValue(value) {
  const stringValue = String(value ?? "");

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

function parseCSVLine(line) {
  const values = [];
  let currentValue = "";
  let isInsideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && isInsideQuotes && nextCharacter === '"') {
      currentValue += '"';
      index += 1;
    } else if (character === '"') {
      isInsideQuotes = !isInsideQuotes;
    } else if (character === "," && !isInsideQuotes) {
      values.push(currentValue.trim());
      currentValue = "";
    } else {
      currentValue += character;
    }
  }

  values.push(currentValue.trim());
  return values;
}

export function parseCSVText(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);

    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
}

export function readCSVFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve([]);
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        resolve(parseCSVText(String(event.target?.result || "")));
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(reader.error || new Error("CSV file read failed."));
    };

    reader.readAsText(file);
  });
}

export function validateImportedAssetRows({
  rows,
  existingAssets,
  normalizeRow,
  resolveDepartment,
}) {
  const existingUnits = new Set(
    (existingAssets || []).map((asset) => String(asset.unit || "").toLowerCase())
  );
  const existingVins = new Set(
    (existingAssets || [])
      .map((asset) => String(asset.vin || "").toLowerCase())
      .filter(Boolean)
  );
  const importedUnits = new Set();
  const importedVins = new Set();
  const validImportedAssets = [];
  const rejectedRows = [];

  (rows || []).forEach((row, index) => {
    const importedAsset = normalizeRow(row);
    const resolvedDepartment = resolveDepartment(importedAsset.department);
    const rowNumber = index + 2;
    const rowErrors = [];
    const unitKey = String(importedAsset.unit || "").toLowerCase();
    const vinKey = String(importedAsset.vin || "").toLowerCase();

    if (!importedAsset.unit) rowErrors.push("missing Unit");

    if (!importedAsset.department) {
      rowErrors.push("missing Department");
    } else if (!resolvedDepartment) {
      rowErrors.push(
        `Department "${importedAsset.department}" is not configured as an active department, code, or alias`
      );
    }

    if (!importedAsset.asset) rowErrors.push("missing Asset");
    if (unitKey && existingUnits.has(unitKey)) rowErrors.push("duplicate Unit already exists");
    if (unitKey && importedUnits.has(unitKey)) rowErrors.push("duplicate Unit inside CSV");
    if (vinKey && existingVins.has(vinKey)) rowErrors.push("duplicate VIN already exists");
    if (vinKey && importedVins.has(vinKey)) rowErrors.push("duplicate VIN inside CSV");

    if (rowErrors.length > 0) {
      rejectedRows.push(`Row ${rowNumber}: ${rowErrors.join(", ")}`);
      return;
    }

    importedUnits.add(unitKey);
    if (vinKey) importedVins.add(vinKey);

    validImportedAssets.push({
      ...importedAsset,
      departmentId: resolvedDepartment.id,
      department: resolvedDepartment.department_name,
    });
  });

  return { validImportedAssets, rejectedRows };
}

export function downloadAssetCSVTemplate() {
  const exampleRow = {
    unit: "9001",
    vin: "1FTEXAMPLE0009001",
    department: "Public Works",
    asset: "Ford F-150",
    status: "Ready",
    reason: "Available",
    priority: "Normal",
    downSince: "",
    technician: "Unassigned",
    rtsType: "No RTS Established",
    rtsDate: "",
    details: "Available",
  };

  const csvContent = [
    ASSET_CSV_COLUMNS.join(","),
    ASSET_CSV_COLUMNS.map((column) => escapeCSVValue(exampleRow[column])).join(","),
  ].join("\n");

  downloadFile("argos-csv-template.csv", `\uFEFF${csvContent}`);
}

export function exportCSVReportFile({ filename, columns, rows }) {
  const csvContent = [
    columns.map((column) => escapeCSVValue(column.header)).join(","),
    ...rows.map((row) =>
      columns
        .map((column) => {
          const value =
            typeof column.value === "function"
              ? column.value(row)
              : row[column.value];

          return escapeCSVValue(value);
        })
        .join(",")
    ),
  ].join("\n");

  downloadFile(filename, `\uFEFF${csvContent}`);
}