/**
 * ARGOS™ Asset Validation Service
 *
 * Centralizes asset required-field and duplicate-record validation.
 * UI presentation, including alerts, remains inside App.jsx.
 */

function normalizeComparisonValue(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateAssetRecord({
  updatedAsset,
  assets = [],
  originalUnit = "",
  originalVin = "",
}) {
  if (
    !updatedAsset?.unit ||
    !updatedAsset?.departmentId ||
    !updatedAsset?.department ||
    !updatedAsset?.assetTypeId ||
    !updatedAsset?.asset
  ) {
    return {
      isValid: false,
      code: "MISSING_REQUIRED_FIELDS",
      message:
        "Unit, Department, Asset Type, and Asset Description are required.",
    };
  }

  const normalizedUpdatedUnit = normalizeComparisonValue(updatedAsset.unit);
  const normalizedOriginalUnit = normalizeComparisonValue(originalUnit);

  const unitAlreadyExists = assets.some((asset) => {
    const normalizedExistingUnit = normalizeComparisonValue(asset.unit);

    return (
      normalizedExistingUnit !== normalizedOriginalUnit &&
      normalizedExistingUnit === normalizedUpdatedUnit
    );
  });

  if (unitAlreadyExists) {
    return {
      isValid: false,
      code: "DUPLICATE_UNIT",
      message: "That unit number already exists in ARGOS.",
    };
  }

  const normalizedUpdatedVin = normalizeComparisonValue(updatedAsset.vin);
  const normalizedOriginalVin = normalizeComparisonValue(originalVin);

  const vinAlreadyExists =
    Boolean(normalizedUpdatedVin) &&
    assets.some((asset) => {
      const normalizedExistingVin = normalizeComparisonValue(asset.vin);

      return (
        normalizedExistingVin !== normalizedOriginalVin &&
        normalizedExistingVin === normalizedUpdatedVin
      );
    });

  if (vinAlreadyExists) {
    return {
      isValid: false,
      code: "DUPLICATE_VIN",
      message: "That VIN already exists in ARGOS.",
    };
  }

  return {
    isValid: true,
    code: "VALID",
    message: "",
  };
}
