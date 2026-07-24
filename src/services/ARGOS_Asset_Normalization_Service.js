import { getTodayDateString } from "./ARGOS_Date_Time_Service";

export const FALLBACK_STATUS_CONFIGURATIONS = [
  {
    status_name: "Ready",
    status_code: "READY",
    display_order: 10,
    status_color: "#146C2E",
    counts_as_available: true,
    requires_down_date: false,
    is_active: true,
  },
  {
    status_name: "Down",
    status_code: "DOWN",
    display_order: 20,
    status_color: "#A61B1B",
    counts_as_available: false,
    requires_down_date: true,
    is_active: true,
  },
  {
    status_name: "In Shop",
    status_code: "IN_SHOP",
    display_order: 30,
    status_color: "#245B8A",
    counts_as_available: false,
    requires_down_date: true,
    is_active: true,
  },
  {
    status_name: "At 3rd Party Shop",
    status_code: "THIRD_PARTY",
    display_order: 40,
    status_color: "#6C4A8B",
    counts_as_available: false,
    requires_down_date: true,
    is_active: true,
  },
  {
    status_name: "Waiting Parts",
    status_code: "WAITING_PARTS",
    display_order: 50,
    status_color: "#A96300",
    counts_as_available: false,
    requires_down_date: true,
    is_active: true,
  },
  {
    status_name: "Awaiting Approval",
    status_code: "AWAITING_APPROVAL",
    display_order: 60,
    status_color: "#82550F",
    counts_as_available: false,
    requires_down_date: true,
    is_active: true,
  },
  {
    status_name: "Awaiting QC",
    status_code: "AWAITING_QC",
    display_order: 70,
    status_color: "#5B4B9A",
    counts_as_available: false,
    requires_down_date: true,
    is_active: true,
  },
  {
    status_name: "Ready for Pickup",
    status_code: "READY_PICKUP",
    display_order: 80,
    status_color: "#8A6A14",
    counts_as_available: false,
    requires_down_date: true,
    is_active: true,
  },
];

export const REASON_OPTIONS = [
  "Available",
  "Mechanical Failure",
  "Preventive Maintenance",
  "Parts Availability",
  "Vendor / 3rd Party Delay",
  "Inspection / QC",
  "Awaiting Approval",
  "Accident / Damage",
  "Operator Reported Issue",
  "Other",
];

export const PRIORITY_OPTIONS = ["Normal", "Medium", "High", "Critical"];

export const RTS_TYPE_OPTIONS = [
  "Estimated Date",
  "TBD",
  "No RTS Established",
];

const CANONICAL_STATUS_NAMES = new Map(
  FALLBACK_STATUS_CONFIGURATIONS.flatMap((status) => [
    [status.status_name.toLowerCase(), status.status_name],
    [status.status_code.toLowerCase(), status.status_name],
  ])
);

function findOptionMatch(value, options) {
  const cleanedValue = String(value || "").trim().toLowerCase();

  return options.find(
    (option) => option.toLowerCase() === cleanedValue
  );
}

export function normalizeOperationalStatus(value) {
  const cleanedValue = String(value || "Ready")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toLowerCase();

  return (
    CANONICAL_STATUS_NAMES.get(cleanedValue) ||
    CANONICAL_STATUS_NAMES.get(cleanedValue.replaceAll("_", " ")) ||
    String(value || "Ready").trim() ||
    "Ready"
  );
}

export function normalizeDepartmentLookupValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function findDepartmentByName(departments, departmentName) {
  const normalizedName =
    normalizeDepartmentLookupValue(departmentName);

  return departments.find(
    (department) =>
      normalizeDepartmentLookupValue(
        department.department_name
      ) === normalizedName
  );
}

export function normalizeTechnicianDisplayName(value) {
  const cleanedValue = String(value || "")
    .trim()
    .replace(/\s+/g, " ");

  if (
    !cleanedValue ||
    cleanedValue === "—" ||
    cleanedValue === "‚Äî" ||
    cleanedValue.toLowerCase() === "unassigned"
  ) {
    return "Unassigned";
  }

  return cleanedValue;
}

export function normalizeTechnicianKey(value) {
  return normalizeTechnicianDisplayName(value).toLowerCase();
}

export function inferDemoAssetTypeId(assetDescription) {
  const description = String(
    assetDescription || ""
  ).toLowerCase();

  if (/(police interceptor|tahoe|explorer|suv)/.test(description)) {
    return "demo-suv";
  }

  if (
    /(f-150|f-250|f-350|silverado|ram 1500|ram 2500|ram 3500|pickup)/.test(
      description
    )
  ) {
    return "demo-pickup";
  }

  if (/(service truck|utility truck)/.test(description)) {
    return "demo-service";
  }

  if (/(transit connect|van|sprinter|promaster)/.test(description)) {
    return "demo-van";
  }

  if (/(bus|cutaway|shuttle)/.test(description)) {
    return "demo-bus";
  }

  if (/(pumper|engine|ladder|quint|ambulance|rescue)/.test(description)) {
    return "demo-fire";
  }

  if (/(rear loader|front loader|side loader|refuse|packer)/.test(description)) {
    return "demo-refuse";
  }

  if (/(freightliner|international|mack|dump truck)/.test(description)) {
    return "demo-heavy";
  }

  if (/trailer/.test(description)) {
    return "demo-trailer";
  }

  if (/(excavator|backhoe|loader|dozer|grader|skid steer)/.test(description)) {
    return "demo-construction";
  }

  if (/(mower|zero turn)/.test(description)) {
    return "demo-grounds";
  }

  if (/tractor/.test(description)) {
    return "demo-ag";
  }

  if (/(sedan|charger|impala|malibu|taurus)/.test(description)) {
    return "demo-sedan";
  }

  return "demo-other";
}

export function createBlankAsset() {
  return {
    unit: "",
    vin: "",
    departmentId: "",
    department: "",
    assetTypeId: "",
    assetTypeName: "",
    asset: "",
    year: "",
    make: "",
    model: "",
    engine: "",
    fuelType: "",
    bodyClass: "",
    driveType: "",
    gvwrClass: "",
    manufacturer: "",
    apwaCodeId: "",
    apwaCode: "",
    apwaDescription: "",
    apwaAssignmentSource: "",
    apwaMappingRuleId: "",
    apwaAssignedAt: "",
    apwaAssignedBy: "",
    apwaRecommendationMatchType: "",
    currentMileage: "",
    currentEngineHours: "",
    workOrderNumber: "",
    vendorShop: "",
    primaryVmrs: "",
    secondaryVmrs: "",
    vmrsSystemCodeId: "",
    vmrsSystemCode: "",
    vmrsSystemDescription: "",
    vmrsAssemblyCodeId: "",
    vmrsAssemblyCode: "",
    vmrsAssemblyDescription: "",
    vmrsComponentCodeId: "",
    vmrsComponentCode: "",
    vmrsComponentDescription: "",
    vmrsReasonCodeId: "",
    vmrsReasonCode: "",
    vmrsReasonDescription: "",
    vmrsWorkAccomplishedCodeId: "",
    vmrsWorkAccomplishedCode: "",
    vmrsWorkAccomplishedDescription: "",
    vmrsPositionCodeId: "",
    vmrsPositionCode: "",
    vmrsPositionDescription: "",
    vmrsCodedAt: "",
    vmrsCodedBy: "",
    repairOpenedAt: "",
    repairCompletedAt: "",
    mileageAtRepair: "",
    engineHoursAtRepair: "",
    warrantyStatus: "Unknown",
    warrantyType: "",
    warrantyExpirationDate: "",
    warrantyMileageLimit: "",
    lastServiceDate: "",
    lastServiceMileage: "",
    lastServiceHours: "",
    nextServiceMileage: "",
    nextServiceHours: "",
    repairTimeline: [],
    repairUpdateDraft: "",
    mileageUpdatedAt: "",
    engineHoursUpdatedAt: "",
    nhtsaDecode: {},
    status: "Ready",
    statusStartedAt: getTodayDateString(),
    reason: "Available",
    priority: "Normal",
    downSince: "",
    technicianId: "",
    technician: "Unassigned",
    rtsType: "No RTS Established",
    rtsDate: "",
    details: "Available",
  };
}

export function normalizeAsset(asset) {
  const sourceStatus =
    asset.status === "Completed" ? "Ready" : asset.status;

  const normalizedStatus =
    normalizeOperationalStatus(sourceStatus);

  const isReadyStatus = normalizedStatus === "Ready";

  const technician =
    normalizeTechnicianDisplayName(asset.technician);

  return {
    vin: "",
    departmentId: asset.departmentId || "",
    assetTypeId:
      asset.assetTypeId ||
      inferDemoAssetTypeId(asset.asset),
    assetTypeName: asset.assetTypeName || "",
    year: asset.year || "",
    make: asset.make || "",
    model: asset.model || "",
    engine: asset.engine || "",
    fuelType: asset.fuelType || "",
    bodyClass: asset.bodyClass || "",
    driveType: asset.driveType || "",
    gvwrClass: asset.gvwrClass || "",
    manufacturer: asset.manufacturer || "",
    apwaCodeId: asset.apwaCodeId || "",
    apwaCode: asset.apwaCode || "",
    apwaDescription: asset.apwaDescription || "",
    apwaAssignmentSource:
      asset.apwaAssignmentSource || "",
    apwaMappingRuleId:
      asset.apwaMappingRuleId || "",
    apwaAssignedAt: asset.apwaAssignedAt || "",
    apwaAssignedBy: asset.apwaAssignedBy || "",
    apwaRecommendationMatchType:
      asset.apwaRecommendationMatchType || "",
    currentMileage: asset.currentMileage ?? "",
    currentEngineHours:
      asset.currentEngineHours ?? "",
    workOrderNumber: asset.workOrderNumber || "",
    vendorShop: asset.vendorShop || "",
    primaryVmrs: asset.primaryVmrs || "",
    secondaryVmrs: asset.secondaryVmrs || "",
    vmrsSystemCodeId:
      asset.vmrsSystemCodeId || "",
    vmrsSystemCode:
      asset.vmrsSystemCode || "",
    vmrsSystemDescription:
      asset.vmrsSystemDescription || "",
    vmrsAssemblyCodeId:
      asset.vmrsAssemblyCodeId || "",
    vmrsAssemblyCode:
      asset.vmrsAssemblyCode || "",
    vmrsAssemblyDescription:
      asset.vmrsAssemblyDescription || "",
    vmrsComponentCodeId:
      asset.vmrsComponentCodeId || "",
    vmrsComponentCode:
      asset.vmrsComponentCode || "",
    vmrsComponentDescription:
      asset.vmrsComponentDescription || "",
    vmrsReasonCodeId:
      asset.vmrsReasonCodeId || "",
    vmrsReasonCode:
      asset.vmrsReasonCode || "",
    vmrsReasonDescription:
      asset.vmrsReasonDescription || "",
    vmrsWorkAccomplishedCodeId:
      asset.vmrsWorkAccomplishedCodeId || "",
    vmrsWorkAccomplishedCode:
      asset.vmrsWorkAccomplishedCode || "",
    vmrsWorkAccomplishedDescription:
      asset.vmrsWorkAccomplishedDescription || "",
    vmrsPositionCodeId:
      asset.vmrsPositionCodeId || "",
    vmrsPositionCode:
      asset.vmrsPositionCode || "",
    vmrsPositionDescription:
      asset.vmrsPositionDescription || "",
    vmrsCodedAt: asset.vmrsCodedAt || "",
    vmrsCodedBy: asset.vmrsCodedBy || "",
    repairOpenedAt: asset.repairOpenedAt || "",
    repairCompletedAt:
      asset.repairCompletedAt || "",
    mileageAtRepair:
      asset.mileageAtRepair ?? "",
    engineHoursAtRepair:
      asset.engineHoursAtRepair ?? "",
    warrantyStatus:
      asset.warrantyStatus || "Unknown",
    warrantyType: asset.warrantyType || "",
    warrantyExpirationDate:
      asset.warrantyExpirationDate || "",
    warrantyMileageLimit:
      asset.warrantyMileageLimit ?? "",
    lastServiceDate:
      asset.lastServiceDate || "",
    lastServiceMileage:
      asset.lastServiceMileage ?? "",
    lastServiceHours:
      asset.lastServiceHours ?? "",
    nextServiceMileage:
      asset.nextServiceMileage ?? "",
    nextServiceHours:
      asset.nextServiceHours ?? "",
    repairTimeline:
      Array.isArray(asset.repairTimeline)
        ? asset.repairTimeline
        : [],
    repairUpdateDraft:
      asset.repairUpdateDraft || "",
    mileageUpdatedAt:
      asset.mileageUpdatedAt || "",
    engineHoursUpdatedAt:
      asset.engineHoursUpdatedAt || "",
    nhtsaDecode: asset.nhtsaDecode || {},
    ...asset,
    status: normalizedStatus,
    reason: isReadyStatus
      ? "Available"
      : asset.reason || asset.issue || "Other",
    details:
      asset.details ||
      asset.issue ||
      (isReadyStatus
        ? "Available"
        : "Details pending"),
    statusStartedAt:
      asset.statusStartedAt ||
      asset.downSince ||
      getTodayDateString(),
    technician,
    downSince: isReadyStatus
      ? ""
      : asset.downSince || getTodayDateString(),
    rtsType: isReadyStatus
      ? "No RTS Established"
      : asset.rtsType || "No RTS Established",
    rtsDate: isReadyStatus
      ? ""
      : asset.rtsDate || "",
  };
}

export function normalizeCompletedRepairEvent(event) {
  return {
    ...event,
    finalStatus: event.finalStatus || "Ready",
    recordType: "Historical Repair Event",
    technician:
      normalizeTechnicianDisplayName(
        event.technician
      ),
  };
}

export function normalizeImportedAsset(
  row,
  statusOptions = FALLBACK_STATUS_CONFIGURATIONS.map(
    (status) => status.status_name
  )
) {
  const normalizedImportedStatus =
    normalizeOperationalStatus(row.status);

  const importedStatus =
    findOptionMatch(
      normalizedImportedStatus,
      statusOptions
    ) ||
    normalizedImportedStatus ||
    "Ready";

  const isReadyStatus =
    importedStatus === "Ready";

  const priority =
    findOptionMatch(
      row.priority,
      PRIORITY_OPTIONS
    ) || "Normal";

  const reason = isReadyStatus
    ? "Available"
    : findOptionMatch(
        row.reason,
        REASON_OPTIONS
      ) || "Other";

  const rtsType = isReadyStatus
    ? "No RTS Established"
    : findOptionMatch(
        row.rtsType,
        RTS_TYPE_OPTIONS
      ) || "No RTS Established";

  const downSince = isReadyStatus
    ? ""
    : String(row.downSince || "").trim() ||
      getTodayDateString();

  return {
    unit: String(row.unit || "").trim(),
    vin: String(row.vin || "")
      .trim()
      .toUpperCase(),
    departmentId: "",
    department: String(
      row.department || ""
    ).trim(),
    assetTypeId: "",
    assetTypeName: String(
      row.assetType || ""
    ).trim(),
    asset: String(row.asset || "").trim(),
    status: importedStatus,
    statusStartedAt: isReadyStatus
      ? getTodayDateString()
      : downSince,
    reason,
    priority,
    downSince,
    technician:
      normalizeTechnicianDisplayName(
        row.technician
      ),
    rtsType,
    rtsDate:
      !isReadyStatus &&
      rtsType === "Estimated Date"
        ? String(row.rtsDate || "").trim()
        : "",
    details:
      String(row.details || "").trim() ||
      (isReadyStatus
        ? "Available"
        : "Details pending"),
  };
}