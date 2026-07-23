const SUPPORTED_CODE_TYPES = new Set([
  "SYSTEM",
  "ASSEMBLY",
  "COMPONENT",
  "REASON",
  "WORK_ACCOMPLISHED",
  "POSITION",
  "OTHER",
]);

const HEADER_ALIASES = Object.freeze({
  code: ["code", "vmrs_code", "code_value"],
  description: ["description", "code_description", "vmrs_description", "name"],
  code_type: ["code_type", "type", "vmrs_type", "category"],
  parent_code: ["parent_code", "parent", "parent_vmrs_code"],
  parent_code_type: ["parent_code_type", "parent_type"],
  hierarchy_level: ["hierarchy_level", "level", "depth"],
  full_code: ["full_code", "complete_code"],
  system_code: ["system_code"],
  assembly_code: ["assembly_code"],
  component_code: ["component_code"],
  reason_code: ["reason_code"],
  work_accomplished_code: ["work_accomplished_code", "work_code"],
  position_code: ["position_code"],
  effective_date: ["effective_date"],
  retired_date: ["retired_date"],
  is_active: ["is_active", "active", "status"],
});

function clean(value) {
  return String(value ?? "").trim();
}

function readAlias(record, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, alias) && clean(record[alias])) {
      return clean(record[alias]);
    }
  }
  return "";
}

function normalizeType(value) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function normalizeActive(value) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return true;
  if (["true", "1", "yes", "y", "active", "enabled"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "inactive", "retired", "disabled"].includes(normalized)) return false;
  return null;
}

function identity(codeType, code) {
  return `${normalizeType(codeType)}::${clean(code).toUpperCase()}`;
}

function normalizedRowFromParsedRow(parsedRow) {
  const record = parsedRow.rawRecord || {};
  const normalized = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    normalized[field] = readAlias(record, aliases);
  }

  normalized.code = clean(normalized.code);
  normalized.description = clean(normalized.description);
  normalized.code_type = normalizeType(normalized.code_type);
  normalized.parent_code = clean(normalized.parent_code);
  normalized.parent_code_type = normalizeType(normalized.parent_code_type);
  normalized.hierarchy_level = normalized.hierarchy_level
    ? Number.parseInt(normalized.hierarchy_level, 10)
    : null;
  normalized.is_active = normalizeActive(normalized.is_active);

  return normalized;
}

function detectCircularParents(rowsByIdentity) {
  const circularKeys = new Set();

  for (const [startKey, row] of rowsByIdentity.entries()) {
    const visited = new Set([startKey]);
    let current = row;

    while (current?.normalizedRow?.parent_code) {
      const parentType = current.normalizedRow.parent_code_type ||
        (current.normalizedRow.code_type === "ASSEMBLY" ? "SYSTEM" :
          current.normalizedRow.code_type === "COMPONENT" ? "ASSEMBLY" : "");
      const parentKey = identity(parentType, current.normalizedRow.parent_code);
      if (!parentType || !rowsByIdentity.has(parentKey)) break;
      if (visited.has(parentKey)) {
        visited.forEach((key) => circularKeys.add(key));
        circularKeys.add(parentKey);
        break;
      }
      visited.add(parentKey);
      current = rowsByIdentity.get(parentKey);
    }
  }

  return circularKeys;
}

export function validateVMRSCatalog(parsedCatalog) {
  const headers = new Set(parsedCatalog?.headers || []);
  const hasRequiredHeader = (field) => HEADER_ALIASES[field].some((alias) => headers.has(alias));
  const missingHeaders = ["code", "description", "code_type"].filter(
    (field) => !hasRequiredHeader(field),
  );

  if (missingHeaders.length) {
    throw new Error(
      `The CSV is missing required column${missingHeaders.length === 1 ? "" : "s"}: ${missingHeaders.join(", ")}.`,
    );
  }

  const seen = new Map();
  const allRows = (parsedCatalog.rows || []).map((parsedRow) => {
    const normalizedRow = normalizedRowFromParsedRow(parsedRow);
    const messages = [];
    let validationStatus = "VALID";

    if (!normalizedRow.code) messages.push("Code is required.");
    if (!normalizedRow.description) messages.push("Description is required.");
    if (!SUPPORTED_CODE_TYPES.has(normalizedRow.code_type)) {
      messages.push(`Unsupported code type: ${normalizedRow.code_type || "blank"}.`);
    }
    if (normalizedRow.is_active === null) messages.push("Active status is not recognized.");
    if (normalizedRow.hierarchy_level !== null && (!Number.isInteger(normalizedRow.hierarchy_level) || normalizedRow.hierarchy_level < 0)) {
      messages.push("Hierarchy level must be a non-negative integer.");
    }

    const key = identity(normalizedRow.code_type, normalizedRow.code);
    if (normalizedRow.code && normalizedRow.code_type) {
      if (seen.has(key)) {
        messages.push(`Duplicate code/type combination also appears on row ${seen.get(key)}.`);
      } else {
        seen.set(key, parsedRow.rowNumber);
      }
    }

    if (messages.length) validationStatus = "REJECTED";

    return {
      rowNumber: parsedRow.rowNumber,
      sourceLine: parsedRow.sourceLine,
      rawRecord: parsedRow.rawRecord,
      normalizedRow,
      validationStatus,
      validationMessages: messages,
    };
  });

  const rowsByIdentity = new Map(
    allRows
      .filter((row) => row.validationStatus !== "REJECTED")
      .map((row) => [identity(row.normalizedRow.code_type, row.normalizedRow.code), row]),
  );

  for (const row of allRows) {
    if (row.validationStatus === "REJECTED" || !row.normalizedRow.parent_code) continue;
    const inferredParentType = row.normalizedRow.parent_code_type ||
      (row.normalizedRow.code_type === "ASSEMBLY" ? "SYSTEM" :
        row.normalizedRow.code_type === "COMPONENT" ? "ASSEMBLY" : "");
    if (!inferredParentType) {
      row.validationStatus = "WARNING";
      row.validationMessages.push("Parent code was supplied without a parent code type; the relationship may remain unresolved.");
      continue;
    }
    if (!rowsByIdentity.has(identity(inferredParentType, row.normalizedRow.parent_code))) {
      row.validationStatus = "WARNING";
      row.validationMessages.push(`Parent ${inferredParentType} code ${row.normalizedRow.parent_code} is not present in this file.`);
    }
  }

  const circularKeys = detectCircularParents(rowsByIdentity);
  if (circularKeys.size) {
    for (const row of allRows) {
      if (circularKeys.has(identity(row.normalizedRow.code_type, row.normalizedRow.code))) {
        row.validationStatus = "REJECTED";
        row.validationMessages.push("Circular parent relationship detected.");
      }
    }
  }

  const acceptedRows = allRows.filter((row) => row.validationStatus === "VALID");
  const warningRows = allRows.filter((row) => row.validationStatus === "WARNING");
  const rejectedRows = allRows.filter((row) => row.validationStatus === "REJECTED");

  return {
    allRows,
    acceptedRows,
    warningRows,
    rejectedRows,
    summary: {
      total: allRows.length,
      accepted: acceptedRows.length,
      warnings: warningRows.length,
      rejected: rejectedRows.length,
    },
  };
}

export default validateVMRSCatalog;
