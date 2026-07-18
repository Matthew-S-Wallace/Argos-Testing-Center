// ARGOS™ Sprint 001O – Phase 2
// Central permission rules for Identity & Access Management,
// Administration access, and operation-level user controls.

import {
  ARGOS_ROLES,
  normalizeArgosRole,
} from "./ARGOS_Roles";

const ADMINISTRATION_SECTION_PERMISSIONS = Object.freeze({
  "Organization Profile": "administration",
  Users: "users",
  Roles: "users",
  Departments: "departments",
  Technicians: "technicians",
  "Asset Types": "assetTypes",
  "Status Configuration": "statuses",
  "Reason Configuration": "administration",
  "APWA Mapping": "administration",
  "VMRS Configuration": "administration",
  "CSV Import": "administration",
  "CSV Export": "administration",
  "Import History": "administration",
  "Archived Assets": "administration",
  "Audit Log": "administration",
  "Release Notes": "administration",
  "Help & Support": "administration",
});

function getRole(user) {
  return normalizeArgosRole(user?.role);
}

function isSameUser(currentUser, targetUser) {
  return Boolean(
    currentUser?.id &&
      targetUser?.id &&
      String(currentUser.id) === String(targetUser.id),
  );
}

function isActiveUser(user) {
  return user?.is_active !== false;
}

function isSuspendedUser(user) {
  return user?.is_active === false;
}

function normalizeAdministratorCount(value) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return parsedValue;
}

export function isArgosAdministrator(user) {
  return getRole(user) === ARGOS_ROLES.ADMINISTRATOR;
}

export function isArgosManager(user) {
  return getRole(user) === ARGOS_ROLES.MANAGER;
}

export function canViewAdministration(user) {
  return (
    isActiveUser(user) &&
    (isArgosAdministrator(user) || isArgosManager(user))
  );
}

export function canManageUsers(user) {
  return isActiveUser(user) && isArgosAdministrator(user);
}

export function canAccessUsersAdministration(user) {
  return (
    isActiveUser(user) &&
    (isArgosAdministrator(user) || isArgosManager(user))
  );
}

export function canManageDepartments(user) {
  return canViewAdministration(user);
}

export function canManageTechnicians(user) {
  return canViewAdministration(user);
}

export function canManageAssetTypes(user) {
  return canViewAdministration(user);
}

export function canManageStatuses(user) {
  return canViewAdministration(user);
}

export function canViewAdministrationSection(
  user,
  section,
  isDemoMode = false,
) {
  if (isDemoMode) {
    return true;
  }

  if (!canViewAdministration(user)) {
    return false;
  }

  const permission =
    ADMINISTRATION_SECTION_PERMISSIONS[section];

  if (!permission) {
    return false;
  }

  switch (permission) {
    case "users":
      return canAccessUsersAdministration(user);

    case "departments":
      return canManageDepartments(user);

    case "technicians":
      return canManageTechnicians(user);

    case "assetTypes":
      return canManageAssetTypes(user);

    case "statuses":
      return canManageStatuses(user);

    case "administration":
    default:
      return canViewAdministration(user);
  }
}

export function canInviteUsers(user) {
  return canManageUsers(user);
}

export function canEditUser(currentUser, targetUser) {
  if (
    !currentUser ||
    !targetUser ||
    !isActiveUser(currentUser)
  ) {
    return false;
  }

  if (isArgosAdministrator(currentUser)) {
    return true;
  }

  if (isArgosManager(currentUser)) {
    return !isArgosAdministrator(targetUser);
  }

  return false;
}

export function canChangeUserDepartment(
  currentUser,
  targetUser,
) {
  return canEditUser(currentUser, targetUser);
}

export function canChangeUserRole(
  currentUser,
  targetUser,
) {
  if (
    !isActiveUser(currentUser) ||
    !isArgosAdministrator(currentUser) ||
    !targetUser
  ) {
    return false;
  }

  return !isSameUser(currentUser, targetUser);
}

export function canSuspendUser({
  currentUser,
  targetUser,
  activeAdministratorCount = 0,
}) {
  if (
    !isActiveUser(currentUser) ||
    !isArgosAdministrator(currentUser) ||
    !targetUser ||
    !isActiveUser(targetUser)
  ) {
    return false;
  }

  if (isSameUser(currentUser, targetUser)) {
    return false;
  }

  const targetIsAdministrator =
    isArgosAdministrator(targetUser);

  const administratorCount =
    normalizeAdministratorCount(activeAdministratorCount);

  if (
    targetIsAdministrator &&
    administratorCount <= 1
  ) {
    return false;
  }

  return true;
}

export function canRestoreUser(
  currentUser,
  targetUser,
) {
  if (
    !isActiveUser(currentUser) ||
    !isArgosAdministrator(currentUser) ||
    !targetUser
  ) {
    return false;
  }

  return isSuspendedUser(targetUser);
}

export function canRestoreSuspendedAdministrator(
  currentUser,
  targetUser,
) {
  return (
    isActiveUser(currentUser) &&
    isArgosAdministrator(currentUser) &&
    isArgosAdministrator(targetUser) &&
    isSuspendedUser(targetUser)
  );
}

export function canDemoteUser({
  currentUser,
  targetUser,
  activeAdministratorCount = 0,
}) {
  if (
    !isActiveUser(currentUser) ||
    !isArgosAdministrator(currentUser) ||
    !targetUser
  ) {
    return false;
  }

  if (isSameUser(currentUser, targetUser)) {
    return false;
  }

  const targetIsAdministrator =
    isArgosAdministrator(targetUser);

  const administratorCount =
    normalizeAdministratorCount(activeAdministratorCount);

  if (
    targetIsAdministrator &&
    isActiveUser(targetUser) &&
    administratorCount <= 1
  ) {
    return false;
  }

  return true;
}

export function getUserManagementRestrictions({
  currentUser,
  targetUser,
  activeAdministratorCount = 0,
}) {
  const restrictions = [];

  if (!currentUser || !targetUser) {
    restrictions.push(
      "User-management context is incomplete.",
    );

    return restrictions;
  }

  if (!isActiveUser(currentUser)) {
    restrictions.push(
      "Suspended accounts cannot manage organization users.",
    );

    return restrictions;
  }

  if (
    !isArgosAdministrator(currentUser) &&
    !isArgosManager(currentUser)
  ) {
    restrictions.push(
      "This account cannot manage organization users.",
    );

    return restrictions;
  }

  if (
    isArgosManager(currentUser) &&
    isArgosAdministrator(targetUser)
  ) {
    restrictions.push(
      "Managers cannot edit Administrator accounts.",
    );
  }

  if (isSameUser(currentUser, targetUser)) {
    restrictions.push(
      "Administrators cannot suspend or demote their own accounts.",
    );
  }

  const administratorCount =
    normalizeAdministratorCount(activeAdministratorCount);

  if (
    isArgosAdministrator(targetUser) &&
    isActiveUser(targetUser) &&
    administratorCount <= 1
  ) {
    restrictions.push(
      "The final active Administrator must remain active and cannot be demoted.",
    );
  }

  if (
    isArgosManager(currentUser) &&
    !isArgosAdministrator(targetUser)
  ) {
    restrictions.push(
      "Managers may edit permitted profile and department information but cannot change roles, suspend users, or restore users.",
    );
  }

  return restrictions;
}