// ARGOS™ Sprint 001N.2
// Central permission rules for Identity & Access Management.

import { ARGOS_ROLES, normalizeArgosRole } from "./ARGOS_Roles";

function getRole(user) {
  return normalizeArgosRole(user?.role);
}

function isSameUser(currentUser, targetUser) {
  return Boolean(
    currentUser?.id &&
      targetUser?.id &&
      String(currentUser.id) === String(targetUser.id)
  );
}

export function isArgosAdministrator(user) {
  return getRole(user) === ARGOS_ROLES.ADMINISTRATOR;
}

export function isArgosManager(user) {
  return getRole(user) === ARGOS_ROLES.MANAGER;
}

export function canViewAdministration(user) {
  return isArgosAdministrator(user) || isArgosManager(user);
}

export function canManageUsers(user) {
  return isArgosAdministrator(user);
}

export function canInviteUsers(user) {
  return isArgosAdministrator(user);
}

export function canEditUser(currentUser, targetUser) {
  if (!currentUser || !targetUser) {
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

export function canChangeUserDepartment(currentUser, targetUser) {
  return canEditUser(currentUser, targetUser);
}

export function canChangeUserRole(currentUser, targetUser) {
  if (!isArgosAdministrator(currentUser) || !targetUser) {
    return false;
  }

  return !isSameUser(currentUser, targetUser);
}

export function canSuspendUser({
  currentUser,
  targetUser,
  activeAdministratorCount = 0,
}) {
  if (!isArgosAdministrator(currentUser) || !targetUser) {
    return false;
  }

  if (isSameUser(currentUser, targetUser)) {
    return false;
  }

  const targetIsAdministrator = isArgosAdministrator(targetUser);
  const targetIsActive = targetUser.is_active !== false;

  if (
    targetIsAdministrator &&
    targetIsActive &&
    Number(activeAdministratorCount) <= 1
  ) {
    return false;
  }

  return true;
}

export function canRestoreUser(currentUser, targetUser) {
  if (!isArgosAdministrator(currentUser) || !targetUser) {
    return false;
  }

  return true;
}

export function canRestoreSuspendedAdministrator(currentUser, targetUser) {
  return (
    isArgosAdministrator(currentUser) &&
    isArgosAdministrator(targetUser) &&
    targetUser?.is_active === false
  );
}

export function canDemoteUser({
  currentUser,
  targetUser,
  activeAdministratorCount = 0,
}) {
  if (!isArgosAdministrator(currentUser) || !targetUser) {
    return false;
  }

  if (isSameUser(currentUser, targetUser)) {
    return false;
  }

  const targetIsAdministrator = isArgosAdministrator(targetUser);
  const targetIsActive = targetUser.is_active !== false;

  if (
    targetIsAdministrator &&
    targetIsActive &&
    Number(activeAdministratorCount) <= 1
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
    restrictions.push("User context is incomplete.");
    return restrictions;
  }

  if (!isArgosAdministrator(currentUser) && !isArgosManager(currentUser)) {
    restrictions.push("This account cannot manage organization users.");
  }

  if (isSameUser(currentUser, targetUser)) {
    restrictions.push("Administrators cannot suspend or demote themselves.");
  }

  if (isArgosManager(currentUser) && isArgosAdministrator(targetUser)) {
    restrictions.push("Managers cannot edit administrator accounts.");
  }

  if (
    isArgosAdministrator(targetUser) &&
    targetUser.is_active !== false &&
    Number(activeAdministratorCount) <= 1
  ) {
    restrictions.push("The last active administrator must remain active.");
  }

  return restrictions;
}