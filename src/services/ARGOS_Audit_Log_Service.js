import { supabase } from "../supabaseClient";

export const ARGOS_AUDIT_CATEGORIES = Object.freeze({
  AUTHENTICATION: "authentication",
  ASSET: "asset",
  REPAIR: "repair",
  DATA_MANAGEMENT: "data_management",
  ADMINISTRATION: "administration",
  CONFIGURATION: "configuration",
  SECURITY: "security",
  SYSTEM: "system",
});

export const ARGOS_AUDIT_OUTCOMES = Object.freeze({
  SUCCESS: "success",
  FAILURE: "failure",
  WARNING: "warning",
  DENIED: "denied",
});

export const ARGOS_AUDIT_SEVERITIES = Object.freeze({
  INFORMATION: "information",
  WARNING: "warning",
  CRITICAL: "critical",
});

const VALID_OUTCOMES = new Set(Object.values(ARGOS_AUDIT_OUTCOMES));
const VALID_SEVERITIES = new Set(Object.values(ARGOS_AUDIT_SEVERITIES));

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 250;
const MAX_TEXT_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 1000;

/**
 * Convert optional input into trimmed text.
 */
function cleanText(value, maximumLength = MAX_TEXT_LENGTH) {
  if (value === null || value === undefined) return null;

  const cleanedValue = String(value).trim();

  if (!cleanedValue) return null;

  return cleanedValue.slice(0, maximumLength);
}

/**
 * Normalize a role or enum-like value.
 */
function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

/**
 * Prevent common sensitive fields from being persisted in event metadata.
 */
function sanitizeAuditDetails(value, depth = 0) {
  if (depth > 6) {
    return "[Maximum audit detail depth reached]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitizeAuditDetails(item, depth + 1));
  }

  if (typeof value === "object") {
    const blockedKeys = new Set([
      "password",
      "newpassword",
      "confirmpassword",
      "access_token",
      "accesstoken",
      "refresh_token",
      "refreshtoken",
      "authorization",
      "apikey",
      "api_key",
      "secret",
      "token",
      "session",
    ]);

    return Object.entries(value).reduce((sanitizedObject, [key, item]) => {
      const normalizedKey = String(key)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");

      sanitizedObject[key] = blockedKeys.has(normalizedKey)
        ? "[REDACTED]"
        : sanitizeAuditDetails(item, depth + 1);

      return sanitizedObject;
    }, {});
  }

  if (typeof value === "string") {
    return value.slice(0, 4000);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value).slice(0, 4000);
}

function normalizeOutcome(value) {
  const normalizedValue = normalizeCode(value);

  return VALID_OUTCOMES.has(normalizedValue)
    ? normalizedValue
    : ARGOS_AUDIT_OUTCOMES.SUCCESS;
}

function normalizeSeverity(value) {
  const normalizedValue = normalizeCode(value);

  return VALID_SEVERITIES.has(normalizedValue)
    ? normalizedValue
    : ARGOS_AUDIT_SEVERITIES.INFORMATION;
}

/**
 * Resolve the authenticated user and their ARGOS profile.
 *
 * @returns {Promise<{
 *   userId: string,
 *   userEmail: string | null,
 *   userName: string | null,
 *   userRole: string | null,
 *   organizationId: string
 * }>}
 */
export async function resolveARGOSAuditIdentity() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ARGOS could not resolve the authenticated audit user.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id, full_name, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    throw new Error(
      "ARGOS could not resolve the authenticated user's organization profile."
    );
  }

  return {
    userId: user.id,
    userEmail: cleanText(user.email, 320),
    userName:
      cleanText(profile.full_name, 200) ||
      cleanText(user.email, 320) ||
      "ARGOS User",
    userRole: cleanText(profile.role, 80),
    organizationId: profile.organization_id,
  };
}

/**
 * Write one immutable audit event.
 *
 * Audit failures do not automatically throw because audit logging should not
 * interrupt a successful production workflow. Pass throwOnError when the
 * caller explicitly requires a rejected audit write to stop execution.
 */
export async function logARGOSAuditEvent({
  organizationId = null,
  userId = null,
  userName = null,
  userEmail = null,
  userRole = null,

  category,
  action,

  entityType = null,
  entityId = null,
  entityName = null,

  outcome = ARGOS_AUDIT_OUTCOMES.SUCCESS,
  severity = ARGOS_AUDIT_SEVERITIES.INFORMATION,

  summary = null,
  details = {},

  source = "web",
  requestId = null,

  resolveIdentity = true,
  throwOnError = false,
} = {}) {
  const normalizedCategory = normalizeCode(category);
  const normalizedAction = normalizeCode(action);

  if (!normalizedCategory) {
    const error = new Error("Audit category is required.");

    if (throwOnError) throw error;

    console.error("ARGOS audit event rejected:", error);
    return { data: null, error };
  }

  if (!normalizedAction) {
    const error = new Error("Audit action is required.");

    if (throwOnError) throw error;

    console.error("ARGOS audit event rejected:", error);
    return { data: null, error };
  }

  try {
    let resolvedIdentity = null;

    const identityIsIncomplete =
      !organizationId ||
      !userId ||
      !userName ||
      !userRole;

    if (resolveIdentity && identityIsIncomplete) {
      resolvedIdentity = await resolveARGOSAuditIdentity();
    }

    const resolvedOrganizationId =
      organizationId || resolvedIdentity?.organizationId;

    if (!resolvedOrganizationId) {
      throw new Error("Audit organization ID is required.");
    }

    const auditRecord = {
      organization_id: resolvedOrganizationId,

      user_id: userId || resolvedIdentity?.userId || null,
      user_name:
        cleanText(userName, 200) ||
        resolvedIdentity?.userName ||
        null,
      user_email:
        cleanText(userEmail, 320) ||
        resolvedIdentity?.userEmail ||
        null,
      user_role:
        cleanText(userRole, 80) ||
        resolvedIdentity?.userRole ||
        null,

      category: normalizedCategory,
      action: normalizedAction,

      entity_type: normalizeCode(entityType) || null,
      entity_id: cleanText(entityId, 500),
      entity_name: cleanText(entityName, 500),

      outcome: normalizeOutcome(outcome),
      severity: normalizeSeverity(severity),

      summary: cleanText(summary, MAX_SUMMARY_LENGTH),
      details: sanitizeAuditDetails(details) || {},

      source: normalizeCode(source) || "web",
      request_id: requestId || null,
    };

    const { data, error } = await supabase
      .from("audit_log")
      .insert(auditRecord)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return {
      data: mapARGOSAuditEvent(data),
      error: null,
    };
  } catch (error) {
    console.error("ARGOS audit event write failed:", error);

    if (throwOnError) {
      throw error;
    }

    return {
      data: null,
      error,
    };
  }
}

/**
 * Load organization-scoped audit events with filtering and pagination.
 */
export async function loadARGOSAuditEvents({
  organizationId,
  search = "",
  category = "",
  action = "",
  outcome = "",
  severity = "",
  userId = "",
  entityType = "",
  startDate = "",
  endDate = "",
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  if (!organizationId) {
    throw new Error("Organization ID is required to load audit events.");
  }

  const normalizedPage = Math.max(1, Number(page) || 1);
  const normalizedPageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)
  );

  const rangeStart = (normalizedPage - 1) * normalizedPageSize;
  const rangeEnd = rangeStart + normalizedPageSize - 1;

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const normalizedCategory = normalizeCode(category);
  const normalizedAction = normalizeCode(action);
  const normalizedOutcome = normalizeCode(outcome);
  const normalizedSeverity = normalizeCode(severity);
  const normalizedEntityType = normalizeCode(entityType);

  if (normalizedCategory) {
    query = query.eq("category", normalizedCategory);
  }

  if (normalizedAction) {
    query = query.eq("action", normalizedAction);
  }

  if (normalizedOutcome) {
    query = query.eq("outcome", normalizedOutcome);
  }

  if (normalizedSeverity) {
    query = query.eq("severity", normalizedSeverity);
  }

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (normalizedEntityType) {
    query = query.eq("entity_type", normalizedEntityType);
  }

  if (startDate) {
    const startDateValue = new Date(startDate);

    if (!Number.isNaN(startDateValue.getTime())) {
      query = query.gte("created_at", startDateValue.toISOString());
    }
  }

  if (endDate) {
    const endDateValue = new Date(endDate);

    if (!Number.isNaN(endDateValue.getTime())) {
      endDateValue.setHours(23, 59, 59, 999);
      query = query.lte("created_at", endDateValue.toISOString());
    }
  }

  const cleanedSearch = cleanText(search, 200);

  if (cleanedSearch) {
    const escapedSearch = cleanedSearch
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_")
      .replaceAll(",", " ");

    query = query.or(
      [
        `user_name.ilike.%${escapedSearch}%`,
        `user_email.ilike.%${escapedSearch}%`,
        `category.ilike.%${escapedSearch}%`,
        `action.ilike.%${escapedSearch}%`,
        `entity_name.ilike.%${escapedSearch}%`,
        `summary.ilike.%${escapedSearch}%`,
      ].join(",")
    );
  }

  const { data, error, count } = await query.range(
    rangeStart,
    rangeEnd
  );

  if (error) {
    throw error;
  }

  const totalEvents = count || 0;
  const totalPages = Math.max(
    1,
    Math.ceil(totalEvents / normalizedPageSize)
  );

  return {
    events: (data || []).map(mapARGOSAuditEvent),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalEvents,
    totalPages,
  };
}

/**
 * Load lightweight summary metrics for the Audit Log page.
 */
export async function loadARGOSAuditSummary({
  organizationId,
} = {}) {
  if (!organizationId) {
    throw new Error("Organization ID is required to load audit metrics.");
  }

  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();

  const [
    totalResponse,
    todayResponse,
    failedResponse,
    criticalResponse,
  ] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),

    supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", todayStart),

    supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("outcome", [
        ARGOS_AUDIT_OUTCOMES.FAILURE,
        ARGOS_AUDIT_OUTCOMES.DENIED,
      ]),

    supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("severity", ARGOS_AUDIT_SEVERITIES.CRITICAL),
  ]);

  const firstError =
    totalResponse.error ||
    todayResponse.error ||
    failedResponse.error ||
    criticalResponse.error;

  if (firstError) {
    throw firstError;
  }

  return {
    totalEvents: totalResponse.count || 0,
    todayEvents: todayResponse.count || 0,
    failedEvents: failedResponse.count || 0,
    criticalEvents: criticalResponse.count || 0,
  };
}

/**
 * Load distinct values for Audit Log filter controls.
 */
export async function loadARGOSAuditFilterOptions({
  organizationId,
} = {}) {
  if (!organizationId) {
    throw new Error(
      "Organization ID is required to load audit filter options."
    );
  }

  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "category, action, outcome, severity, user_id, user_name, user_email"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw error;
  }

  const records = data || [];

  const uniqueValues = (values) =>
    [...new Set(values.filter(Boolean))].sort((first, second) =>
      String(first).localeCompare(String(second))
    );

  const userMap = new Map();

  records.forEach((record) => {
    if (!record.user_id) return;

    if (!userMap.has(record.user_id)) {
      userMap.set(record.user_id, {
        id: record.user_id,
        name:
          record.user_name ||
          record.user_email ||
          "Unknown User",
        email: record.user_email || "",
      });
    }
  });

  return {
    categories: uniqueValues(
      records.map((record) => record.category)
    ),
    actions: uniqueValues(
      records.map((record) => record.action)
    ),
    outcomes: uniqueValues(
      records.map((record) => record.outcome)
    ),
    severities: uniqueValues(
      records.map((record) => record.severity)
    ),
    users: [...userMap.values()].sort((first, second) =>
      first.name.localeCompare(second.name)
    ),
  };
}

/**
 * Convert Supabase snake_case records into application-friendly values.
 */
export function mapARGOSAuditEvent(record) {
  if (!record) return null;

  return {
    id: record.id,
    organizationId: record.organization_id,

    userId: record.user_id,
    userName: record.user_name,
    userEmail: record.user_email,
    userRole: record.user_role,

    category: record.category,
    action: record.action,

    entityType: record.entity_type,
    entityId: record.entity_id,
    entityName: record.entity_name,

    outcome: record.outcome,
    severity: record.severity,

    summary: record.summary,
    details: record.details || {},

    source: record.source,
    requestId: record.request_id,

    createdAt: record.created_at,
  };
}