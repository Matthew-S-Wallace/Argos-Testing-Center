import {
  calculateStatusDurationDays,
  getTodayDateString,
} from "./ARGOS_Date_Time_Service";

import {
  normalizeAsset,
  normalizeCompletedRepairEvent,
} from "./ARGOS_Asset_Normalization_Service";

export function mapSupabaseAsset(row) {
  return normalizeAsset({
    unit: row.unit || "",
    vin: row.vin || "",
    departmentId: row.department_id || "",
    department: row.department || "",
    assetTypeId: row.asset_type_id || "",
    assetTypeName: row.asset_types?.asset_type_name || "",
    asset: row.asset || "",
    year: row.year || "",
    make: row.make || "",
    model: row.model || "",
    engine: row.engine || "",
    fuelType: row.fuel_type || "",
    bodyClass: row.body_class || "",
    driveType: row.drive_type || "",
    gvwrClass: row.gvwr_class || "",
    manufacturer: row.manufacturer || "",

    apwaCodeId: row.apwa_code_id || "",
    apwaCode: row.apwa_code || "",
    apwaDescription: row.apwa_description || "",
    apwaAssignmentSource: row.apwa_assignment_source || "",
    apwaMappingRuleId: row.apwa_mapping_rule_id || "",
    apwaAssignedAt: row.apwa_assigned_at || "",
    apwaAssignedBy: row.apwa_assigned_by || "",
    apwaRecommendationMatchType: "",

    currentMileage: row.current_mileage ?? "",
    currentEngineHours: row.current_engine_hours ?? "",

    workOrderNumber: row.work_order_number || "",
    vendorShop: row.vendor_shop || "",

    primaryVmrs: row.primary_vmrs || "",
    secondaryVmrs: row.secondary_vmrs || "",

    vmrsSystemCodeId: row.vmrs_system_code_id || "",
    vmrsSystemCode: row.vmrs_system_code || "",
    vmrsSystemDescription: row.vmrs_system_description || "",

    vmrsAssemblyCodeId: row.vmrs_assembly_code_id || "",
    vmrsAssemblyCode: row.vmrs_assembly_code || "",
    vmrsAssemblyDescription: row.vmrs_assembly_description || "",

    vmrsComponentCodeId: row.vmrs_component_code_id || "",
    vmrsComponentCode: row.vmrs_component_code || "",
    vmrsComponentDescription: row.vmrs_component_description || "",

    vmrsReasonCodeId: row.vmrs_reason_code_id || "",
    vmrsReasonCode: row.vmrs_reason_code || "",
    vmrsReasonDescription: row.vmrs_reason_description || "",

    vmrsWorkAccomplishedCodeId:
      row.vmrs_work_accomplished_code_id || "",
    vmrsWorkAccomplishedCode:
      row.vmrs_work_accomplished_code || "",
    vmrsWorkAccomplishedDescription:
      row.vmrs_work_accomplished_description || "",

    vmrsPositionCodeId: row.vmrs_position_code_id || "",
    vmrsPositionCode: row.vmrs_position_code || "",
    vmrsPositionDescription: row.vmrs_position_description || "",

    vmrsCodedAt: row.vmrs_coded_at || "",
    vmrsCodedBy: row.vmrs_coded_by || "",

    repairOpenedAt: row.repair_opened_at || "",
    repairCompletedAt: row.repair_completed_at || "",
    mileageAtRepair: row.mileage_at_repair ?? "",
    engineHoursAtRepair: row.engine_hours_at_repair ?? "",

    warrantyStatus: row.warranty_status || "Unknown",
    warrantyType: row.warranty_type || "",
    warrantyExpirationDate: row.warranty_expiration_date || "",
    warrantyMileageLimit: row.warranty_mileage_limit ?? "",

    lastServiceDate: row.last_service_date || "",
    lastServiceMileage: row.last_service_mileage ?? "",
    lastServiceHours: row.last_service_hours ?? "",
    nextServiceMileage: row.next_service_mileage ?? "",
    nextServiceHours: row.next_service_hours ?? "",

    repairTimeline: Array.isArray(row.repair_timeline)
      ? row.repair_timeline
      : [],

    mileageUpdatedAt: row.mileage_updated_at || "",
    engineHoursUpdatedAt: row.engine_hours_updated_at || "",

    nhtsaDecode: row.nhtsa_decode || {},

    status: row.status || "Ready",
    statusStartedAt:
      row.status_started_at ||
      row.down_since ||
      getTodayDateString(),

    reason: row.reason || "Available",
    priority: row.priority || "Normal",
    downSince: row.down_since || "",

    technicianId: row.technician_id || "",
    technician:
      row.technicians?.technician_name ||
      row.technician ||
      "Unassigned",

    rtsType: row.rts_type || "No RTS Established",
    rtsDate: row.rts_date || "",
    details: row.details || "Available",
  });
}

export function mapSupabaseRepairHistory(row) {
  return normalizeCompletedRepairEvent({
    id: row.id,
    unit: row.unit || "",
    department: row.department || "",
    asset: row.asset || "",

    recordType:
      row.record_type || "Historical Repair Event",

    status: row.prior_status || "Unknown",
    finalStatus: row.final_status || "Ready",
    reason: row.reason || "Other",
    priority: row.priority || "Normal",

    finalDaysDown: row.days_down ?? 0,
    technician: row.technician || "Unassigned",
    completedDate: row.completed || "",

    workOrderNumber: row.work_order_number || "",
    vendorShop: row.vendor_shop || "",

    primaryVmrs: row.primary_vmrs || "",
    secondaryVmrs: row.secondary_vmrs || "",

    vmrsSystemCodeId: row.vmrs_system_code_id || "",
    vmrsSystemCode: row.vmrs_system_code || "",
    vmrsSystemDescription: row.vmrs_system_description || "",

    vmrsAssemblyCodeId: row.vmrs_assembly_code_id || "",
    vmrsAssemblyCode: row.vmrs_assembly_code || "",
    vmrsAssemblyDescription: row.vmrs_assembly_description || "",

    vmrsComponentCodeId: row.vmrs_component_code_id || "",
    vmrsComponentCode: row.vmrs_component_code || "",
    vmrsComponentDescription: row.vmrs_component_description || "",

    vmrsReasonCodeId: row.vmrs_reason_code_id || "",
    vmrsReasonCode: row.vmrs_reason_code || "",
    vmrsReasonDescription: row.vmrs_reason_description || "",

    vmrsWorkAccomplishedCodeId:
      row.vmrs_work_accomplished_code_id || "",
    vmrsWorkAccomplishedCode:
      row.vmrs_work_accomplished_code || "",
    vmrsWorkAccomplishedDescription:
      row.vmrs_work_accomplished_description || "",

    vmrsPositionCodeId: row.vmrs_position_code_id || "",
    vmrsPositionCode: row.vmrs_position_code || "",
    vmrsPositionDescription: row.vmrs_position_description || "",

    vmrsCodedAt: row.vmrs_coded_at || "",
    vmrsCodedBy: row.vmrs_coded_by || "",

    mileageAtRepair: row.mileage_at_repair ?? "",
    engineHoursAtRepair: row.engine_hours_at_repair ?? "",

    warrantyStatus: row.warranty_status || "Unknown",

    repairOpenedAt: row.repair_opened_at || "",
    repairCompletedAt:
      row.repair_completed_at ||
      row.completed ||
      "",

    repairTimeline: Array.isArray(row.repair_timeline)
      ? row.repair_timeline
      : [],

    details: row.details || "Details pending",
  });
}

export function mapSupabaseStatusHistory(row) {
  const changedAt =
    row.changed_at || new Date().toISOString();

  const changedDate = changedAt.slice(0, 10);

  const statusStartedAt =
    row.status_started_at || changedDate;

  const statusEndedAt =
    row.status_ended_at || changedDate;

  return {
    id: row.id,
    unit: row.unit || "",
    vin: "",
    department: row.department || "",
    asset: row.asset || "",

    previousStatus:
      row.from_status || "Unknown",

    newStatus:
      row.to_status || "Unknown",

    reason: row.reason || "Other",
    details: row.details || "Details pending",
    technician:
      row.technician || "Unassigned",

    statusStartedAt,
    statusEndedAt,

    durationDays:
      row.duration_minutes != null
        ? Number(row.duration_minutes) / (24 * 60)
        : row.duration_days ??
          calculateStatusDurationDays(
            statusStartedAt,
            statusEndedAt
          ),

    recordedAt: changedAt,
  };
}