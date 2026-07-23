export const VMRS_CODE_TYPES = [
  "SYSTEM",
  "ASSEMBLY",
  "COMPONENT",
  "REASON",
  "WORK_ACCOMPLISHED",
  "POSITION",
  "OTHER",
];

const HEADER_ALIASES = {
  code: [
    "code",
    "vmrs_code",
    "code_number",
    "code_no",
  ],

  code_type: [
    "code_type",
    "type",
    "vmrs_code_type",
    "category",
  ],

  description: [
    "description",
    "code_description",
    "desc",
    "name",
  ],

  parent_code: [
    "parent_code",
    "parent",
    "parent_vmrs_code",
  ],

  hierarchy_level: [
    "hierarchy_level",
    "level",
    "hierarchy",
  ],

  full_code: [
    "full_code",
    "complete_code",
  ],

  system_code: [
    "system_code",
    "system",
  ],

  assembly_code: [
    "assembly_code",
    "assembly",
  ],

  component_code: [
    "component_code",
    "component",
  ],

  reason_code: [
    "reason_code",
    "reason",
  ],

  work_accomplished_code: [
    "work_accomplished_code",
    "work_accomplished",
    "work_code",
    "work_performed_code",
  ],

  position_code: [
    "position_code",
    "position",
  ],

  effective_date: [
    "effective_date",
    "start_date",
  ],

  retired_date: [
    "retired_date",
    "end_date",
  ],

  is_active: [
    "is_active",
    "active",
    "status",
  ],
};

const REQUIRED_FIELDS = [
  "code",
  "code_type",
  "description",
];

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeCode(value) {
  return cleanText(value).toUpperCase();
}

function normalizeCodeType(value) {
  return cleanText(value)
    .toUpperCase()
    .replace(/[\s\-\/]+/g, "_")
    .replace(/_+/g, "_");
}

function parseBoolean(value) {
  const normalized = cleanText(value).toLowerCase();

  if (!normalized) return true;

  if (
    ["true", "yes", "y", "1", "active"].includes(normalized)
  ) {
    return true;
  }

  if (
    ["false", "no", "n", "0", "inactive", "retired"].includes(
      normalized,
    )
  ) {
    return false;
  }

  return null;
}

function parseInteger(value) {
  const normalized = cleanText(value);

  if (!normalized) return null;

  if (!/^-?\d+$/.test(normalized)) {
    return Number.NaN;
  }

  return Number.parseInt(normalized, 10);
}

function isValidIsoDate(value) {
  const normalized = cleanText(value);

  if (!normalized) return true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return false;
  }

  const date = new Date(`${normalized}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === normalized
  );
}

export function resolveVMRSHeaderMap(headers) {
  const availableHeaders = new Set(headers || []);
  const map = {};

  Object.entries(HEADER_ALIASES).forEach(
    ([canonical, aliases]) => {
      map[canonical] =
        aliases.find((alias) =>
          availableHeaders.has(alias),
        ) || null;
    },
  );

  return map;
}

function readMappedValue(
  rawRecord,
  headerMap,
  canonicalName,
) {
  const sourceHeader = headerMap[canonicalName];

  return sourceHeader
    ? rawRecord[sourceHeader]
    : "";
}

function buildNormalizedRow(
  parsedRow,
  headerMap,
  defaults,
) {
  const hierarchyLevel = parseInteger(
    readMappedValue(
      parsedRow.rawRecord,
      headerMap,
      "hierarchy_level",
    ),
  );

  const activeValue = parseBoolean(
    readMappedValue(
      parsedRow.rawRecord,
      headerMap,
      "is_active",
    ),
  );

  return {
    rowNumber: parsedRow.rowNumber,
    sourceLine: parsedRow.sourceLine,
    rawRecord: parsedRow.rawRecord,

    code: normalizeCode(
      readMappedValue(
        parsedRow.rawRecord,
        headerMap,
        "code",
      ),
    ),

    code_type: normalizeCodeType(
      readMappedValue(
        parsedRow.rawRecord,
        headerMap,
        "code_type",
      ),
    ),

    description: cleanText(
      readMappedValue(
        parsedRow.rawRecord,
        headerMap,
        "description",
      ),
    ),

    parent_code:
      normalizeCode(
        readMappedValue(
          parsedRow.rawRecord,
          headerMap,
          "parent_code",
        ),
      ) || null,

    hierarchy_level: hierarchyLevel,

    full_code:
      normalizeCode(
        readMappedValue(
          parsedRow.rawRecord,
          headerMap,
          "full_code",
        ),
      ) || null,

    system_code:
      normalizeCode(
        readMappedValue(
          parsedRow.rawRecord,
          headerMap,
          "system_code",
        ),
      ) || null,

    assembly_code:
      normalizeCode(
        readMappedValue(
          parsedRow.rawRecord,
          headerMap,
          "assembly_code",
        ),
      ) || null,

    component_code:
      normalizeCode(
        readMappedValue(
          parsedRow.rawRecord,
          headerMap,
          "component_code",
        ),
      ) || null,

    reason_code:
      normalizeCode(
        readMappedValue(
          parsedRow.rawRecord,
          headerMap,
          "reason_code",
        ),
      ) || null,

    work_accomplished_code:
      normalizeCode(
        readMappedValue(
          parsedRow.rawRecord,
          headerMap,
          "work_accomplished_code",
        ),
      ) || null,

    position_code:
      normalizeCode(
        readMappedValue(
          parsedRow.rawRecord,
          headerMap,
          "position_code",
        ),
      ) || null,

    effective_date:
      cleanText(
        readMappedValue(
          parsedRow.rawRecord,
          headerMap,
          "effective_date",
        ),
      ) ||
      defaults.effectiveDate ||
      null,

    retired_date:
      cleanText(
        readMappedValue(
          parsedRow.rawRecord,
          headerMap,
          "retired_date",
        ),
      ) || null,

    is_active: activeValue,
  };
}

function addMessage(
  messages,
  severity,
  code,
  message,
) {
  messages.push({
    severity,
    code,
    message,
  });
}

export function validateVMRSCatalog(
  parsedCatalog,
  options = {},
) {
  const headers = parsedCatalog?.headers || [];
  const sourceRows = parsedCatalog?.rows || [];

  const headerMap = resolveVMRSHeaderMap(headers);

  const missingRequiredHeaders = REQUIRED_FIELDS.filter(
    (field) => !headerMap[field],
  );

  if (missingRequiredHeaders.length) {
    return {
      isValid: false,
      headerMap,
      missingRequiredHeaders,
      acceptedRows: [],
      warningRows: [],
      rejectedRows: [],
      allRows: [],

      summary: {
        total: sourceRows.length,
        accepted: 0,
        warnings: 0,
        rejected: sourceRows.length,
        duplicateRows: 0,
        missingParents: 0,
        invalidTypes: 0,
      },

      fatalErrors: [
        `Missing required CSV column${
          missingRequiredHeaders.length === 1 ? "" : "s"
        }: ${missingRequiredHeaders.join(", ")}.`,
      ],
    };
  }

  const normalizedRows = sourceRows.map((row) =>
    buildNormalizedRow(row, headerMap, {
      effectiveDate: options.effectiveDate || null,
    }),
  );

  const codeIndex = new Map();
  const duplicateKeys = new Set();

  normalizedRows.forEach((row) => {
    const key = `${row.code_type}::${row.code}`;

    if (row.code && row.code_type) {
      if (codeIndex.has(key)) {
        duplicateKeys.add(key);
      } else {
        codeIndex.set(key, row);
      }
    }
  });

  const availableCodes = new Set(
    normalizedRows
      .filter((row) => row.code)
      .map((row) => row.code),
  );

  const existingCodes = new Set(
    (options.existingCodes || []).map((code) =>
      normalizeCode(code.code || code),
    ),
  );

  const validatedRows = normalizedRows.map((row) => {
    const messages = [];

    if (!row.code) {
      addMessage(
        messages,
        "ERROR",
        "MISSING_CODE",
        "Code is required.",
      );
    }

    if (!row.code_type) {
      addMessage(
        messages,
        "ERROR",
        "MISSING_CODE_TYPE",
        "Code type is required.",
      );
    } else if (
      !VMRS_CODE_TYPES.includes(row.code_type)
    ) {
      addMessage(
        messages,
        "ERROR",
        "INVALID_CODE_TYPE",
        `Unsupported code type: ${row.code_type}.`,
      );
    }

    if (!row.description) {
      addMessage(
        messages,
        "ERROR",
        "MISSING_DESCRIPTION",
        "Description is required.",
      );
    }

    if (row.code.length > 160) {
      addMessage(
        messages,
        "ERROR",
        "CODE_TOO_LONG",
        "Code exceeds 160 characters.",
      );
    }

    if (row.description.length > 500) {
      addMessage(
        messages,
        "WARNING",
        "LONG_DESCRIPTION",
        "Description exceeds 500 characters and should be reviewed.",
      );
    }

    if (Number.isNaN(row.hierarchy_level)) {
      addMessage(
        messages,
        "ERROR",
        "INVALID_HIERARCHY_LEVEL",
        "Hierarchy level must be a whole number.",
      );
    } else if (
      row.hierarchy_level !== null &&
      (
        row.hierarchy_level < 1 ||
        row.hierarchy_level > 20
      )
    ) {
      addMessage(
        messages,
        "ERROR",
        "INVALID_HIERARCHY_LEVEL",
        "Hierarchy level must be between 1 and 20.",
      );
    }

    if (
      row.parent_code &&
      row.parent_code === row.code
    ) {
      addMessage(
        messages,
        "ERROR",
        "SELF_PARENT",
        "A code cannot be its own parent.",
      );
    } else if (
      row.parent_code &&
      !availableCodes.has(row.parent_code) &&
      !existingCodes.has(row.parent_code)
    ) {
      addMessage(
        messages,
        options.allowMissingParents
          ? "WARNING"
          : "ERROR",
        "MISSING_PARENT",
        `Parent code ${row.parent_code} was not found in this file or the current catalog.`,
      );
    }

    if (!isValidIsoDate(row.effective_date)) {
      addMessage(
        messages,
        "ERROR",
        "INVALID_EFFECTIVE_DATE",
        "Effective date must use YYYY-MM-DD format.",
      );
    }

    if (!isValidIsoDate(row.retired_date)) {
      addMessage(
        messages,
        "ERROR",
        "INVALID_RETIRED_DATE",
        "Retired date must use YYYY-MM-DD format.",
      );
    }

    if (row.is_active === null) {
      addMessage(
        messages,
        "WARNING",
        "UNKNOWN_ACTIVE_VALUE",
        "Active status was not recognized and will default to active.",
      );

      row.is_active = true;
    }

    const duplicateKey =
      `${row.code_type}::${row.code}`;

    if (
      row.code &&
      row.code_type &&
      duplicateKeys.has(duplicateKey)
    ) {
      addMessage(
        messages,
        "ERROR",
        "DUPLICATE_CODE",
        `Duplicate ${row.code_type} code ${row.code} appears in the file.`,
      );
    }

    const hasError = messages.some(
      (message) => message.severity === "ERROR",
    );

    const hasWarning = messages.some(
      (message) => message.severity === "WARNING",
    );

    const validationStatus = hasError
      ? "REJECTED"
      : hasWarning
        ? "WARNING"
        : "VALID";

    return {
      ...row,
      validationStatus,
      validationMessages: messages,
    };
  });

  const acceptedRows = validatedRows.filter(
    (row) => row.validationStatus === "VALID",
  );

  const warningRows = validatedRows.filter(
    (row) => row.validationStatus === "WARNING",
  );

  const rejectedRows = validatedRows.filter(
    (row) => row.validationStatus === "REJECTED",
  );

  return {
    isValid: rejectedRows.length === 0,
    headerMap,
    missingRequiredHeaders: [],
    acceptedRows,
    warningRows,
    rejectedRows,
    allRows: validatedRows,

    summary: {
      total: validatedRows.length,
      accepted: acceptedRows.length,
      warnings: warningRows.length,
      rejected: rejectedRows.length,

      duplicateRows: validatedRows.filter((row) =>
        row.validationMessages.some(
          (message) =>
            message.code === "DUPLICATE_CODE",
        ),
      ).length,

      missingParents: validatedRows.filter((row) =>
        row.validationMessages.some(
          (message) =>
            message.code === "MISSING_PARENT",
        ),
      ).length,

      invalidTypes: validatedRows.filter((row) =>
        row.validationMessages.some(
          (message) =>
            message.code === "INVALID_CODE_TYPE",
        ),
      ).length,
    },

    fatalErrors: [],
  };
}

export function createVMRSValidationReportCsv(
  validationResult,
) {
  const rows = validationResult?.allRows || [];

  const escapeCsv = (value) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;

  const lines = [
    [
      "row_number",
      "status",
      "code",
      "code_type",
      "description",
      "messages",
    ]
      .map(escapeCsv)
      .join(","),
  ];

  rows
    .filter(
      (row) =>
        row.validationStatus !== "VALID",
    )
    .forEach((row) => {
      lines.push(
        [
          row.rowNumber,
          row.validationStatus,
          row.code,
          row.code_type,
          row.description,
          row.validationMessages
            .map((message) => message.message)
            .join(" | "),
        ]
          .map(escapeCsv)
          .join(","),
      );
    });

  return lines.join("\n");
}