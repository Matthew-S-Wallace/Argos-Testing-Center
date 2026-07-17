// ARGOS™ Sprint 001O
// Canonical role definitions and normalization for Identity & Access Management.

export const ARGOS_ROLES = Object.freeze({
  ADMINISTRATOR: "admin",
  MANAGER: "manager",
  USER: "user",
  TECHNICIAN: "technician",
});

export const ARGOS_ROLE_OPTIONS = Object.freeze([
  {
    value: ARGOS_ROLES.ADMINISTRATOR,
    label: "Administrator",
  },
  {
    value: ARGOS_ROLES.MANAGER,
    label: "Manager",
  },
  {
    value: ARGOS_ROLES.USER,
    label: "User",
  },
  {
    value: ARGOS_ROLES.TECHNICIAN,
    label: "Technician",
  },
]);

export function normalizeArgosRole(role) {
  const normalizedRole = String(role || "")
    .trim()
    .toLowerCase();

  if (normalizedRole === "administrator") {
    return ARGOS_ROLES.ADMINISTRATOR;
  }

  return Object.values(ARGOS_ROLES).includes(normalizedRole)
    ? normalizedRole
    : "";
}

export function getArgosRoleLabel(role) {
  const normalizedRole = normalizeArgosRole(role);

  return (
    ARGOS_ROLE_OPTIONS.find(
      (roleOption) => roleOption.value === normalizedRole
    )?.label || "Unknown"
  );
}

export function isValidArgosRole(role) {
  return Boolean(normalizeArgosRole(role));
}
