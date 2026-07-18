// ARGOS™ Sprint 001O – Phase 2
// Controlled identity service using secure Supabase RPC functions.
//
// All user-profile and account-status mutations remain server-controlled.
// The browser does not directly update protected profile fields.

import { supabase } from "../supabaseClient";

const VALID_ARGOS_ROLES = Object.freeze([
  "admin",
  "manager",
  "user",
  "technician",
]);

function requireProfileId(profileId) {
  const normalizedProfileId = String(profileId || "").trim();

  if (!normalizedProfileId) {
    throw new Error("A valid ARGOS profile ID is required.");
  }

  return normalizedProfileId;
}

function normalizeRole(role) {
  const normalizedRole = String(role || "")
    .trim()
    .toLowerCase();

  if (normalizedRole === "administrator") {
    return "admin";
  }

  return VALID_ARGOS_ROLES.includes(normalizedRole)
    ? normalizedRole
    : "";
}

function cleanRequiredText(value, fieldName) {
  const cleanedValue = String(value || "").trim();

  if (!cleanedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  return cleanedValue;
}

function cleanOptionalText(value) {
  const cleanedValue = String(value || "").trim();
  return cleanedValue || null;
}

function unwrapRpcResult(data) {
  return Array.isArray(data) ? data[0] : data;
}

function getRpcErrorMessage(error, fallbackMessage) {
  return (
    error?.message ||
    error?.details ||
    error?.hint ||
    fallbackMessage
  );
}

/**
 * Updates the editable fields of an organization-scoped ARGOS profile.
 *
 * Authorization and tenant enforcement are performed by the
 * argos_update_user_profile Supabase RPC.
 */
export async function updateArgosUserProfile(profileId, updates) {
  const targetProfileId = requireProfileId(profileId);
  const fullName = cleanRequiredText(
    updates?.full_name,
    "Full name",
  );
  const normalizedRole = normalizeRole(updates?.role);

  if (!normalizedRole) {
    throw new Error("A valid ARGOS role is required.");
  }

  const { data, error } = await supabase.rpc(
    "argos_update_user_profile",
    {
      target_profile_id: targetProfileId,
      new_full_name: fullName,
      new_role: normalizedRole,
      new_department_id:
        String(updates?.department_id || "").trim() || null,
      new_job_title: cleanOptionalText(updates?.job_title),
      new_phone: cleanOptionalText(updates?.phone),
    },
  );

  if (error) {
    console.error(
      "ARGOS controlled profile update failed:",
      error,
    );

    throw new Error(
      getRpcErrorMessage(
        error,
        "ARGOS could not update this user profile.",
      ),
    );
  }

  return unwrapRpcResult(data);
}

/**
 * Sets the active status of an ARGOS user profile.
 *
 * Authorization, organization scoping, self-protection, and final-active-
 * Administrator protection must also be enforced by the RPC.
 */
export async function setArgosUserActiveStatus(
  profileId,
  isActive,
) {
  const targetProfileId = requireProfileId(profileId);

  if (typeof isActive !== "boolean") {
    throw new Error(
      "A valid ARGOS account status is required.",
    );
  }

  const { data, error } = await supabase.rpc(
    "argos_set_user_active_status",
    {
      target_profile_id: targetProfileId,
      new_is_active: isActive,
    },
  );

  if (error) {
    console.error(
      "ARGOS controlled account status update failed:",
      error,
    );

    throw new Error(
      getRpcErrorMessage(
        error,
        "ARGOS could not update this user's account status.",
      ),
    );
  }

  return unwrapRpcResult(data);
}

/**
 * Suspends an eligible ARGOS user.
 *
 * This wrapper is provided for operation-specific interface code while
 * preserving setArgosUserActiveStatus as the underlying service function.
 */
export async function suspendArgosUser(profileId) {
  return setArgosUserActiveStatus(profileId, false);
}

/**
 * Restores an eligible suspended ARGOS user.
 *
 * This wrapper is provided for operation-specific interface code while
 * preserving setArgosUserActiveStatus as the underlying service function.
 */
export async function restoreArgosUser(profileId) {
  return setArgosUserActiveStatus(profileId, true);
}