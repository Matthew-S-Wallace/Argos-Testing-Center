// ARGOS™ Sprint 001N.4
// Controlled identity service using secure Supabase RPC functions.
//
// This file intentionally performs its own role normalization so that
// the identity service does not depend on another utility module.

import { supabase } from "../supabaseClient";

const VALID_ARGOS_ROLES = [
  "admin",
  "manager",
  "user",
  "technician",
];

function requireProfileId(profileId) {
  if (!profileId) {
    throw new Error("A valid ARGOS profile ID is required.");
  }
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

function cleanOptionalText(value) {
  const cleanedValue = String(value || "").trim();
  return cleanedValue || null;
}

export async function updateArgosUserProfile(profileId, updates) {
  requireProfileId(profileId);

  const normalizedRole = normalizeRole(updates?.role);
  const fullName = String(updates?.full_name || "").trim();

  if (!fullName) {
    throw new Error("Full name is required.");
  }

  if (!normalizedRole) {
    throw new Error("A valid ARGOS role is required.");
  }

  const { data, error } = await supabase.rpc(
    "argos_update_user_profile",
    {
      target_profile_id: profileId,
      new_full_name: fullName,
      new_role: normalizedRole,
      new_department_id: updates?.department_id || null,
      new_job_title: cleanOptionalText(updates?.job_title),
      new_phone: cleanOptionalText(updates?.phone),
    }
  );

  if (error) {
    console.error(
      "ARGOS controlled profile update failed:",
      error
    );

    throw new Error(
      error.message ||
        "ARGOS could not update this user profile."
    );
  }

  return Array.isArray(data) ? data[0] : data;
}

export async function setArgosUserActiveStatus(
  profileId,
  isActive
) {
  requireProfileId(profileId);

  if (typeof isActive !== "boolean") {
    throw new Error(
      "A valid ARGOS account status is required."
    );
  }

  const { data, error } = await supabase.rpc(
    "argos_set_user_active_status",
    {
      target_profile_id: profileId,
      new_is_active: isActive,
    }
  );

  if (error) {
    console.error(
      "ARGOS controlled account status update failed:",
      error
    );

    throw new Error(
      error.message ||
        "ARGOS could not update this user's account status."
    );
  }

  return Array.isArray(data) ? data[0] : data;
}