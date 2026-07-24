export function calculateWarrantyAwareness(asset) {
  const explicitStatus = String(
    asset?.warrantyStatus || "Unknown"
  );

  const expirationDate = asset?.warrantyExpirationDate
    ? new Date(`${asset.warrantyExpirationDate}T23:59:59`)
    : null;

  const mileageLimit = Number(
    asset?.warrantyMileageLimit || 0
  );

  const currentMileage = Number(
    asset?.currentMileage || 0
  );

  const expiredByDate =
    expirationDate &&
    expirationDate.getTime() < Date.now();

  const expiredByMileage =
    mileageLimit > 0 &&
    currentMileage >= mileageLimit;

  if (explicitStatus === "Not Applicable") {
    return "Not Applicable";
  }

  if (
    expiredByDate ||
    expiredByMileage ||
    explicitStatus === "Expired"
  ) {
    return "Expired";
  }

  if (
    expirationDate ||
    mileageLimit > 0 ||
    explicitStatus === "Under Warranty"
  ) {
    return "In Warranty";
  }

  return "Unknown";
}

export function calculateServiceAwareness(asset) {
  const currentMileage = Number(
    asset?.currentMileage || 0
  );

  const currentHours = Number(
    asset?.currentEngineHours || 0
  );

  const dueMileage = Number(
    asset?.nextServiceMileage || 0
  );

  const dueHours = Number(
    asset?.nextServiceHours || 0
  );

  const mileageRemaining =
    dueMileage > 0
      ? dueMileage - currentMileage
      : null;

  const hoursRemaining =
    dueHours > 0
      ? dueHours - currentHours
      : null;

  if (
    (mileageRemaining !== null &&
      mileageRemaining < 0) ||
    (hoursRemaining !== null &&
      hoursRemaining < 0)
  ) {
    return "PM Overdue";
  }

  if (
    (mileageRemaining !== null &&
      mileageRemaining === 0) ||
    (hoursRemaining !== null &&
      hoursRemaining === 0)
  ) {
    return "PM Due";
  }

  if (
    (mileageRemaining !== null &&
      mileageRemaining <= 500) ||
    (hoursRemaining !== null &&
      hoursRemaining <= 25)
  ) {
    return "Oil Change Due Soon";
  }

  return "No Service Due";
}