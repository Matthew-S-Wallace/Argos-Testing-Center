// ARGOS™ Sprint 001N.5 — Secure User Invitation Workflow
// Backend phase 1: validates the request, verifies an active administrator,
// and sends a Supabase Auth invitation.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const ALLOWED_ROLES = new Set(["admin", "manager", "user", "technician"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteUserRequest = {
  email?: unknown;
  full_name?: unknown;
  role?: unknown;
  redirect_to?: unknown;
};

type CallerProfile = {
  id: string;
  organization_id: string | null;
  role: string | null;
  is_active: boolean | null;
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, { status });
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRole(value: unknown): string {
  const normalizedRole = normalizeText(value).toLowerCase();

  if (normalizedRole === "administrator") return "admin";
  return normalizedRole;
}

function isDuplicateUserError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("already been registered") ||
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("user already exists")
  );
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return jsonResponse(
        {
          ok: false,
          code: "METHOD_NOT_ALLOWED",
          message: "ARGOS user invitations require a POST request.",
        },
        405,
      );
    }

    const callerId = normalizeText(ctx.userClaims?.id);

    if (!callerId) {
      return jsonResponse(
        {
          ok: false,
          code: "UNAUTHENTICATED",
          message: "ARGOS could not verify the signed-in user.",
        },
        401,
      );
    }

    let payload: InviteUserRequest;

    try {
      payload = (await req.json()) as InviteUserRequest;
    } catch {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_JSON",
          message: "The invitation request must contain valid JSON.",
        },
        400,
      );
    }

    const email = normalizeText(payload.email).toLowerCase();
    const fullName = normalizeText(payload.full_name);
    const role = normalizeRole(payload.role ?? "user");
    const redirectTo = normalizeText(payload.redirect_to);

    if (!email || !EMAIL_PATTERN.test(email)) {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_EMAIL",
          message: "Enter a valid email address for the invited user.",
        },
        400,
      );
    }

    if (!fullName || fullName.length > 160) {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_FULL_NAME",
          message: "Enter a full name between 1 and 160 characters.",
        },
        400,
      );
    }

    if (!ALLOWED_ROLES.has(role)) {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_ROLE",
          message: "Select a valid ARGOS role.",
        },
        400,
      );
    }

    const callerProfileResult = await ctx.supabaseAdmin
      .from("profiles")
      .select("id, organization_id, role, is_active")
      .eq("id", callerId)
      .single();

    const callerProfile = callerProfileResult.data as CallerProfile | null;
    const callerProfileError = callerProfileResult.error;
    const organizationId = normalizeText(callerProfile?.organization_id);

    if (callerProfileError || !organizationId) {
      console.error(
        "ARGOS invitation caller profile lookup failed:",
        callerProfileError,
      );

      return jsonResponse(
        {
          ok: false,
          code: "CALLER_PROFILE_NOT_FOUND",
          message: "ARGOS could not resolve the current organization.",
        },
        403,
      );
    }

    const callerRole = normalizeRole(callerProfile?.role);

    if (callerProfile?.is_active === false || callerRole !== "admin") {
      return jsonResponse(
        {
          ok: false,
          code: "FORBIDDEN",
          message: "Only active ARGOS administrators can invite users.",
        },
        403,
      );
    }

    const inviteOptions: {
      data: Record<string, string>;
      redirectTo?: string;
    } = {
      data: {
        full_name: fullName,
        role,
        organization_id: organizationId,
      },
    };

    if (redirectTo) {
      inviteOptions.redirectTo = redirectTo;
    }

    const { data: invitationData, error: invitationError } = await ctx
      .supabaseAdmin
      .auth.admin.inviteUserByEmail(email, inviteOptions);

    if (invitationError) {
      console.error("ARGOS invitation failed:", invitationError);

      if (isDuplicateUserError(invitationError.message)) {
        return jsonResponse(
          {
            ok: false,
            code: "USER_ALREADY_EXISTS",
            message: "A Supabase Auth account already exists for this email address.",
          },
          409,
        );
      }

      return jsonResponse(
        {
          ok: false,
          code: "INVITATION_FAILED",
          message: invitationError.message || "ARGOS could not send the invitation.",
        },
        400,
      );
    }

    const invitedUser = invitationData?.user;

    if (!invitedUser?.id) {
      return jsonResponse(
        {
          ok: false,
          code: "INVITATION_INCOMPLETE",
          message: "Supabase did not return the invited user record.",
        },
        502,
      );
    }

    return jsonResponse(
      {
        ok: true,
        code: "INVITATION_SENT",
        message: "The ARGOS user invitation was sent successfully.",
        user: {
          id: invitedUser.id,
          email: invitedUser.email || email,
          full_name: fullName,
          role,
          organization_id: organizationId,
        },
      },
      201,
    );
  }),
};
