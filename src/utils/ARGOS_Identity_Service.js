// ARGOS™ Sprint 001N.2
// Central identity operations for the profiles table.
//
// Application validation does not replace Supabase RLS.
// Administrator-only update policies must be installed before
// these functions are connected to live UI controls.

import { supabase } from "../supabaseClient";
import { normalizeArgosRole } from "./ARGOS_Roles";

function requireProfileId(profileId) {
  if (!profileId) {
    throw new Error("A valid ARGOS profile ID is required.");
  }
}

function cleanOptionalText(value) {
  const cleanedValue = String(value || "").trim();
  return cleanedValue || null;
}

function buildProfileUpdatePayload(updates) {
  const payload = {};

  if ("full_name" in updates) {
    payload.full_name = cleanOptionalText(updates.full_name);
  }

  if ("role" in updates) {
    const normalizedRole = normalizeArgosRole(updates.role);

    if (!normalizedRole) {
      throw new Error("A valid ARGOS role is required.");
    }

    payload.role = normalizedRole;
  }

  if ("department_id" in updates) {
    payload.department_id = updates.department_id || null;
  }

  if ("job_title" in updates) {
    payload.job_title = cleanOptionalText(updates.job_title);
  }

  if ("phone" in updates) {
    payload.phone = cleanOptionalText(updates.phone);
  }

  return payload;
}

export async function updateArgosUserProfile(profileId, updates) {
  requireProfileId(profileId);

  const payload = buildProfileUpdatePayload(updates);

  if (Object.keys(payload).length === 0) {
    throw new Error("No valid profile changes were supplied.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", profileId)
    .select(
      `
        id,
        organization_id,
        full_name,
        role,
        is_active,
        department_id,
        job_title,
        phone,
        last_login,
        created_at,
        updated_at
      `
    )
    .single();

  if (error) {
    console.error("ARGOS profile update failed:", error);
    throw new Error("ARGOS could not update this user profile.");
  }

  return data;
}

export async function suspendArgosUser(profileId) {
  requireProfileId(profileId);

  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: false })
    .eq("id", profileId)
    .select("id, organization_id, full_name, role, is_active, updated_at")
    .single();

  if (error) {
    console.error("ARGOS user suspension failed:", error);
    throw new Error("ARGOS could not suspend this user.");
  }

  return data;
}

export async function restoreArgosUser(profileId) {
  requireProfileId(profileId);

  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: true })
    .eq("id", profileId)
    .select("id, organization_id, full_name, role, is_active, updated_at")
    .single();

  if (error) {
    console.error("ARGOS user restoration failed:", error);
    throw new Error("ARGOS could not restore this user.");
  }

  return data;
}

export async function recordArgosLastLogin(profileId) {
  requireProfileId(profileId);

  const { error } = await supabase
    .from("profiles")
    .update({ last_login: new Date().toISOString() })
    .eq("id", profileId);

  if (error) {
    console.error("ARGOS last-login update failed:", error);
    return false;
  }

  return true;
}