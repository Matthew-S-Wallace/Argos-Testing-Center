import { supabase } from "../../supabaseClient";

/*
 * ARGOS™ VMRS Database Import Service
 * Sprint 001Y.3 — VMRS Database Import Service
 *
 * Responsibilities:
 * - Validate import-service input
 * - Create an import batch
 * - Preserve validation results in staging
 * - Promote accepted and warning rows into vmrs_codes
 * - Support MERGE and REPLACE behavior
 * - Resolve VMRS parent relationships
 * - Finalize or fail the import batch
 * - Preserve organization isolation on every operation
 *
 * Important:
 * This service intentionally avoids delete-first replacement behavior.
 * REPLACE mode promotes the new catalog first and only then deactivates
 * organization-scoped records that were not included in the new import.
 */

const TABLES = Object.freeze({
  CODES: "vmrs_codes",
  IMPORT_BATCHES: "vmrs_import_batches",
  IMPORT_STAGING: "vmrs_import_staging",
});

export const VMRS_IMPORT_MODES = Object.freeze({
  MERGE: "MERGE",
  REPLACE: "REPLACE",
});

/*
 * Keep database status values centralized.
 *
 * If the verified production schema uses different enum/check values,
 * change them here without rewriting the import workflow.
 */
export const VMRS_IMPORT_BATCH_STATUS = Object.freeze({
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

export const VMRS_VALIDATION_STATUS = Object.freeze({
  VALID: "VALID",
  WARNING: "WARNING",
  REJECTED: "REJECTED",
});

const DEFAULT_STAGING_BATCH_SIZE = 500;
const DEFAULT_PROMOTION_BATCH_SIZE = 250;
const DEFAULT_QUERY_PAGE_SIZE = 1000;
const DEFAULT_PARENT_UPDATE_CONCURRENCY = 20;

const CODE_SELECT_COLUMNS = [
  "id",
  "organization_id",
  "import_batch_id",
  "code",
  "code_type",
  "description",
  "parent_id",
  "hierarchy_level",
  "full_code",
  "system_code",
  "assembly_code",
  "component_code",
  "reason_code",
  "work_accomplished_code",
  "position_code",
  "source_name",
  "source_version",
  "effective_date",
  "retired_date",
  "is_active",
  "metadata",
].join(", ");

export class ARGOSVMRSImportError extends Error {
  constructor(message, options = {}) {
    super(message);

    this.name = "ARGOSVMRSImportError";
    this.stage = options.stage || "UNKNOWN";
    this.code = options.code || "VMRS_IMPORT_ERROR";
    this.batchId = options.batchId || null;
    this.cause = options.cause || null;
    this.details = options.details || null;
  }
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function nullableText(value) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function normalizeImportMode(value) {
  const normalized = cleanText(value).toUpperCase();

  if (
    normalized !== VMRS_IMPORT_MODES.MERGE &&
    normalized !== VMRS_IMPORT_MODES.REPLACE
  ) {
    return null;
  }

  return normalized;
}

function normalizeValidationStatus(value) {
  const normalized = cleanText(value).toUpperCase();

  if (
    normalized === VMRS_VALIDATION_STATUS.VALID ||
    normalized === "ACCEPTED"
  ) {
    return VMRS_VALIDATION_STATUS.VALID;
  }

  if (
    normalized === VMRS_VALIDATION_STATUS.WARNING ||
    normalized === "WARN"
  ) {
    return VMRS_VALIDATION_STATUS.WARNING;
  }

  if (
    normalized === VMRS_VALIDATION_STATUS.REJECTED ||
    normalized === "INVALID" ||
    normalized === "ERROR"
  ) {
    return VMRS_VALIDATION_STATUS.REJECTED;
  }

  return VMRS_VALIDATION_STATUS.VALID;
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = cleanText(value).toLowerCase();

  if (["true", "1", "yes", "y", "active"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n", "inactive", "retired"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return null;
  }

  const date = new Date(cleaned);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function getRowNumber(row, fallbackIndex) {
  return (
    normalizeInteger(
      row?.rowNumber ??
        row?.row_number ??
        row?.sourceLine ??
        row?.source_line ??
        row?.lineNumber ??
        row?.line_number
    ) || fallbackIndex + 1
  );
}

function getValidationMessages(row) {
  const messages =
    row?.validationMessages ??
    row?.validation_messages ??
    row?.messages ??
    row?.errors ??
    [];

  if (Array.isArray(messages)) {
    return messages;
  }

  if (messages === null || messages === undefined || messages === "") {
    return [];
  }

  return [messages];
}

function getRawRecord(row) {
  return (
    row?.rawRecord ??
    row?.raw_record ??
    row?.originalRow ??
    row?.original_row ??
    row?.raw ??
    row
  );
}

function getParentCode(row) {
  return nullableText(
    row?.parent_code ??
      row?.parentCode ??
      row?.parent ??
      row?.normalized?.parent_code ??
      row?.normalized?.parentCode
  );
}

function getParentCodeType(row) {
  return nullableText(
    row?.parent_code_type ??
      row?.parentCodeType ??
      row?.parent_type ??
      row?.parentType ??
      row?.normalized?.parent_code_type ??
      row?.normalized?.parentCodeType
  );
}

function getNormalizedRow(row) {
  return row?.normalizedRow ?? row?.normalized_row ?? row?.normalized ?? row;
}

function getCodeIdentityKey(codeType, code) {
  return `${cleanText(codeType).toUpperCase()}::${cleanText(code).toUpperCase()}`;
}

function chunkArray(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function getValidationSummary(validationResult) {
  const summary = validationResult?.summary || {};

  return {
    total:
      Number(summary.total) ||
      Number(validationResult?.allRows?.length) ||
      Number(validationResult?.rows?.length) ||
      0,
    accepted:
      Number(summary.accepted) ||
      Number(validationResult?.acceptedRows?.length) ||
      0,
    warnings:
      Number(summary.warnings) ||
      Number(summary.warning) ||
      Number(validationResult?.warningRows?.length) ||
      0,
    rejected:
      Number(summary.rejected) ||
      Number(validationResult?.rejectedRows?.length) ||
      0,
  };
}

function getAllValidationRows(validationResult) {
  if (Array.isArray(validationResult?.allRows)) {
    return validationResult.allRows;
  }

  const combinedRows = [
    ...(Array.isArray(validationResult?.acceptedRows)
      ? validationResult.acceptedRows
      : []),
    ...(Array.isArray(validationResult?.warningRows)
      ? validationResult.warningRows
      : []),
    ...(Array.isArray(validationResult?.rejectedRows)
      ? validationResult.rejectedRows
      : []),
  ];

  if (combinedRows.length > 0) {
    return combinedRows;
  }

  if (Array.isArray(validationResult?.rows)) {
    return validationResult.rows;
  }

  return [];
}

function getPromotableRows(validationResult) {
  if (
    Array.isArray(validationResult?.acceptedRows) ||
    Array.isArray(validationResult?.warningRows)
  ) {
    return [
      ...(Array.isArray(validationResult?.acceptedRows)
        ? validationResult.acceptedRows
        : []),
      ...(Array.isArray(validationResult?.warningRows)
        ? validationResult.warningRows
        : []),
    ];
  }

  return getAllValidationRows(validationResult).filter((row) => {
    const status = normalizeValidationStatus(
      row?.validationStatus ??
        row?.validation_status ??
        row?.status ??
        row?.classification
    );

    return (
      status === VMRS_VALIDATION_STATUS.VALID ||
      status === VMRS_VALIDATION_STATUS.WARNING
    );
  });
}

function validateServiceInput({
  organizationId,
  currentUserId,
  file,
  importMode,
  validationResult,
  allowRejectedRows,
}) {
  if (!cleanText(organizationId)) {
    throw new ARGOSVMRSImportError(
      "The VMRS catalog could not be imported because the organization was not identified.",
      {
        stage: "INPUT_VALIDATION",
        code: "MISSING_ORGANIZATION",
      }
    );
  }

  if (!cleanText(currentUserId)) {
    throw new ARGOSVMRSImportError(
      "The VMRS catalog could not be imported because the current user was not identified.",
      {
        stage: "INPUT_VALIDATION",
        code: "MISSING_CURRENT_USER",
      }
    );
  }

  if (!file || !cleanText(file.name)) {
    throw new ARGOSVMRSImportError(
      "Select a valid VMRS catalog file before beginning the import.",
      {
        stage: "INPUT_VALIDATION",
        code: "MISSING_FILE",
      }
    );
  }

  if (!validationResult || typeof validationResult !== "object") {
    throw new ARGOSVMRSImportError(
      "The VMRS catalog must be validated before it can be imported.",
      {
        stage: "INPUT_VALIDATION",
        code: "MISSING_VALIDATION_RESULT",
      }
    );
  }

  const normalizedImportMode = normalizeImportMode(importMode);

  if (!normalizedImportMode) {
    throw new ARGOSVMRSImportError(
      "Select either Merge or Replace as the VMRS import mode.",
      {
        stage: "INPUT_VALIDATION",
        code: "INVALID_IMPORT_MODE",
      }
    );
  }

  const allRows = getAllValidationRows(validationResult);

  if (allRows.length === 0) {
    throw new ARGOSVMRSImportError(
      "The validated VMRS file does not contain any importable rows.",
      {
        stage: "INPUT_VALIDATION",
        code: "EMPTY_VALIDATION_RESULT",
      }
    );
  }

  const summary = getValidationSummary(validationResult);

  if (summary.rejected > 0 && allowRejectedRows !== true) {
    throw new ARGOSVMRSImportError(
      `${summary.rejected} VMRS row${
        summary.rejected === 1 ? "" : "s"
      } failed validation. Resolve the rejected rows or explicitly permit an import that excludes them.`,
      {
        stage: "INPUT_VALIDATION",
        code: "REJECTED_ROWS_PRESENT",
        details: {
          rejectedCount: summary.rejected,
        },
      }
    );
  }

  const promotableRows = getPromotableRows(validationResult);

  if (promotableRows.length === 0) {
    throw new ARGOSVMRSImportError(
      "No accepted or warning VMRS rows are available for import.",
      {
        stage: "INPUT_VALIDATION",
        code: "NO_PROMOTABLE_ROWS",
      }
    );
  }

  return {
    normalizedImportMode,
    summary,
    allRows,
    promotableRows,
  };
}

async function createImportBatch({
  organizationId,
  currentUserId,
  file,
  sourceVersion,
  effectiveDate,
  importMode,
  validationSummary,
}) {
  const startedAt = new Date().toISOString();

  const payload = {
    organization_id: organizationId,
    original_filename: file.name,
    import_status: VMRS_IMPORT_BATCH_STATUS.PROCESSING,
    accepted_count: 0,
    warning_count: 0,
    rejected_count: validationSummary.rejected,
    created_by: currentUserId,
    started_at: startedAt,
    metadata: {
      source_version: nullableText(sourceVersion),
      effective_date: normalizeDate(effectiveDate),
      import_mode: importMode,
      file_size:
        typeof file.size === "number" && Number.isFinite(file.size)
          ? file.size
          : null,
      file_type: nullableText(file.type),
    },
  };

  const { data, error } = await supabase
    .from(TABLES.IMPORT_BATCHES)
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new ARGOSVMRSImportError(
      "ARGOS could not create the VMRS import batch.",
      {
        stage: "BATCH_CREATION",
        code: "BATCH_CREATION_FAILED",
        cause: error,
      }
    );
  }

  return {
    batchId: data.id,
    startedAt,
    initialMetadata: payload.metadata,
  };
}

function createStagingRecord({
  row,
  index,
  organizationId,
  batchId,
}) {
  const normalizedRow = getNormalizedRow(row);

  const validationStatus = normalizeValidationStatus(
    row?.validationStatus ??
      row?.validation_status ??
      row?.status ??
      row?.classification
  );

  return {
    organization_id: organizationId,
    import_batch_id: batchId,
    row_number: getRowNumber(row, index),
    raw_record: getRawRecord(row),
    code: nullableText(normalizedRow?.code),
    code_type: nullableText(
      normalizedRow?.code_type ?? normalizedRow?.codeType
    ),
    description: nullableText(normalizedRow?.description),
    parent_code: getParentCode(normalizedRow),
    hierarchy_level: normalizeInteger(
      normalizedRow?.hierarchy_level ?? normalizedRow?.hierarchyLevel
    ),
    validation_status: validationStatus,
    validation_messages: getValidationMessages(row),
  };
}

async function insertStagingRows({
  rows,
  organizationId,
  batchId,
  batchSize,
}) {
  const stagingRecords = rows.map((row, index) =>
    createStagingRecord({
      row,
      index,
      organizationId,
      batchId,
    })
  );

  const stagingChunks = chunkArray(stagingRecords, batchSize);
  let stagedCount = 0;

  for (const stagingChunk of stagingChunks) {
    const { error } = await supabase
      .from(TABLES.IMPORT_STAGING)
      .insert(stagingChunk);

    if (error) {
      throw new ARGOSVMRSImportError(
        "ARGOS could not preserve the validated VMRS rows in the import staging table.",
        {
          stage: "STAGING",
          code: "STAGING_INSERT_FAILED",
          batchId,
          cause: error,
          details: {
            stagedCount,
            attemptedChunkSize: stagingChunk.length,
          },
        }
      );
    }

    stagedCount += stagingChunk.length;
  }

  return stagedCount;
}

async function fetchOrganizationCodes({
  organizationId,
  pageSize = DEFAULT_QUERY_PAGE_SIZE,
}) {
  const records = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from(TABLES.CODES)
      .select(CODE_SELECT_COLUMNS)
      .eq("organization_id", organizationId)
      .range(from, to);

    if (error) {
      throw new ARGOSVMRSImportError(
        "ARGOS could not read the organization’s current VMRS catalog.",
        {
          stage: "PROMOTION",
          code: "EXISTING_CATALOG_QUERY_FAILED",
          cause: error,
        }
      );
    }

    const page = Array.isArray(data) ? data : [];
    records.push(...page);

    if (page.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return records;
}

function createPromotionRecord({
  row,
  organizationId,
  batchId,
  file,
  sourceVersion,
  effectiveDate,
}) {
  const normalizedRow = getNormalizedRow(row);

  const validationStatus = normalizeValidationStatus(
    row?.validationStatus ??
      row?.validation_status ??
      row?.status ??
      row?.classification
  );

  const code = nullableText(normalizedRow?.code);
  const codeType = nullableText(
    normalizedRow?.code_type ?? normalizedRow?.codeType
  );
  const description = nullableText(normalizedRow?.description);

  if (!code || !codeType || !description) {
    throw new ARGOSVMRSImportError(
      `A validated VMRS row is missing its code, code type, or description.`,
      {
        stage: "PROMOTION",
        code: "INVALID_PROMOTION_ROW",
        batchId,
        details: {
          rowNumber: getRowNumber(row, 0),
          code,
          codeType,
        },
      }
    );
  }

  const sourceRow = getRowNumber(row, 0);

  return {
    organization_id: organizationId,
    import_batch_id: batchId,
    code,
    code_type: codeType,
    description,
    parent_id: null,
    hierarchy_level: normalizeInteger(
      normalizedRow?.hierarchy_level ?? normalizedRow?.hierarchyLevel
    ),
    full_code: nullableText(
      normalizedRow?.full_code ?? normalizedRow?.fullCode
    ),
    system_code: nullableText(
      normalizedRow?.system_code ?? normalizedRow?.systemCode
    ),
    assembly_code: nullableText(
      normalizedRow?.assembly_code ?? normalizedRow?.assemblyCode
    ),
    component_code: nullableText(
      normalizedRow?.component_code ?? normalizedRow?.componentCode
    ),
    reason_code: nullableText(
      normalizedRow?.reason_code ?? normalizedRow?.reasonCode
    ),
    work_accomplished_code: nullableText(
      normalizedRow?.work_accomplished_code ??
        normalizedRow?.workAccomplishedCode
    ),
    position_code: nullableText(
      normalizedRow?.position_code ?? normalizedRow?.positionCode
    ),
    source_name: file.name,
    source_version: nullableText(sourceVersion),
    effective_date:
      normalizeDate(
        normalizedRow?.effective_date ?? normalizedRow?.effectiveDate
      ) || normalizeDate(effectiveDate),
    retired_date: normalizeDate(
      normalizedRow?.retired_date ?? normalizedRow?.retiredDate
    ),
    is_active: normalizeBoolean(
      normalizedRow?.is_active ?? normalizedRow?.isActive,
      true
    ),
    metadata: {
      ...(normalizedRow?.metadata &&
      typeof normalizedRow.metadata === "object" &&
      !Array.isArray(normalizedRow.metadata)
        ? normalizedRow.metadata
        : {}),
      source_row: sourceRow,
      validation_status: validationStatus,
      parent_code: getParentCode(normalizedRow),
      parent_code_type: getParentCodeType(normalizedRow),
      validation_messages: getValidationMessages(row),
    },
  };
}

async function insertNewCodes({
  records,
  batchId,
  batchSize,
}) {
  const insertedRecords = [];

  for (const recordChunk of chunkArray(records, batchSize)) {
    const { data, error } = await supabase
      .from(TABLES.CODES)
      .insert(recordChunk)
      .select(CODE_SELECT_COLUMNS);

    if (error) {
      throw new ARGOSVMRSImportError(
        "ARGOS could not insert the new VMRS catalog records.",
        {
          stage: "PROMOTION",
          code: "CODE_INSERT_FAILED",
          batchId,
          cause: error,
          details: {
            attemptedChunkSize: recordChunk.length,
          },
        }
      );
    }

    insertedRecords.push(...(Array.isArray(data) ? data : []));
  }

  return insertedRecords;
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function executeWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(
    Math.max(1, concurrency),
    Math.max(1, items.length)
  );

  await Promise.all(
    Array.from({ length: workerCount }, () => executeWorker())
  );

  return results;
}

async function updateExistingCodes({
  updates,
  organizationId,
  batchId,
}) {
  if (updates.length === 0) {
    return [];
  }

  return runWithConcurrency(
    updates,
    DEFAULT_PARENT_UPDATE_CONCURRENCY,
    async ({ id, payload }) => {
      const updatePayload = { ...payload };
      delete updatePayload.organization_id;

      const { data, error } = await supabase
        .from(TABLES.CODES)
        .update(updatePayload)
        .eq("id", id)
        .eq("organization_id", organizationId)
        .select(CODE_SELECT_COLUMNS)
        .single();

      if (error || !data) {
        throw new ARGOSVMRSImportError(
          `ARGOS could not update VMRS code ${payload.code}.`,
          {
            stage: "PROMOTION",
            code: "CODE_UPDATE_FAILED",
            batchId,
            cause: error,
            details: {
              codeId: id,
              code: payload.code,
              codeType: payload.code_type,
            },
          }
        );
      }

      return data;
    }
  );
}

async function promoteCatalogRows({
  rows,
  organizationId,
  batchId,
  file,
  sourceVersion,
  effectiveDate,
  promotionBatchSize,
}) {
  const existingCodes = await fetchOrganizationCodes({
    organizationId,
  });

  const existingByIdentity = new Map();

  for (const existingCode of existingCodes) {
    existingByIdentity.set(
      getCodeIdentityKey(existingCode.code_type, existingCode.code),
      existingCode
    );
  }

  const promotionRecords = rows.map((row) =>
    createPromotionRecord({
      row,
      organizationId,
      batchId,
      file,
      sourceVersion,
      effectiveDate,
    })
  );

  const incomingIdentityKeys = new Set();
  const inserts = [];
  const updates = [];

  for (const promotionRecord of promotionRecords) {
    const identityKey = getCodeIdentityKey(
      promotionRecord.code_type,
      promotionRecord.code
    );

    if (incomingIdentityKeys.has(identityKey)) {
      throw new ARGOSVMRSImportError(
        `The validated import contains more than one ${promotionRecord.code_type} record for code ${promotionRecord.code}.`,
        {
          stage: "PROMOTION",
          code: "DUPLICATE_PROMOTION_IDENTITY",
          batchId,
          details: {
            code: promotionRecord.code,
            codeType: promotionRecord.code_type,
          },
        }
      );
    }

    incomingIdentityKeys.add(identityKey);

    const existingRecord = existingByIdentity.get(identityKey);

    if (existingRecord) {
      updates.push({
        id: existingRecord.id,
        payload: promotionRecord,
      });
    } else {
      inserts.push(promotionRecord);
    }
  }

  const insertedRecords = await insertNewCodes({
    records: inserts,
    batchId,
    batchSize: promotionBatchSize,
  });

  const updatedRecords = await updateExistingCodes({
    updates,
    organizationId,
    batchId,
  });

  return {
    existingCodes,
    promotedRecords: [...insertedRecords, ...updatedRecords],
    incomingIdentityKeys,
    insertedCount: insertedRecords.length,
    updatedCount: updatedRecords.length,
  };
}

async function deactivateRecordsMissingFromReplacement({
  existingCodes,
  incomingIdentityKeys,
  organizationId,
  batchId,
}) {
  const staleIds = existingCodes
    .filter((record) => {
      const identityKey = getCodeIdentityKey(record.code_type, record.code);
      return !incomingIdentityKeys.has(identityKey);
    })
    .map((record) => record.id)
    .filter(Boolean);

  if (staleIds.length === 0) {
    return 0;
  }

  let deactivatedCount = 0;

  for (const idChunk of chunkArray(staleIds, 250)) {
    const { data, error } = await supabase
      .from(TABLES.CODES)
      .update({
        is_active: false,
        retired_date: new Date().toISOString().slice(0, 10),
      })
      .eq("organization_id", organizationId)
      .in("id", idChunk)
      .select("id");

    if (error) {
      throw new ARGOSVMRSImportError(
        "The new VMRS catalog was promoted, but ARGOS could not retire every record omitted from the replacement catalog.",
        {
          stage: "REPLACE_FINALIZATION",
          code: "STALE_CODE_DEACTIVATION_FAILED",
          batchId,
          cause: error,
          details: {
            attemptedChunkSize: idChunk.length,
            deactivatedCount,
          },
        }
      );
    }

    deactivatedCount += Array.isArray(data) ? data.length : 0;
  }

  return deactivatedCount;
}

function buildParentLookups(records) {
  const byTypedCode = new Map();
  const byCode = new Map();

  for (const record of records) {
    const code = cleanText(record?.code);
    const codeType = cleanText(record?.code_type);

    if (!code || !record?.id) {
      continue;
    }

    if (codeType) {
      byTypedCode.set(getCodeIdentityKey(codeType, code), record);
    }

    const codeOnlyKey = code.toUpperCase();
    const codeMatches = byCode.get(codeOnlyKey) || [];
    codeMatches.push(record);
    byCode.set(codeOnlyKey, codeMatches);
  }

  return {
    byTypedCode,
    byCode,
  };
}

function resolveParentRecord({
  parentCode,
  parentCodeType,
  lookups,
}) {
  if (!parentCode) {
    return null;
  }

  if (parentCodeType) {
    const typedMatch = lookups.byTypedCode.get(
      getCodeIdentityKey(parentCodeType, parentCode)
    );

    if (typedMatch) {
      return typedMatch;
    }
  }

  const codeMatches = lookups.byCode.get(parentCode.toUpperCase()) || [];

  if (codeMatches.length === 1) {
    return codeMatches[0];
  }

  return null;
}

async function resolveParentRelationships({
  organizationId,
  batchId,
}) {
  const allOrganizationCodes = await fetchOrganizationCodes({
    organizationId,
  });

  const lookups = buildParentLookups(allOrganizationCodes);

  const importedRecords = allOrganizationCodes.filter(
    (record) => record.import_batch_id === batchId
  );

  const parentUpdates = [];

  for (const childRecord of importedRecords) {
    const metadata =
      childRecord?.metadata &&
      typeof childRecord.metadata === "object" &&
      !Array.isArray(childRecord.metadata)
        ? childRecord.metadata
        : {};

    const parentCode = nullableText(metadata.parent_code);
    const parentCodeType = nullableText(metadata.parent_code_type);

    if (!parentCode) {
      continue;
    }

    const parentRecord = resolveParentRecord({
      parentCode,
      parentCodeType,
      lookups,
    });

    if (!parentRecord || parentRecord.id === childRecord.id) {
      continue;
    }

    parentUpdates.push({
      childId: childRecord.id,
      childCode: childRecord.code,
      parentId: parentRecord.id,
      parentCode: parentRecord.code,
    });
  }

  if (parentUpdates.length === 0) {
    return {
      resolvedCount: 0,
      unresolvedCount: importedRecords.filter((record) =>
        Boolean(record?.metadata?.parent_code)
      ).length,
    };
  }

  await runWithConcurrency(
    parentUpdates,
    DEFAULT_PARENT_UPDATE_CONCURRENCY,
    async (parentUpdate) => {
      const { error } = await supabase
        .from(TABLES.CODES)
        .update({
          parent_id: parentUpdate.parentId,
        })
        .eq("id", parentUpdate.childId)
        .eq("organization_id", organizationId)
        .eq("import_batch_id", batchId);

      if (error) {
        throw new ARGOSVMRSImportError(
          `ARGOS could not link VMRS code ${parentUpdate.childCode} to parent ${parentUpdate.parentCode}.`,
          {
            stage: "PARENT_RESOLUTION",
            code: "PARENT_LINK_UPDATE_FAILED",
            batchId,
            cause: error,
            details: parentUpdate,
          }
        );
      }
    }
  );

  const parentBearingRecordCount = importedRecords.filter((record) =>
    Boolean(record?.metadata?.parent_code)
  ).length;

  return {
    resolvedCount: parentUpdates.length,
    unresolvedCount: Math.max(
      0,
      parentBearingRecordCount - parentUpdates.length
    ),
  };
}

async function completeImportBatch({
  batchId,
  organizationId,
  summary,
  promotedCount,
  insertedCount,
  updatedCount,
  stagedCount,
  parentResolution,
  deactivatedCount,
  initialMetadata,
}) {
  const completedAt = new Date().toISOString();

  const payload = {
    import_status: VMRS_IMPORT_BATCH_STATUS.COMPLETED,
    accepted_count: summary.accepted,
    warning_count: summary.warnings,
    rejected_count: summary.rejected,
    completed_at: completedAt,
    metadata: {
      ...initialMetadata,
      staged_count: stagedCount,
      promoted_count: promotedCount,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      parent_links_resolved: parentResolution.resolvedCount,
      parent_links_unresolved: parentResolution.unresolvedCount,
      deactivated_count: deactivatedCount,
      completed_at: completedAt,
    },
  };

  const { error } = await supabase
    .from(TABLES.IMPORT_BATCHES)
    .update(payload)
    .eq("id", batchId)
    .eq("organization_id", organizationId);

  if (error) {
    throw new ARGOSVMRSImportError(
      "The VMRS catalog was promoted, but ARGOS could not finalize the import batch.",
      {
        stage: "BATCH_FINALIZATION",
        code: "BATCH_FINALIZATION_FAILED",
        batchId,
        cause: error,
      }
    );
  }

  return completedAt;
}

async function failImportBatch({
  batchId,
  organizationId,
  initialMetadata,
  error,
}) {
  if (!batchId || !organizationId) {
    return;
  }

  const failedAt = new Date().toISOString();

  const safeFailureMessage =
    error instanceof ARGOSVMRSImportError
      ? error.message
      : "An unexpected VMRS import error occurred.";

  const payload = {
    import_status: VMRS_IMPORT_BATCH_STATUS.FAILED,
    completed_at: failedAt,
    metadata: {
      ...(initialMetadata || {}),
      failure_stage:
        error instanceof ARGOSVMRSImportError ? error.stage : "UNKNOWN",
      failure_code:
        error instanceof ARGOSVMRSImportError
          ? error.code
          : "UNEXPECTED_IMPORT_ERROR",
      failure_message: safeFailureMessage,
      failed_at: failedAt,
    },
  };

  const { error: batchUpdateError } = await supabase
    .from(TABLES.IMPORT_BATCHES)
    .update(payload)
    .eq("id", batchId)
    .eq("organization_id", organizationId);

  if (batchUpdateError) {
    console.error(
      "ARGOS could not mark the VMRS import batch as failed.",
      batchUpdateError
    );
  }
}

function createApplicationSafeError(error, batchId) {
  if (error instanceof ARGOSVMRSImportError) {
    if (!error.batchId && batchId) {
      error.batchId = batchId;
    }

    return error;
  }

  return new ARGOSVMRSImportError(
    "ARGOS could not complete the VMRS catalog import. No other organization’s VMRS data was affected.",
    {
      stage: "UNKNOWN",
      code: "UNEXPECTED_IMPORT_ERROR",
      batchId,
      cause: error,
    }
  );
}

/**
 * Imports a validated VMRS catalog.
 *
 * @param {Object} input
 * @param {string} input.organizationId
 * @param {string} input.currentUserId
 * @param {File|Object} input.file
 * @param {string|null} input.sourceVersion
 * @param {string|null} input.effectiveDate
 * @param {"MERGE"|"REPLACE"} input.importMode
 * @param {Object} input.validationResult
 * @param {boolean} [input.allowRejectedRows=false]
 * @param {number} [input.stagingBatchSize=500]
 * @param {number} [input.promotionBatchSize=250]
 *
 * @returns {Promise<{
 *   success: boolean,
 *   batchId: string,
 *   importMode: string,
 *   acceptedCount: number,
 *   warningCount: number,
 *   rejectedCount: number,
 *   stagedCount: number,
 *   promotedCount: number,
 *   insertedCount: number,
 *   updatedCount: number,
 *   deactivatedCount: number,
 *   parentLinksResolved: number,
 *   parentLinksUnresolved: number,
 *   completedAt: string
 * }>}
 */
export async function importVMRSCatalog({
  organizationId,
  currentUserId,
  file,
  sourceVersion = null,
  effectiveDate = null,
  importMode,
  validationResult,
  allowRejectedRows = false,
  stagingBatchSize = DEFAULT_STAGING_BATCH_SIZE,
  promotionBatchSize = DEFAULT_PROMOTION_BATCH_SIZE,
}) {
  let batchId = null;
  let initialMetadata = null;

  const normalizedOrganizationId = cleanText(organizationId);
  const normalizedCurrentUserId = cleanText(currentUserId);

  try {
    const {
      normalizedImportMode,
      summary,
      allRows,
      promotableRows,
    } = validateServiceInput({
      organizationId: normalizedOrganizationId,
      currentUserId: normalizedCurrentUserId,
      file,
      importMode,
      validationResult,
      allowRejectedRows,
    });

    const batch = await createImportBatch({
      organizationId: normalizedOrganizationId,
      currentUserId: normalizedCurrentUserId,
      file,
      sourceVersion,
      effectiveDate,
      importMode: normalizedImportMode,
      validationSummary: summary,
    });

    batchId = batch.batchId;
    initialMetadata = batch.initialMetadata;

    const stagedCount = await insertStagingRows({
      rows: allRows,
      organizationId: normalizedOrganizationId,
      batchId,
      batchSize: Math.max(
        1,
        Number(stagingBatchSize) || DEFAULT_STAGING_BATCH_SIZE
      ),
    });

    const promotionResult = await promoteCatalogRows({
      rows: promotableRows,
      organizationId: normalizedOrganizationId,
      batchId,
      file,
      sourceVersion,
      effectiveDate,
      promotionBatchSize: Math.max(
        1,
        Number(promotionBatchSize) || DEFAULT_PROMOTION_BATCH_SIZE
      ),
    });

    const promotedCount = promotionResult.promotedRecords.length;

    let deactivatedCount = 0;

    if (normalizedImportMode === VMRS_IMPORT_MODES.REPLACE) {
      deactivatedCount = await deactivateRecordsMissingFromReplacement({
        existingCodes: promotionResult.existingCodes,
        incomingIdentityKeys: promotionResult.incomingIdentityKeys,
        organizationId: normalizedOrganizationId,
        batchId,
      });
    }

    const parentResolution = await resolveParentRelationships({
      organizationId: normalizedOrganizationId,
      batchId,
    });

    const completedAt = await completeImportBatch({
      batchId,
      organizationId: normalizedOrganizationId,
      summary,
      promotedCount,
      insertedCount: promotionResult.insertedCount,
      updatedCount: promotionResult.updatedCount,
      stagedCount,
      parentResolution,
      deactivatedCount,
      initialMetadata,
    });

    return {
      success: true,
      batchId,
      importMode: normalizedImportMode,
      acceptedCount: summary.accepted,
      warningCount: summary.warnings,
      rejectedCount: summary.rejected,
      stagedCount,
      promotedCount,
      insertedCount: promotionResult.insertedCount,
      updatedCount: promotionResult.updatedCount,
      deactivatedCount,
      parentLinksResolved: parentResolution.resolvedCount,
      parentLinksUnresolved: parentResolution.unresolvedCount,
      completedAt,
    };
  } catch (error) {
    const safeError = createApplicationSafeError(error, batchId);

    await failImportBatch({
      batchId,
      organizationId: normalizedOrganizationId,
      initialMetadata,
      error: safeError,
    });

    console.error("ARGOS VMRS import failed.", {
      batchId,
      stage: safeError.stage,
      code: safeError.code,
      cause: safeError.cause,
    });

    throw safeError;
  }
}

export default importVMRSCatalog;