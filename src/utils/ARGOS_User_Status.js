// ARGOS™ Sprint 001N.2
// Central account-status definitions for Identity & Access Management.

export const ARGOS_USER_STATUSES = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  PENDING_INVITATION: "pending_invitation",
});

export const ARGOS_USER_STATUS_LABELS = Object.freeze({
  [ARGOS_USER_STATUSES.ACTIVE]: "Active",
  [ARGOS_USER_STATUSES.SUSPENDED]: "Suspended",
  [ARGOS_USER_STATUSES.PENDING_INVITATION]: "Pending Invitation",
});

export function getArgosUserStatus(profile) {
  if (!profile) {
    return ARGOS_USER_STATUSES.PENDING_INVITATION;
  }

  if (profile.invitation_pending === true) {
    return ARGOS_USER_STATUSES.PENDING_INVITATION;
  }

  return profile.is_active === false
    ? ARGOS_USER_STATUSES.SUSPENDED
    : ARGOS_USER_STATUSES.ACTIVE;
}

export function getArgosUserStatusLabel(profileOrStatus) {
  const status =
    typeof profileOrStatus === "string"
      ? profileOrStatus
      : getArgosUserStatus(profileOrStatus);

  return ARGOS_USER_STATUS_LABELS[status] || "Unknown";
}