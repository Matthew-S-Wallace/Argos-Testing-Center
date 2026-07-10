import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { supabase } from "./supabaseClient";
import "./App.css";


const STORAGE_KEY = "argosFleetAssets";
const COMPLETED_STORAGE_KEY = "argosCompletedRepairEvents";
const STATUS_HISTORY_STORAGE_KEY = "argosStatusHistoryEvents";
const ACTIVE_VIEW_STORAGE_KEY = "argosActiveView";

function getOrganizationStorageKey(baseKey, organizationId) {
  return organizationId ? `${baseKey}:${organizationId}` : null;
}

const STATUS_OPTIONS = [
  "Ready",
  "Down",
  "In Shop",
  "At 3rd Party Shop",
  "Waiting Parts",
  "Awaiting Approval",
  "Awaiting QC",
  "Ready for Pickup",
];

const STATUS_DURATION_STATUS_OPTIONS = STATUS_OPTIONS.filter((status) => status !== "Ready");

const REASON_OPTIONS = [
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

const PRIORITY_OPTIONS = ["Normal", "Medium", "High", "Critical"];
const RTS_TYPE_OPTIONS = ["Estimated Date", "TBD", "No RTS Established"];

const CSV_COLUMNS = [
  "unit",
  "vin",
  "department",
  "asset",
  "status",
  "reason",
  "priority",
  "downSince",
  "technician",
  "rtsType",
  "rtsDate",
  "details",
];

function getTodayDateString() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
}

function escapeCSVValue(value) {
  const stringValue = String(value ?? "");
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseCSVLine(line) {
  const values = [];
  let currentValue = "";
  let isInsideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && isInsideQuotes && nextCharacter === '"') {
      currentValue += '"';
      index += 1;
    } else if (character === '"') {
      isInsideQuotes = !isInsideQuotes;
    } else if (character === "," && !isInsideQuotes) {
      values.push(currentValue.trim());
      currentValue = "";
    } else {
      currentValue += character;
    }
  }

  values.push(currentValue.trim());
  return values;
}

function parseCSVText(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
}

function findOptionMatch(value, options) {
  const cleanedValue = String(value || "").trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === cleanedValue);
}

function formatDate(dateString) {
  if (!dateString) return "—";

  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseStatusDateTime(value) {
  if (!value) return null;

  const stringValue = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(stringValue)
    ? new Date(`${stringValue}T00:00:00`)
    : new Date(stringValue);

  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateStatusDurationDays(startDate, endDate) {
  const start = parseStatusDateTime(startDate);
  const end = parseStatusDateTime(endDate);

  if (!start || !end) return 0;

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, (end.getTime() - start.getTime()) / millisecondsPerDay);
}

function formatStatusDuration(durationDays) {
  const totalMinutes = Math.max(0, Math.round(Number(durationDays || 0) * 24 * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    const parts = [`${days} day${days === 1 ? "" : "s"}`];
    if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    return parts.join(" ");
  }

  if (hours > 0) {
    const parts = [`${hours} hour${hours === 1 ? "" : "s"}`];
    if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    return parts.join(" ");
  }

  return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
}

function calculateDaysDown(downSince, status) {
  if (status === "Ready" || !downSince) return 0;

  const downDate = new Date(`${downSince}T00:00:00`);
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor((today.getTime() - downDate.getTime()) / millisecondsPerDay));
}

function calculateFinalDaysDown(downSince) {
  if (!downSince) return 0;

  const downDate = new Date(`${downSince}T00:00:00`);
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor((today.getTime() - downDate.getTime()) / millisecondsPerDay));
}

function getStatusClass(status) {
  return String(status || "Ready").toLowerCase().replaceAll(" ", "-").replaceAll("/", "");
}


function normalizeScannedVIN(value) {
  const cleanedValue = String(value || "")
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, "");

  if (cleanedValue.length <= 17) return cleanedValue;

  const possibleVinMatches = [];

  for (let index = 0; index <= cleanedValue.length - 17; index += 1) {
    const candidate = cleanedValue.slice(index, index + 17);

    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(candidate)) {
      possibleVinMatches.push(candidate);
    }
  }

  return possibleVinMatches[possibleVinMatches.length - 1] || cleanedValue.slice(-17);
}

function isLikelyVIN(value) {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeScannedVIN(value));
}

function cleanDecodedVehicleValue(value) {
  const cleanedValue = String(value || "").trim();

  if (
    !cleanedValue ||
    cleanedValue.toLowerCase() === "not applicable" ||
    cleanedValue.toLowerCase() === "unknown"
  ) {
    return "";
  }

  return cleanedValue;
}

function buildDecodedAssetDescription(decodedVehicle) {
  return [decodedVehicle.year, decodedVehicle.make, decodedVehicle.model]
    .map(cleanDecodedVehicleValue)
    .filter(Boolean)
    .join(" ");
}

async function decodeVinVehicleInformation(vin) {
  const normalizedVin = normalizeScannedVIN(vin);

  if (!isLikelyVIN(normalizedVin)) {
    return { year: "", make: "", model: "", assetDescription: "" };
  }

  try {
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(
        normalizedVin
      )}?format=json`
    );

    if (!response.ok) {
      throw new Error("VIN decoder request failed.");
    }

    const data = await response.json();
    const result = data?.Results?.[0] || {};
    const decodedVehicle = {
      year: cleanDecodedVehicleValue(result.ModelYear),
      make: cleanDecodedVehicleValue(result.Make),
      model: cleanDecodedVehicleValue(result.Model),
    };

    return {
      ...decodedVehicle,
      assetDescription: buildDecodedAssetDescription(decodedVehicle),
    };
  } catch {
    return { year: "", make: "", model: "", assetDescription: "" };
  }
}

function formatRTS(asset) {
  if (asset.rtsType === "TBD") return "TBD";
  if (asset.rtsType === "No RTS Established") return "—";

  if (asset.rtsType === "Estimated Date" && asset.rtsDate) {
    const date = new Date(`${asset.rtsDate}T00:00:00`);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  return "—";
}

const initialAssets = [
  {
    unit: "1042",
    vin: "1FT7X2B60NEC10420",
    department: "Public Works",
    asset: "Ford F-250",
    status: "Waiting Parts",
    statusStartedAt: "2026-07-01",
    reason: "Parts Availability",
    priority: "High",
    downSince: "2026-07-01",
    technician: "Smith",
    rtsType: "Estimated Date",
    rtsDate: "2026-07-10",
    details: "Alternator on order",
  },
  {
    unit: "2217",
    vin: "1FM5K8AB4NGA22170",
    department: "Police",
    asset: "Ford Explorer",
    status: "In Shop",
    statusStartedAt: "2026-07-05",
    reason: "Mechanical Failure",
    priority: "Medium",
    downSince: "2026-07-05",
    technician: "Jones",
    rtsType: "Estimated Date",
    rtsDate: "2026-07-08",
    details: "Brake inspection",
  },
  {
    unit: "3314",
    vin: "1GNSKLED5NR33140",
    department: "Fire",
    asset: "Chevrolet Tahoe",
    status: "Ready",
    statusStartedAt: getTodayDateString(),
    reason: "Available",
    priority: "Normal",
    downSince: "",
    technician: "Unassigned",
    rtsType: "No RTS Established",
    rtsDate: "",
    details: "Available",
  },
  {
    unit: "5088",
    vin: "3ALACWFC8ND50880",
    department: "Solid Waste",
    asset: "Freightliner M2",
    status: "Down",
    statusStartedAt: "2026-06-26",
    reason: "Mechanical Failure",
    priority: "Critical",
    downSince: "2026-06-26",
    technician: "Garcia",
    rtsType: "TBD",
    rtsDate: "",
    details: "Hydraulic leak",
  },
  {
    unit: "6120",
    vin: "1LV5065EEN061200",
    department: "Parks",
    asset: "John Deere Tractor",
    status: "Awaiting QC",
    statusStartedAt: "2026-07-07",
    reason: "Inspection / QC",
    priority: "Normal",
    downSince: "2026-07-07",
    technician: "Unassigned",
    rtsType: "No RTS Established",
    rtsDate: "",
    details: "250-hour service due",
  },
  {
    unit: "7741",
    vin: "3C7WRKBL6NG77410",
    department: "Utilities",
    asset: "RAM 3500 Service Truck",
    status: "Ready",
    statusStartedAt: getTodayDateString(),
    reason: "Available",
    priority: "Normal",
    downSince: "",
    technician: "Unassigned",
    rtsType: "No RTS Established",
    rtsDate: "",
    details: "Available",
  },
];

function createBlankAsset() {
  return {
    unit: "",
    vin: "",
    department: "",
    asset: "",
    status: "Ready",
    statusStartedAt: getTodayDateString(),
    reason: "Available",
    priority: "Normal",
    downSince: "",
    technician: "Unassigned",
    rtsType: "No RTS Established",
    rtsDate: "",
    details: "Available",
  };
}

function normalizeAsset(asset) {
  const normalizedStatus = asset.status === "Completed" ? "Ready" : asset.status || "Ready";
  const isReadyStatus = normalizedStatus === "Ready";
  const technician =
    asset.technician && asset.technician !== "—" && asset.technician !== "‚Äî"
      ? asset.technician
      : "Unassigned";

  return {
    vin: "",
    ...asset,
    status: normalizedStatus,
    reason: isReadyStatus ? "Available" : asset.reason || asset.issue || "Other",
    details: asset.details || asset.issue || (isReadyStatus ? "Available" : "Details pending"),
    statusStartedAt: asset.statusStartedAt || asset.downSince || getTodayDateString(),
    technician,
    downSince: isReadyStatus ? "" : asset.downSince || getTodayDateString(),
    rtsType: isReadyStatus ? "No RTS Established" : asset.rtsType || "No RTS Established",
    rtsDate: isReadyStatus ? "" : asset.rtsDate || "",
  };
}

function normalizeCompletedRepairEvent(event) {
  return {
    ...event,
    finalStatus: event.finalStatus || "Ready",
    recordType: "Historical Repair Event",
    technician:
      event.technician && event.technician !== "—" && event.technician !== "‚Äî"
        ? event.technician
        : "Unassigned",
  };
}

function normalizeImportedAsset(row) {
  const importedStatus = findOptionMatch(row.status, STATUS_OPTIONS) || "Ready";
  const isReadyStatus = importedStatus === "Ready";
  const priority = findOptionMatch(row.priority, PRIORITY_OPTIONS) || "Normal";
  const reason = isReadyStatus ? "Available" : findOptionMatch(row.reason, REASON_OPTIONS) || "Other";
  const rtsType = isReadyStatus
    ? "No RTS Established"
    : findOptionMatch(row.rtsType, RTS_TYPE_OPTIONS) || "No RTS Established";
  const downSince = isReadyStatus ? "" : String(row.downSince || "").trim() || getTodayDateString();

  return {
    unit: String(row.unit || "").trim(),
    vin: String(row.vin || "").trim().toUpperCase(),
    department: String(row.department || "").trim(),
    asset: String(row.asset || "").trim(),
    status: importedStatus,
    statusStartedAt: isReadyStatus ? getTodayDateString() : downSince,
    reason,
    priority,
    downSince,
    technician: String(row.technician || "").trim() || "Unassigned",
    rtsType,
    rtsDate: !isReadyStatus && rtsType === "Estimated Date" ? String(row.rtsDate || "").trim() : "",
    details: String(row.details || "").trim() || (isReadyStatus ? "Available" : "Details pending"),
  };
}
function mapSupabaseAsset(row) {
  return normalizeAsset({
    unit: row.unit || "",
    vin: row.vin || "",
    department: row.department || "",
    asset: row.asset || "",
    status: row.status || "Ready",
    statusStartedAt: row.status_started_at || row.down_since || getTodayDateString(),
    reason: row.reason || "Available",
    priority: row.priority || "Normal",
    downSince: row.down_since || "",
    technician: row.technician || "Unassigned",
    rtsType: row.rts_type || "No RTS Established",
    rtsDate: row.rts_date || "",
    details: row.details || "Available",
  });
}
function loadSavedAssets(organizationId) {
  const storageKey = getOrganizationStorageKey(STORAGE_KEY, organizationId);
  if (!storageKey) return [];

  const savedAssets = localStorage.getItem(storageKey);
  if (!savedAssets) return [];

  try {
    return JSON.parse(savedAssets).map(normalizeAsset);
  } catch {
    return [];
  }
}

function mapSupabaseRepairHistory(row) {
  return normalizeCompletedRepairEvent({
    id: row.id,
    unit: row.unit || "",
    department: row.department || "",
    asset: row.asset || "",
    recordType: row.record_type || "Historical Repair Event",
    status: row.prior_status || "Unknown",
    finalStatus: row.final_status || "Ready",
    reason: row.reason || "Other",
    priority: row.priority || "Normal",
    finalDaysDown: row.days_down ?? 0,
    technician: row.technician || "Unassigned",
    completedDate: row.completed || "",
    details: row.details || "Details pending",
  });
}

function loadCompletedRepairEvents(organizationId) {
  const storageKey = getOrganizationStorageKey(COMPLETED_STORAGE_KEY, organizationId);
  if (!storageKey) return [];

  const savedEvents = localStorage.getItem(storageKey);
  if (!savedEvents) return [];

  try {
    return JSON.parse(savedEvents).map(normalizeCompletedRepairEvent);
  } catch {
    return [];
  }
}

function mapSupabaseStatusHistory(row) {
  const changedAt = row.changed_at || new Date().toISOString();
  const changedDate = changedAt.slice(0, 10);
  const statusStartedAt = row.status_started_at || changedDate;
  const statusEndedAt = row.status_ended_at || changedDate;

  return {
    id: row.id,
    unit: row.unit || "",
    vin: "",
    department: row.department || "",
    asset: row.asset || "",
    previousStatus: row.from_status || "Unknown",
    newStatus: row.to_status || "Unknown",
    reason: row.reason || "Other",
    details: row.details || "Details pending",
    technician: row.technician || "Unassigned",
    statusStartedAt,
    statusEndedAt,
    durationDays:
      row.duration_minutes != null
        ? Number(row.duration_minutes) / (24 * 60)
        : row.duration_days ?? calculateStatusDurationDays(statusStartedAt, statusEndedAt),
    recordedAt: changedAt,
  };
}

function loadStatusHistoryEvents(organizationId) {
  const storageKey = getOrganizationStorageKey(STATUS_HISTORY_STORAGE_KEY, organizationId);
  if (!storageKey) return [];

  const savedEvents = localStorage.getItem(storageKey);
  if (!savedEvents) return [];

  try {
    return JSON.parse(savedEvents);
  } catch {
    return [];
  }
}

function createStatusHistoryEvent(previousAsset, updatedAsset, statusHistoryEvents = []) {
  const recordedAt = new Date().toISOString();
  const latestTransitionIntoCurrentStatus = statusHistoryEvents
    .filter(
      (event) =>
        event.unit === previousAsset.unit &&
        event.newStatus === previousAsset.status &&
        event.recordedAt
    )
    .sort((firstEvent, secondEvent) =>
      String(secondEvent.recordedAt).localeCompare(String(firstEvent.recordedAt))
    )[0];
  const statusStartedAt =
    latestTransitionIntoCurrentStatus?.recordedAt ||
    previousAsset.statusStartedAt ||
    previousAsset.downSince ||
    getTodayDateString();
  const statusEndedAt = recordedAt;

  return {
    id: `${previousAsset.unit}-${previousAsset.status}-${updatedAsset.status}-${Date.now()}`,
    unit: previousAsset.unit,
    vin: updatedAsset.vin || previousAsset.vin || "",
    department: updatedAsset.department || previousAsset.department,
    asset: updatedAsset.asset || previousAsset.asset,
    previousStatus: previousAsset.status,
    newStatus: updatedAsset.status,
    reason: updatedAsset.reason || previousAsset.reason || "Other",
    details: updatedAsset.details || previousAsset.details || "Details pending",
    technician: updatedAsset.technician || previousAsset.technician || "Unassigned",
    statusStartedAt,
    statusEndedAt,
    durationDays: calculateStatusDurationDays(statusStartedAt, statusEndedAt),
    recordedAt,
  };
}

function buildDailySummary(assets) {
  const assetsWithDaysDown = assets.map((asset) => ({
    ...asset,
    daysDown: calculateDaysDown(asset.downSince, asset.status),
  }));

  const totalAssets = assetsWithDaysDown.length;
  const readyAssets = assetsWithDaysDown.filter((asset) => asset.status === "Ready");
  const unavailableAssets = assetsWithDaysDown.filter((asset) => asset.status !== "Ready");
  const waitingPartsAssets = assetsWithDaysDown.filter((asset) => asset.status === "Waiting Parts");
  const criticalUnavailableAssets = unavailableAssets.filter((asset) => asset.priority === "Critical");
  const tbdAssets = unavailableAssets.filter((asset) => asset.rtsType === "TBD");
  const noRtsAssets = unavailableAssets.filter((asset) => asset.rtsType === "No RTS Established");
  const agingThreshold = 7;
  const agedAssets = unavailableAssets.filter((asset) => asset.daysDown >= agingThreshold);
  const longestDownAsset = [...unavailableAssets].sort((a, b) => b.daysDown - a.daysDown)[0];

  const departmentCounts = unavailableAssets.reduce((counts, asset) => {
    counts[asset.department] = (counts[asset.department] || 0) + 1;
    return counts;
  }, {});

  return {
    totalAssets,
    readyAssets,
    unavailableAssets,
    waitingPartsAssets,
    criticalUnavailableAssets,
    tbdAssets,
    noRtsAssets,
    agedAssets,
    longestDownAsset,
    departmentWatch: Object.entries(departmentCounts)
      .map(([department, count]) => `${department}: ${count}`)
      .join(" | "),
    availability: totalAssets > 0 ? ((readyAssets.length / totalAssets) * 100).toFixed(1) : "0.0",
    agingThreshold,
  };
}



function buildTechnicianAnalytics(assets, completedRepairRecords) {
  const activeAssets = assets
    .filter((asset) => asset.status !== "Ready")
    .map((asset) => ({
      ...asset,
      daysDown: calculateDaysDown(asset.downSince, asset.status),
      technician:
        asset.technician && asset.technician !== "—" && asset.technician !== "‚Äî"
          ? asset.technician
          : "Unassigned",
    }));

  const completedRecords = completedRepairRecords.map((record) => ({
    ...record,
    technician:
      record.technician && record.technician !== "—" && record.technician !== "‚Äî"
        ? record.technician
        : "Unassigned",
    repairDuration: Number(record.daysDownDisplay ?? record.finalDaysDown ?? 0),
  }));

  const technicianNames = Array.from(
    new Set([
      ...activeAssets.map((asset) => asset.technician),
      ...completedRecords.map((record) => record.technician),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const rows = technicianNames.map((technician) => {
    const assignedAssets = activeAssets.filter((asset) => asset.technician === technician);
    const completedRepairs = completedRecords.filter((record) => record.technician === technician);
    const totalActiveDaysDown = assignedAssets.reduce((sum, asset) => sum + asset.daysDown, 0);
    const totalCompletedDuration = completedRepairs.reduce(
      (sum, record) => sum + record.repairDuration,
      0
    );
    const longestOpenAsset = [...assignedAssets].sort((a, b) => b.daysDown - a.daysDown)[0];

    return {
      technician,
      activeUnits: assignedAssets.length,
      averageActiveDaysDown:
        assignedAssets.length > 0 ? (totalActiveDaysDown / assignedAssets.length).toFixed(1) : "0.0",
      longestOpenUnit: longestOpenAsset ? longestOpenAsset.unit : "—",
      longestOpenDays: longestOpenAsset ? longestOpenAsset.daysDown : 0,
      completedRepairs: completedRepairs.length,
      averageRepairDuration:
        completedRepairs.length > 0
          ? formatStatusDuration(totalCompletedDuration / completedRepairs.length)
          : "0 minutes",
    };
  });

  const activeTechnicians = rows.filter(
    (row) => row.technician !== "Unassigned" && row.activeUnits > 0
  ).length;
  const assignedActiveRepairs = activeAssets.filter(
    (asset) => asset.technician !== "Unassigned"
  ).length;
  const unassignedRepairs = activeAssets.filter((asset) => asset.technician === "Unassigned").length;
  const totalActiveDaysDown = activeAssets.reduce((sum, asset) => sum + asset.daysDown, 0);

  return {
    rows,
    activeTechnicians,
    assignedActiveRepairs,
    unassignedRepairs,
    averageActiveDaysDown:
      activeAssets.length > 0 ? (totalActiveDaysDown / activeAssets.length).toFixed(1) : "0.0",
  };
}


function buildStatusDurationAnalytics(assets, statusHistoryEvents) {
  const activeAssets = assets.filter((asset) => asset.status !== "Ready");

  const normalizedHistoryEvents = statusHistoryEvents
    .filter((event) => STATUS_DURATION_STATUS_OPTIONS.includes(event.previousStatus))
    .map((event) => ({
      ...event,
      durationDays: Number(event.durationDays ?? 0),
    }));

  const totalRecordedDuration = normalizedHistoryEvents.reduce(
    (sum, event) => sum + event.durationDays,
    0
  );

  const rows = STATUS_DURATION_STATUS_OPTIONS.map((status) => {
    const currentUnits = activeAssets.filter((asset) => asset.status === status).length;
    const completedEvents = normalizedHistoryEvents.filter(
      (event) => event.previousStatus === status
    );
    const completedStatusEvents = completedEvents.length;
    const totalDuration = completedEvents.reduce((sum, event) => sum + event.durationDays, 0);
    const longestDuration =
      completedEvents.length > 0
        ? Math.max(...completedEvents.map((event) => event.durationDays))
        : 0;

    return {
      status,
      currentUnits,
      completedStatusEvents,
      averageDuration:
        completedStatusEvents > 0
          ? formatStatusDuration(totalDuration / completedStatusEvents)
          : "0 minutes",
      longestDuration: formatStatusDuration(longestDuration),
      totalDuration,
      percentageOfRecordedDowntime:
        totalRecordedDuration > 0 ? ((totalDuration / totalRecordedDuration) * 100).toFixed(1) : "0.0",
    };
  });

  const trackedStatusTransitions = normalizedHistoryEvents.length;
  const averageRecordedStatusDuration =
    trackedStatusTransitions > 0
      ? formatStatusDuration(totalRecordedDuration / trackedStatusTransitions)
      : "0 minutes";
  const longestRecordedStatusDuration =
    normalizedHistoryEvents.length > 0
      ? formatStatusDuration(
          Math.max(...normalizedHistoryEvents.map((event) => event.durationDays))
        )
      : "0 minutes";
  const currentLargestBottleneck = [...rows].sort((a, b) => b.currentUnits - a.currentUnits)[0];

  return {
    rows,
    trackedStatusTransitions,
    averageRecordedStatusDuration,
    longestRecordedStatusDuration,
    currentLargestBottleneck:
      currentLargestBottleneck && currentLargestBottleneck.currentUnits > 0
        ? currentLargestBottleneck
        : null,
  };
}

function App() {
  const [assets, setAssets] = useState([]);
  const [completedRepairEvents, setCompletedRepairEvents] = useState([]);
  const [statusHistoryEvents, setStatusHistoryEvents] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [editAsset, setEditAsset] = useState(null);
  const [newAsset, setNewAsset] = useState(null);
  const [showDailySummary, setShowDailySummary] = useState(false);
  const [activeView, setActiveView] = useState("command");
  const [fleetSearch, setFleetSearch] = useState("");
  const [fleetStatusFilter, setFleetStatusFilter] = useState("All Statuses");
  const [importStatus, setImportStatus] = useState("");
  const csvInputRef = useRef(null);
  const vinScannerVideoRef = useRef(null);
  const vinScannerControlsRef = useRef(null);
  const vinScanLockedRef = useRef(false);
  const [showVinScanner, setShowVinScanner] = useState(false);
  const [vinScanStatus, setVinScanStatus] = useState("");
  const [lastScannedVin, setLastScannedVin] = useState("");
  const [manualVinEntry, setManualVinEntry] = useState("");
  const [pendingNewAssetDraft, setPendingNewAssetDraft] = useState(null);
  const [scannerRunId, setScannerRunId] = useState(0);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showPasswordResetRequest, setShowPasswordResetRequest] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [resetRequestMessage, setResetRequestMessage] = useState("");
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordUpdateError, setPasswordUpdateError] = useState("");
  const [organizationId, setOrganizationId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [organizationError, setOrganizationError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function initializeAuthentication() {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        console.error("ARGOS authentication session check failed:", error);
        setAuthError("ARGOS could not verify the current login session.");
      }

      setSession(data?.session || null);
      setAuthLoading(false);
    }

    initializeAuthentication();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setAuthLoading(false);
      setAuthError("");

      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryMode(true);
        setPasswordUpdateError("");
      }

      if (event === "SIGNED_OUT") {
        setPasswordRecoveryMode(false);
        setNewPassword("");
        setConfirmNewPassword("");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!session?.user?.id) {
      setOrganizationId(null);
      setProfile(null);
      setAssets([]);
      setCompletedRepairEvents([]);
      setStatusHistoryEvents([]);
      setActiveView("command");
      setOrganizationLoading(false);
      setOrganizationError("");
      return undefined;
    }

    async function resolveOrganizationContext() {
      setOrganizationLoading(true);
      setOrganizationError("");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, organization_id, full_name, role")
        .eq("id", session.user.id)
        .single();

      if (!isMounted) return;

      if (error) {
        console.error("ARGOS profile lookup failed:", error);
        setOrganizationId(null);
        setProfile(null);
        setOrganizationError(
          "ARGOS could not resolve this user's organization profile. Confirm the user has a profiles row."
        );
        setOrganizationLoading(false);
        return;
      }

      if (!data?.organization_id) {
        setOrganizationId(null);
        setProfile(data || null);
        setOrganizationError("This ARGOS user is not assigned to an organization.");
        setOrganizationLoading(false);
        return;
      }

      const resolvedOrganizationId = data.organization_id;
      setProfile(data);
      setOrganizationId(resolvedOrganizationId);
      setAssets(loadSavedAssets(resolvedOrganizationId));
      setCompletedRepairEvents(loadCompletedRepairEvents(resolvedOrganizationId));
      setStatusHistoryEvents(loadStatusHistoryEvents(resolvedOrganizationId));
      setActiveView(
        localStorage.getItem(
          getOrganizationStorageKey(ACTIVE_VIEW_STORAGE_KEY, resolvedOrganizationId)
        ) || "command"
      );
      setOrganizationLoading(false);
    }

    resolveOrganizationContext();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id]);

useEffect(() => {
  if (!session || !organizationId) return;

  async function loadCloudAssets() {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("ARGOS cloud asset load failed:", error);
      return;
    }

    setAssets((data || []).map(mapSupabaseAsset));
  }

  loadCloudAssets();
}, [session, organizationId]);

useEffect(() => {
  if (!session || !organizationId) return;

  async function loadCloudRepairHistory() {
    const { data, error } = await supabase
      .from("repair_history")
      .select("*")
      .eq("organization_id", organizationId)
      .order("completed", { ascending: false });

    if (error) {
      console.error("ARGOS cloud repair history load failed:", error);
      return;
    }

    setCompletedRepairEvents((data || []).map(mapSupabaseRepairHistory));
  }

  loadCloudRepairHistory();
}, [session, organizationId]);

useEffect(() => {
  if (!session || !organizationId) return;

  async function loadCloudStatusHistory() {
    const { data, error } = await supabase
      .from("status_history")
      .select("*")
      .eq("organization_id", organizationId)
      .order("changed_at", { ascending: false });

    if (error) {
      console.error("ARGOS cloud status history load failed:", error);
      return;
    }

    setStatusHistoryEvents((data || []).map(mapSupabaseStatusHistory));
  }

  loadCloudStatusHistory();
}, [session, organizationId]);
  useEffect(() => {
    const storageKey = getOrganizationStorageKey(STORAGE_KEY, organizationId);
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(assets));
  }, [assets, organizationId]);

  useEffect(() => {
    const storageKey = getOrganizationStorageKey(COMPLETED_STORAGE_KEY, organizationId);
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(completedRepairEvents));
  }, [completedRepairEvents, organizationId]);

  useEffect(() => {
    const storageKey = getOrganizationStorageKey(STATUS_HISTORY_STORAGE_KEY, organizationId);
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(statusHistoryEvents));
  }, [statusHistoryEvents, organizationId]);

  useEffect(() => {
    const storageKey = getOrganizationStorageKey(ACTIVE_VIEW_STORAGE_KEY, organizationId);
    if (!storageKey) return;
    localStorage.setItem(storageKey, activeView);
  }, [activeView, organizationId]);

  useEffect(() => {
    if (!pendingNewAssetDraft || showVinScanner) return;

    setSelectedAsset(null);
    setEditAsset(null);
    setActiveView("command");
    setNewAsset({
      ...createBlankAsset(),
      vin: pendingNewAssetDraft.vin || "",
      asset: pendingNewAssetDraft.asset || "",
      __fromVinScan: true,
      __decodedAssetDescription: pendingNewAssetDraft.asset || "",
    });
    setPendingNewAssetDraft(null);
  }, [pendingNewAssetDraft, showVinScanner]);

  useEffect(() => {
    if (!showVinScanner) return undefined;

    let isCancelled = false;
    const codeReader = new BrowserMultiFormatReader();

    async function startVinScanner() {
      if (!vinScannerVideoRef.current) return;

      setLastScannedVin("");
      setVinScanStatus("Starting camera. Allow camera access when prompted.");

      try {
        const videoDevices = await BrowserMultiFormatReader.listVideoInputDevices();
        const preferredCamera =
          videoDevices.find((device) => device.label.toLowerCase().includes("back")) ||
          videoDevices.find((device) => device.label.toLowerCase().includes("rear")) ||
          videoDevices.find((device) => device.label.toLowerCase().includes("environment")) ||
          videoDevices[videoDevices.length - 1];

        const controls = await codeReader.decodeFromVideoDevice(
          preferredCamera?.deviceId,
          vinScannerVideoRef.current,
          (result) => {
            if (isCancelled || !result) return;

            handleVinScanResult(result.getText(), "scanner");
          }
        );

        if (!isCancelled) {
          vinScannerControlsRef.current = controls;
          setVinScanStatus(
            preferredCamera
              ? `Camera active (${preferredCamera.label || "rear camera"}). Center the VIN barcode or registration barcode in view.`
              : "Camera active. Center the VIN barcode or registration barcode in view."
          );
        } else {
          controls.stop();
        }
      } catch (error) {
        setVinScanStatus("ARGOS could not start the camera. Confirm browser camera permissions and use HTTPS or localhost.");
      }
    }

    startVinScanner();

    return () => {
      isCancelled = true;
      vinScannerControlsRef.current?.stop();
      vinScannerControlsRef.current = null;
    };
  }, [showVinScanner, scannerRunId, assets]);

  const activeBoardAssets = assets.filter((asset) => asset.status !== "Ready");
  const readyArchiveAssets = assets.filter((asset) => asset.status === "Ready");
  const normalizedFleetSearch = fleetSearch.trim().toLowerCase();
  const filteredFleetAssets = [...assets]
    .filter((asset) => {
      const matchesUnitSearch =
        !normalizedFleetSearch ||
        String(asset.unit || "").toLowerCase().includes(normalizedFleetSearch);
      const matchesStatusFilter =
        fleetStatusFilter === "All Statuses" || asset.status === fleetStatusFilter;

      return matchesUnitSearch && matchesStatusFilter;
    })
    .sort((firstAsset, secondAsset) =>
      String(firstAsset.unit || "").localeCompare(String(secondAsset.unit || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

const validCompletedRepairEvents = completedRepairEvents.filter(
  (event) => event.status && event.status !== "Ready" && (event.finalStatus || "Ready") === "Ready"
);

const dedupedCompletedRepairEvents = validCompletedRepairEvents.filter((event, index, events) => {
  const completedDate = event.completedDate || event.statusEndedAt || event.statusStartedAt || "";
  const eventKey = `${event.unit}-${completedDate}`;

  return (
    index ===
    events.findIndex((candidate) => {
      const candidateDate =
        candidate.completedDate || candidate.statusEndedAt || candidate.statusStartedAt || "";
      const candidateKey = `${candidate.unit}-${candidateDate}`;

      return candidateKey === eventKey;
    })
  );
});

const completedRepairRecords = dedupedCompletedRepairEvents.map((event) => ({
  ...event,
  recordId: `completed-${event.id || event.unit}-${event.completedDate || event.statusEndedAt || ""}`,
  recordType: "Historical Repair Event",
  priorStatus: event.status || "Unknown",
  finalStatus: event.finalStatus || "Ready",
  completedDisplayDate: event.completedDate || event.statusEndedAt || event.statusStartedAt,
  daysDownDisplay: event.finalDaysDown ?? calculateFinalDaysDown(event.downSince),
}));

  const totalAssets = assets.length;
  const readyAssets = readyArchiveAssets.length;
  const unavailableAssets = activeBoardAssets.length;
  const waitingParts = activeBoardAssets.filter((asset) => asset.status === "Waiting Parts").length;
  const criticalAssets = activeBoardAssets.filter((asset) => asset.priority === "Critical").length;
  const availability = totalAssets > 0 ? ((readyAssets / totalAssets) * 100).toFixed(1) : "0.0";
  const dailySummary = buildDailySummary(assets);
  const technicianAnalytics = buildTechnicianAnalytics(assets, completedRepairRecords);

  const statusDurationAnalytics = buildStatusDurationAnalytics(assets, statusHistoryEvents);

  function handleSelectAsset(asset) {
    const liveAsset = assets.find((currentAsset) => currentAsset.unit === asset.unit) || asset;
    setSelectedAsset(liveAsset);
    setEditAsset(normalizeAsset(liveAsset));
  }

  function cleanAsset(assetToClean) {
    const { __fromVinScan, __decodedAssetDescription, ...assetFields } = assetToClean;
    const isReadyStatus = assetFields.status === "Ready";

    return {
      ...assetFields,
      unit: assetFields.unit.trim(),
      vin: assetFields.vin.trim().toUpperCase(),
      department: assetFields.department.trim(),
      asset: assetFields.asset.trim(),
      technician:
        assetFields.technician && assetFields.technician.trim() && assetFields.technician !== "—"
          ? assetFields.technician.trim()
          : "Unassigned",
      reason: isReadyStatus ? "Available" : assetFields.reason || "Other",
      priority: isReadyStatus ? assetFields.priority || "Normal" : assetFields.priority,
      downSince: isReadyStatus ? "" : assetFields.downSince || getTodayDateString(),
      rtsType: isReadyStatus ? "No RTS Established" : assetFields.rtsType,
      rtsDate: isReadyStatus ? "" : assetFields.rtsDate,
      details: assetFields.details.trim() || (isReadyStatus ? "Available" : "Details pending"),
    };
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setEditAsset((currentAsset) => ({ ...currentAsset, [name]: value }));
  }

  function handleNewAssetChange(event) {
    const { name, value } = event.target;
    setNewAsset((currentAsset) => ({ ...currentAsset, [name]: value }));
  }

  function applyStatusChange(currentAsset, newStatus) {
    const wasReady = currentAsset.status === "Ready";
    const isNowReady = newStatus === "Ready";
    const statusChanged = currentAsset.status !== newStatus;

    return {
      ...currentAsset,
      status: newStatus,
      statusStartedAt: statusChanged ? getTodayDateString() : currentAsset.statusStartedAt,
      reason: isNowReady ? "Available" : currentAsset.reason === "Available" ? "Other" : currentAsset.reason,
      downSince: isNowReady
        ? ""
        : wasReady && !currentAsset.downSince
          ? getTodayDateString()
          : currentAsset.downSince || getTodayDateString(),
      rtsType: isNowReady ? "No RTS Established" : currentAsset.rtsType,
      rtsDate: isNowReady ? "" : currentAsset.rtsDate,
      details: isNowReady ? "Available" : currentAsset.details === "Available" ? "" : currentAsset.details,
    };
  }

  function handleStatusChange(event) {
    setEditAsset((currentAsset) => applyStatusChange(currentAsset, event.target.value));
  }

  function handleNewAssetStatusChange(event) {
    setNewAsset((currentAsset) => applyStatusChange(currentAsset, event.target.value));
  }

  function handleRTSTypeChange(event) {
    const newRTSType = event.target.value;
    setEditAsset((currentAsset) => ({
      ...currentAsset,
      rtsType: newRTSType,
      rtsDate: newRTSType === "Estimated Date" ? currentAsset.rtsDate : "",
    }));
  }

  function handleNewAssetRTSTypeChange(event) {
    const newRTSType = event.target.value;
    setNewAsset((currentAsset) => ({
      ...currentAsset,
      rtsType: newRTSType,
      rtsDate: newRTSType === "Estimated Date" ? currentAsset.rtsDate : "",
    }));
  }

  function validateAsset(updatedAsset, originalUnit = "", originalVin = "") {
    if (!updatedAsset.unit || !updatedAsset.department || !updatedAsset.asset) {
      alert("Unit, Department, and Asset are required.");
      return false;
    }

    const unitAlreadyExists = assets.some(
      (asset) =>
        asset.unit.toLowerCase() !== originalUnit.toLowerCase() &&
        asset.unit.toLowerCase() === updatedAsset.unit.toLowerCase()
    );

    if (unitAlreadyExists) {
      alert("That unit number already exists in ARGOS.");
      return false;
    }

    const vinAlreadyExists =
      updatedAsset.vin &&
      assets.some(
        (asset) =>
          (asset.vin || "").toLowerCase() !== originalVin.toLowerCase() &&
          (asset.vin || "").toLowerCase() === updatedAsset.vin.toLowerCase()
      );

    if (vinAlreadyExists) {
      alert("That VIN already exists in ARGOS.");
      return false;
    }

    return true;
  }

  async function handleSave() {
    const originalUnit = selectedAsset.unit;
    const originalVin = selectedAsset.vin || "";
    const statusChanged = selectedAsset.status !== editAsset.status;

    const updatedAsset = cleanAsset({
      ...editAsset,
      statusStartedAt: statusChanged ? getTodayDateString() : editAsset.statusStartedAt,
    });

    if (!validateAsset(updatedAsset, originalUnit, originalVin)) return;

    const isCompletingRepairEvent = selectedAsset.status !== "Ready" && updatedAsset.status === "Ready";

    if (isCompletingRepairEvent) {
      const shouldComplete = window.confirm(
        `Return Unit ${selectedAsset.unit} to Ready? This will move the active repair event to Repair History and remove the unit from the Command Center.`
      );

      if (!shouldComplete) return;

      const completedEvent = {
        ...selectedAsset,
        vin: updatedAsset.vin,
        reason: selectedAsset.reason || updatedAsset.reason,
        details: selectedAsset.details || updatedAsset.details,
        statusStartedAt: selectedAsset.statusStartedAt || selectedAsset.downSince || getTodayDateString(),
        statusEndedAt: getTodayDateString(),
        id: `${selectedAsset.unit}-${Date.now()}`,
        completedDate: getTodayDateString(),
        finalDaysDown: calculateFinalDaysDown(selectedAsset.downSince),
        finalStatus: "Ready",
        completionNote: "Returned to Ready",
      };

      const returnedAsset = {
        ...updatedAsset,
        status: "Ready",
        statusStartedAt: getTodayDateString(),
        reason: "Available",
        priority: "Normal",
        downSince: "",
        rtsType: "No RTS Established",
        rtsDate: "",
        details: "Available",
      };

      const { data, error } = await supabase
  .from("assets")
  .update({
    unit: returnedAsset.unit,
    vin: returnedAsset.vin,
    department: returnedAsset.department,
    asset: returnedAsset.asset,
    status: returnedAsset.status,
    status_started_at: returnedAsset.statusStartedAt,
    reason: returnedAsset.reason,
    priority: returnedAsset.priority,
    down_since: returnedAsset.downSince,
    technician: returnedAsset.technician,
    rts_type: returnedAsset.rtsType,
    rts_date: returnedAsset.rtsDate,
    details: returnedAsset.details,
    updated_at: new Date().toISOString(),
  })
  .eq("organization_id", organizationId)
  .eq("unit", originalUnit)
  .select()
  .single();

if (error) {
  console.error("ARGOS cloud return-to-ready update failed:", error);
  alert("ARGOS could not return this asset to Ready in the cloud.");
  return;
}

const savedReturnedAsset = mapSupabaseAsset(data);

const { data: savedRepairHistory, error: repairHistoryError } = await supabase
  .from("repair_history")
  .insert({
    organization_id: organizationId,
    unit: completedEvent.unit,
    department: completedEvent.department,
    asset: completedEvent.asset,
    record_type: "Historical Repair Event",
    prior_status: completedEvent.status,
    final_status: completedEvent.finalStatus,
    reason: completedEvent.reason,
    priority: completedEvent.priority,
    days_down: completedEvent.finalDaysDown,
    technician: completedEvent.technician || "Unassigned",
    completed: completedEvent.completedDate,
    details: completedEvent.details,
  })
  .select()
  .single();

if (repairHistoryError) {
  console.error("ARGOS cloud repair history creation failed:", repairHistoryError);
  alert(
    "The asset was returned to Ready, but ARGOS could not save its Repair History record to the cloud."
  );
  return;
}

const savedCompletedEvent = normalizeCompletedRepairEvent({
  id: savedRepairHistory.id,
  unit: savedRepairHistory.unit,
  department: savedRepairHistory.department,
  asset: savedRepairHistory.asset,
  recordType: savedRepairHistory.record_type,
  status: savedRepairHistory.prior_status,
  finalStatus: savedRepairHistory.final_status,
  reason: savedRepairHistory.reason,
  priority: savedRepairHistory.priority,
  finalDaysDown: savedRepairHistory.days_down,
  technician: savedRepairHistory.technician,
  completedDate: savedRepairHistory.completed,
  details: savedRepairHistory.details,
});
const returnToReadyStatusHistoryEvent = createStatusHistoryEvent(
  selectedAsset,
  savedReturnedAsset,
  statusHistoryEvents
);

const { data: savedReturnStatusHistory, error: returnStatusHistoryError } = await supabase
  .from("status_history")
  .insert({
    organization_id: organizationId,
    unit: returnToReadyStatusHistoryEvent.unit,
    department: returnToReadyStatusHistoryEvent.department,
    asset: returnToReadyStatusHistoryEvent.asset,
    from_status: returnToReadyStatusHistoryEvent.previousStatus,
    to_status: returnToReadyStatusHistoryEvent.newStatus,
    reason: returnToReadyStatusHistoryEvent.reason,
    priority: selectedAsset.priority || "Normal",
    technician: returnToReadyStatusHistoryEvent.technician || "Unassigned",
    changed_at: returnToReadyStatusHistoryEvent.recordedAt,
    status_started_at: String(returnToReadyStatusHistoryEvent.statusStartedAt).slice(0, 10),
    status_ended_at: String(returnToReadyStatusHistoryEvent.statusEndedAt).slice(0, 10),
    duration_days: Math.floor(returnToReadyStatusHistoryEvent.durationDays),
    duration_minutes: Math.max(
      0,
      Math.round(returnToReadyStatusHistoryEvent.durationDays * 24 * 60)
    ),
    details: returnToReadyStatusHistoryEvent.details,
  })
  .select()
  .single();

if (returnStatusHistoryError) {
  console.error(
    "ARGOS cloud return-to-ready status history creation failed:",
    returnStatusHistoryError
  );
  alert(
    "The asset and Repair History were saved, but ARGOS could not save the Status History record to the cloud."
  );
  return;
}

setStatusHistoryEvents((currentEvents) => [
  {
    ...returnToReadyStatusHistoryEvent,
    id: savedReturnStatusHistory.id,
  },
  ...currentEvents,
]);
setCompletedRepairEvents((currentEvents) => [savedCompletedEvent, ...currentEvents]);
setAssets((currentAssets) =>
  currentAssets.map((asset) => (asset.unit === originalUnit ? savedReturnedAsset : asset))
);

setSelectedAsset(null);
setEditAsset(null);
setActiveView("history");
return;
    }

    if (statusChanged) {
      const statusHistoryEvent = createStatusHistoryEvent(
        selectedAsset,
        updatedAsset,
        statusHistoryEvents
      );

      const { data: savedStatusHistory, error: statusHistoryError } = await supabase
        .from("status_history")
        .insert({
          organization_id: organizationId,
          unit: statusHistoryEvent.unit,
          department: statusHistoryEvent.department,
          asset: statusHistoryEvent.asset,
          from_status: statusHistoryEvent.previousStatus,
          to_status: statusHistoryEvent.newStatus,
          reason: statusHistoryEvent.reason,
          priority: updatedAsset.priority || "Normal",
          technician: statusHistoryEvent.technician || "Unassigned",
          changed_at: statusHistoryEvent.recordedAt,
          status_started_at: String(statusHistoryEvent.statusStartedAt).slice(0, 10),
          status_ended_at: String(statusHistoryEvent.statusEndedAt).slice(0, 10),
          duration_days: Math.floor(statusHistoryEvent.durationDays),
          duration_minutes: Math.max(
            0,
            Math.round(statusHistoryEvent.durationDays * 24 * 60)
          ),
          details: statusHistoryEvent.details,
        })
        .select()
        .single();

      if (statusHistoryError) {
        console.error("ARGOS cloud status history creation failed:", statusHistoryError);
        alert("ARGOS could not save this Status History record to the cloud.");
        return;
      }

      setStatusHistoryEvents((currentEvents) => [
        {
          ...statusHistoryEvent,
          id: savedStatusHistory.id,
        },
        ...currentEvents,
      ]);
    }

    setAssets((currentAssets) =>
      currentAssets.map((asset) => (asset.unit === originalUnit ? updatedAsset : asset))
    );

  const { data, error } = await supabase
  .from("assets")
  .update({
    unit: updatedAsset.unit,
    vin: updatedAsset.vin,
    department: updatedAsset.department,
    asset: updatedAsset.asset,
    status: updatedAsset.status,
    status_started_at: updatedAsset.statusStartedAt,
    reason: updatedAsset.reason,
    priority: updatedAsset.priority,
    down_since: updatedAsset.downSince,
    technician: updatedAsset.technician,
    rts_type: updatedAsset.rtsType,
    rts_date: updatedAsset.rtsDate,
    details: updatedAsset.details,
    updated_at: new Date().toISOString(),
  })
  .eq("organization_id", organizationId)
  .eq("unit", originalUnit)
  .select()
  .single();

if (error) {
  console.error("ARGOS cloud asset update failed:", error);
  alert("ARGOS could not save this asset update to the cloud.");
  return;
}

const savedAsset = mapSupabaseAsset(data);

setAssets((currentAssets) =>
  currentAssets.map((asset) => (asset.unit === originalUnit ? savedAsset : asset))
);

setSelectedAsset(savedAsset);
setEditAsset(null);
setActiveView(savedAsset.status === "Ready" ? "history" : "command");
  }

  async function handleSaveNewAsset() {
  const cleanedAsset = cleanAsset({
    ...newAsset,
    statusStartedAt: newAsset.statusStartedAt || getTodayDateString(),
  });

  if (!validateAsset(cleanedAsset)) return;

  const { data, error } = await supabase
    .from("assets")
    .insert({
      organization_id: organizationId,
      unit: cleanedAsset.unit,
      vin: cleanedAsset.vin,
      department: cleanedAsset.department,
      asset: cleanedAsset.asset,
      status: cleanedAsset.status,
      status_started_at: cleanedAsset.statusStartedAt,
      reason: cleanedAsset.reason,
      priority: cleanedAsset.priority,
      down_since: cleanedAsset.downSince,
      technician: cleanedAsset.technician,
      rts_type: cleanedAsset.rtsType,
      rts_date: cleanedAsset.rtsDate,
      details: cleanedAsset.details,
    })
    .select()
    .single();

  if (error) {
    console.error("ARGOS cloud asset creation failed:", error);
    alert("ARGOS could not save this asset to the cloud.");
    return;
  }

  const savedAsset = mapSupabaseAsset(data);

  setAssets((currentAssets) => [...currentAssets, savedAsset]);
  setSelectedAsset(savedAsset);
  setNewAsset(null);
  setActiveView(savedAsset.status === "Ready" ? "history" : "command");
}

  function handleDownloadCSVTemplate() {
    const exampleRow = {
      unit: "9001",
      vin: "1FTEXAMPLE0009001",
      department: "Public Works",
      asset: "Ford F-150",
      status: "Ready",
      reason: "Available",
      priority: "Normal",
      downSince: "",
      technician: "Unassigned",
      rtsType: "No RTS Established",
      rtsDate: "",
      details: "Available",
    };

    const csvContent = [
      CSV_COLUMNS.join(","),
      CSV_COLUMNS.map((column) => escapeCSVValue(exampleRow[column])).join(","),
    ].join("\n");

    downloadFile("argos-csv-template.csv", `\uFEFF${csvContent}`, "text/csv;charset=utf-8");
  }

  function handleImportCSV(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (readerEvent) => {
      const rows = parseCSVText(String(readerEvent.target?.result || ""));
      const existingUnits = new Set(assets.map((asset) => asset.unit.toLowerCase()));
      const existingVins = new Set(
        assets.map((asset) => (asset.vin || "").toLowerCase()).filter(Boolean)
      );
      const importedUnits = new Set();
      const importedVins = new Set();
      const validImportedAssets = [];
      const rejectedRows = [];

      rows.forEach((row, index) => {
        const importedAsset = normalizeImportedAsset(row);
        const rowNumber = index + 2;
        const rowErrors = [];
        const unitKey = importedAsset.unit.toLowerCase();
        const vinKey = importedAsset.vin.toLowerCase();

        if (!importedAsset.unit) rowErrors.push("missing Unit");
        if (!importedAsset.department) rowErrors.push("missing Department");
        if (!importedAsset.asset) rowErrors.push("missing Asset");
        if (unitKey && existingUnits.has(unitKey)) rowErrors.push("duplicate Unit already exists");
        if (unitKey && importedUnits.has(unitKey)) rowErrors.push("duplicate Unit inside CSV");
        if (vinKey && existingVins.has(vinKey)) rowErrors.push("duplicate VIN already exists");
        if (vinKey && importedVins.has(vinKey)) rowErrors.push("duplicate VIN inside CSV");

        if (rowErrors.length > 0) {
          rejectedRows.push(`Row ${rowNumber}: ${rowErrors.join(", ")}`);
          return;
        }

        importedUnits.add(unitKey);
        if (vinKey) importedVins.add(vinKey);
        validImportedAssets.push(importedAsset);
      });

      if (validImportedAssets.length === 0) {
        if (rejectedRows.length === 0) {
          setImportStatus("No asset rows were found in that CSV file.");
        } else {
          setImportStatus(
            `Imported 0 assets. Rejected ${rejectedRows.length} row${
              rejectedRows.length === 1 ? "" : "s"
            }: ${rejectedRows.join(" | ")}`
          );
        }

        event.target.value = "";
        return;
      }

      const cloudRows = validImportedAssets.map((asset) => ({
        organization_id: organizationId,
        unit: asset.unit,
        vin: asset.vin,
        department: asset.department,
        asset: asset.asset,
        status: asset.status,
        status_started_at: asset.statusStartedAt,
        reason: asset.reason,
        priority: asset.priority,
        down_since: asset.downSince,
        technician: asset.technician,
        rts_type: asset.rtsType,
        rts_date: asset.rtsDate,
        details: asset.details,
      }));

      const { data, error } = await supabase
        .from("assets")
        .insert(cloudRows)
        .select();

      if (error) {
        console.error("ARGOS cloud CSV import failed:", error);
        setImportStatus("ARGOS could not save the valid CSV assets to the cloud.");
        event.target.value = "";
        return;
      }

      const savedImportedAssets = (data || []).map(mapSupabaseAsset);

      setAssets((currentAssets) => [...currentAssets, ...savedImportedAssets]);
      setActiveView("command");

      if (rejectedRows.length > 0) {
        setImportStatus(
          `Imported ${savedImportedAssets.length} asset${
            savedImportedAssets.length === 1 ? "" : "s"
          }. Rejected ${rejectedRows.length} row${
            rejectedRows.length === 1 ? "" : "s"
          }: ${rejectedRows.join(" | ")}`
        );
      } else {
        setImportStatus(
          `Imported ${savedImportedAssets.length} asset${
            savedImportedAssets.length === 1 ? "" : "s"
          } successfully.`
        );
      }

      event.target.value = "";
    };

    reader.onerror = () => {
      setImportStatus("ARGOS could not read that CSV file. Please try again.");
      event.target.value = "";
    };

    reader.readAsText(file);
  }

  function exportCSVReport(filename, columns, rows, emptyMessage, successMessage) {
    if (rows.length === 0) {
      setImportStatus(emptyMessage);
      return;
    }

    const csvContent = [
      columns.map((column) => escapeCSVValue(column.header)).join(","),
      ...rows.map((row) =>
        columns
          .map((column) => {
            const value = typeof column.value === "function" ? column.value(row) : row[column.value];
            return escapeCSVValue(value);
          })
          .join(",")
      ),
    ].join("\n");

    downloadFile(filename, `\uFEFF${csvContent}`, "text/csv;charset=utf-8");
    setImportStatus(successMessage);
  }

  function handleExportUnitsDown() {
    const exportRows = activeBoardAssets.map((asset) => ({
      ...asset,
      daysDown: calculateDaysDown(asset.downSince, asset.status),
      technician:
        !asset.technician || asset.technician === "—" || asset.technician === "‚Äî"
          ? "Unassigned"
          : asset.technician,
      rts: formatRTS(asset),
    }));

    exportCSVReport(
      `argos-units-down-${getTodayDateString()}.csv`,
      [
        { header: "Unit", value: "unit" },
        { header: "VIN", value: "vin" },
        { header: "Department", value: "department" },
        { header: "Asset", value: "asset" },
        { header: "Status", value: "status" },
        { header: "Reason", value: "reason" },
        { header: "Priority", value: "priority" },
        { header: "Days Down", value: "daysDown" },
        { header: "Technician", value: "technician" },
        { header: "RTS", value: "rts" },
        { header: "Details", value: "details" },
      ],
      exportRows,
      "There are no units down to export.",
      `Exported ${exportRows.length} unit${exportRows.length === 1 ? "" : "s"} down successfully.`
    );
  }

  function handleExportRepairHistory() {
    exportCSVReport(
      `argos-repair-history-${getTodayDateString()}.csv`,
      [
        { header: "Unit", value: "unit" },
        { header: "Department", value: "department" },
        { header: "Asset", value: "asset" },
        { header: "Record Type", value: "recordType" },
        { header: "Prior Status", value: "priorStatus" },
        { header: "Final Status", value: "finalStatus" },
        { header: "Reason", value: "reason" },
        { header: "Priority", value: "priority" },
        { header: "Days Down", value: "daysDownDisplay" },
        { header: "Technician", value: "technician" },
        { header: "Completed", value: (record) => formatDate(record.completedDisplayDate) },
        { header: "Details", value: "details" },
      ],
      completedRepairRecords,
      "There are no completed repair records to export.",
      `Exported ${completedRepairRecords.length} repair history record${completedRepairRecords.length === 1 ? "" : "s"} successfully.`
    );
  }

  function handleExportTechnicianAnalytics() {
    exportCSVReport(
      `argos-technician-analytics-${getTodayDateString()}.csv`,
      [
        { header: "Technician", value: "technician" },
        { header: "Active Units", value: "activeUnits" },
        { header: "Average Active Days Down", value: "averageActiveDaysDown" },
        { header: "Longest Open Unit", value: "longestOpenUnit" },
        { header: "Longest Open Days", value: "longestOpenDays" },
        { header: "Completed Repairs", value: "completedRepairs" },
        { header: "Average Repair Duration", value: "averageRepairDuration" },
      ],
      technicianAnalytics.rows,
      "There is no technician analytics data to export.",
      `Exported ${technicianAnalytics.rows.length} technician analytics row${technicianAnalytics.rows.length === 1 ? "" : "s"} successfully.`
    );
  }

  function handleExportStatusDurationAnalytics() {
    exportCSVReport(
      `argos-status-duration-analytics-${getTodayDateString()}.csv`,
      [
        { header: "Status", value: "status" },
        { header: "Current Units", value: "currentUnits" },
        { header: "Completed Status Events", value: "completedStatusEvents" },
        { header: "Average Duration", value: "averageDuration" },
        { header: "Longest Duration", value: "longestDuration" },
        { header: "Percentage of Recorded Downtime", value: (row) => `${row.percentageOfRecordedDowntime}%` },
      ],
      statusDurationAnalytics.rows,
      "There is no status duration analytics data to export.",
      `Exported ${statusDurationAnalytics.rows.length} status duration row${statusDurationAnalytics.rows.length === 1 ? "" : "s"} successfully.`
    );
  }


  function handleOpenVinScanner() {
    vinScanLockedRef.current = false;
    setSelectedAsset(null);
    setEditAsset(null);
    setNewAsset(null);
    setLastScannedVin("");
    setManualVinEntry("");
    setPendingNewAssetDraft(null);
    setVinScanStatus("");
    setShowVinScanner(true);
    setScannerRunId((currentRunId) => currentRunId + 1);
  }

  function handleCloseVinScanner() {
    vinScanLockedRef.current = false;
    vinScannerControlsRef.current?.stop();
    vinScannerControlsRef.current = null;
    setShowVinScanner(false);
  }

  function handleScanAgain() {
    vinScanLockedRef.current = false;
    vinScannerControlsRef.current?.stop();
    vinScannerControlsRef.current = null;
    setLastScannedVin("");
    setVinScanStatus("");
    setScannerRunId((currentRunId) => currentRunId + 1);
  }

  async function openAssetFromVin(vin, sourceLabel) {
    const scannedVin = normalizeScannedVIN(vin);

    if (!isLikelyVIN(scannedVin)) {
      setLastScannedVin(scannedVin || vin);
      setVinScanStatus(
        `${sourceLabel} read a value, but ARGOS could not normalize it into a valid 17-character VIN.`
      );
      return;
    }

    const matchedAsset = assets.find(
      (asset) => normalizeScannedVIN(asset.vin) === scannedVin
    );

    vinScannerControlsRef.current?.stop();
    vinScannerControlsRef.current = null;
    setLastScannedVin(scannedVin);

    if (matchedAsset) {
      setVinScanStatus(`Matched VIN ${scannedVin} to Unit ${matchedAsset.unit}.`);
      setShowVinScanner(false);
      handleSelectAsset(matchedAsset);
      return;
    }

    setVinScanStatus("VIN scanned successfully. Decoding vehicle information...");

    const decodedVehicle = await decodeVinVehicleInformation(scannedVin);
    const decodedAssetDescription = decodedVehicle.assetDescription;

    if (decodedAssetDescription) {
      setVinScanStatus(
        `VIN scanned successfully. Vehicle identified as ${decodedAssetDescription}. Opening new asset record.`
      );
    } else {
      setVinScanStatus(
        "VIN scanned successfully, but vehicle information could not be retrieved. Opening new asset record for manual completion."
      );
    }

    setShowVinScanner(false);
    setSelectedAsset(null);
    setEditAsset(null);
    setPendingNewAssetDraft({
      vin: scannedVin,
      asset: decodedAssetDescription,
    });
    setActiveView("command");
  }

  async function handleVinScanResult(rawValue, source = "scanner") {
    if (vinScanLockedRef.current) return;

    const scannedVin = normalizeScannedVIN(rawValue);

    if (!isLikelyVIN(scannedVin)) {
      setLastScannedVin(scannedVin || rawValue);
      setVinScanStatus(
        "Barcode detected, but ARGOS could not read it as a valid 17-character VIN. Try reducing glare, moving closer, scanning the registration barcode, or entering the VIN manually."
      );
      return;
    }

    vinScanLockedRef.current = true;
    await openAssetFromVin(scannedVin, source === "manual" ? "Manual entry" : "Scanner");
  }

  function handleManualVinSubmit() {
    handleVinScanResult(manualVinEntry, "manual");
  }

  function renderAssetForm(asset, onChange, onStatusChange, onRTSTypeChange) {
    return (
      <div className="update-form">
        <label>
          Unit
          <input type="text" name="unit" value={asset.unit} onChange={onChange} />
        </label>

        <label>
          VIN
          <input type="text" name="vin" value={asset.vin} onChange={onChange} placeholder="Optional" />
        </label>

        <label>
          Department
          <input type="text" name="department" value={asset.department} onChange={onChange} />
        </label>

        <label>
          Asset
          <input type="text" name="asset" value={asset.asset} onChange={onChange} />
        </label>

        <label>
          Status
          <select name="status" value={asset.status} onChange={onStatusChange}>
            {STATUS_OPTIONS.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>

        {asset.__fromVinScan && (
          <div className="issue-field">
            <p className="eyebrow">Scanned VIN Onboarding</p>
            <strong>
              {asset.status === "Ready"
                ? "This vehicle will be added to ARGOS, but Ready assets do not appear on the Command Center."
                : "This vehicle will be added to ARGOS and will appear on the Command Center because this status requires operational visibility."}
            </strong>
          </div>
        )}

        <label>
          Reason
          <select name="reason" value={asset.reason} onChange={onChange}>
            {REASON_OPTIONS.map((reason) => (
              <option key={reason}>{reason}</option>
            ))}
          </select>
        </label>

        <label>
          Priority
          <select name="priority" value={asset.priority} onChange={onChange}>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </select>
        </label>

        {asset.status !== "Ready" && (
          <label>
            Down Since
            <input type="date" name="downSince" value={asset.downSince} onChange={onChange} />
          </label>
        )}

        <label>
          Technician / Responsible Party
          <input type="text" name="technician" value={asset.technician} onChange={onChange} />
        </label>

        {asset.status !== "Ready" && (
          <label>
            RTS Status
            <select name="rtsType" value={asset.rtsType} onChange={onRTSTypeChange}>
              {RTS_TYPE_OPTIONS.map((rtsType) => (
                <option key={rtsType}>{rtsType}</option>
              ))}
            </select>
          </label>
        )}

        {asset.status !== "Ready" && asset.rtsType === "Estimated Date" && (
          <label>
            Estimated Return to Service
            <input type="date" name="rtsDate" value={asset.rtsDate} onChange={onChange} />
          </label>
        )}

        <label className="issue-field">
          Details / Notes
          <textarea name="details" value={asset.details} onChange={onChange} rows="4" />
        </label>
      </div>
    );
  }

  if (session && passwordRecoveryMode) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          background: "linear-gradient(145deg, #06111d 0%, #0d2033 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <section
          style={{
            width: "min(430px, 100%)",
            padding: "2.25rem",
            borderRadius: "18px",
            background: "#ffffff",
            boxShadow: "0 24px 70px rgba(0, 0, 0, 0.35)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
            <p style={{ margin: "0 0 0.45rem", color: "#9a6b24", fontWeight: 800 }}>
              Secure Account Recovery
            </p>
            <h1 style={{ margin: 0, color: "#07121f", letterSpacing: "0.1em" }}>ARGOS</h1>
            <p style={{ margin: "0.5rem 0 0", color: "#5f6b78" }}>Create a new password</p>
          </div>

          <form onSubmit={handleUpdatePassword}>
            <label style={{ display: "block", marginBottom: "1rem", color: "#263443", fontWeight: 700 }}>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                style={{ width: "100%", boxSizing: "border-box", marginTop: "0.45rem", padding: "0.85rem 0.95rem", border: "1px solid #c9d1da", borderRadius: "9px", fontSize: "1rem" }}
              />
            </label>

            <label style={{ display: "block", marginBottom: "1rem", color: "#263443", fontWeight: 700 }}>
              Confirm new password
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                style={{ width: "100%", boxSizing: "border-box", marginTop: "0.45rem", padding: "0.85rem 0.95rem", border: "1px solid #c9d1da", borderRadius: "9px", fontSize: "1rem" }}
              />
            </label>

            {passwordUpdateError && (
              <p role="alert" style={{ margin: "0 0 1rem", padding: "0.75rem", borderRadius: "8px", background: "#fff1f1", color: "#9b1c1c", fontSize: "0.9rem" }}>
                {passwordUpdateError}
              </p>
            )}

            <button type="submit" disabled={isUpdatingPassword} style={{ width: "100%", padding: "0.9rem 1rem", border: 0, borderRadius: "9px", background: isUpdatingPassword ? "#637080" : "#0b1d2e", color: "#ffffff", fontSize: "1rem", fontWeight: 800, cursor: isUpdatingPassword ? "not-allowed" : "pointer" }}>
              {isUpdatingPassword ? "Updating password…" : "Update Password"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (session && organizationLoading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#07121f",
          color: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1 style={{ marginBottom: "0.4rem", letterSpacing: "0.12em" }}>ARGOS</h1>
          <p style={{ margin: 0, opacity: 0.75 }}>Loading organization profile…</p>
        </div>
      </main>
    );
  }

  if (session && organizationError) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          background: "linear-gradient(145deg, #06111d 0%, #0d2033 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <section
          style={{
            width: "min(520px, 100%)",
            padding: "2.25rem",
            borderRadius: "18px",
            background: "#ffffff",
            boxShadow: "0 24px 70px rgba(0, 0, 0, 0.35)",
            textAlign: "center",
          }}
        >
          <h1 style={{ marginTop: 0, color: "#07121f", letterSpacing: "0.1em" }}>ARGOS</h1>
          <p style={{ color: "#8f2f2f", fontWeight: 700 }}>{organizationError}</p>
          <button type="button" onClick={handleSignOut}>Log Out</button>
        </section>
      </main>
    );
  }

  async function handleSignIn(event) {
    event.preventDefault();
    setAuthError("");

    const email = authEmail.trim();

    if (!email || !authPassword) {
      setAuthError("Enter both the email address and password.");
      return;
    }

    setIsSigningIn(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: authPassword,
    });

    if (error) {
      console.error("ARGOS login failed:", error);
      setAuthError(error.message || "ARGOS could not sign in with those credentials.");
      setIsSigningIn(false);
      return;
    }

    setAuthPassword("");
    setIsSigningIn(false);
  }


  async function handleRequestPasswordReset(event) {
    event.preventDefault();
    setAuthError("");
    setResetRequestMessage("");

    const email = authEmail.trim();

    if (!email) {
      setAuthError("Enter the email address associated with your ARGOS account.");
      return;
    }

    setIsSendingResetEmail(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    if (error) {
      console.error("ARGOS password reset email failed:", error);
      setAuthError(error.message || "ARGOS could not send the password reset email.");
      setIsSendingResetEmail(false);
      return;
    }

    setResetRequestMessage(
      "Password reset instructions were sent. Check your email and follow the secure link to return to ARGOS."
    );
    setIsSendingResetEmail(false);
  }

  async function handleUpdatePassword(event) {
    event.preventDefault();
    setPasswordUpdateError("");

    if (newPassword.length < 8) {
      setPasswordUpdateError("Use a password containing at least 8 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordUpdateError("The new passwords do not match.");
      return;
    }

    setIsUpdatingPassword(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      console.error("ARGOS password update failed:", error);
      setPasswordUpdateError(error.message || "ARGOS could not update the password.");
      setIsUpdatingPassword(false);
      return;
    }

    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordRecoveryMode(false);
    setIsUpdatingPassword(false);
    window.history.replaceState({}, document.title, window.location.pathname);
    alert("Your ARGOS password has been updated successfully.");
  }

  async function handleSignOut() {
    const shouldSignOut = window.confirm("Sign out of ARGOS?");
    if (!shouldSignOut) return;

    setAssets([]);
    setCompletedRepairEvents([]);
    setStatusHistoryEvents([]);
    setSelectedAsset(null);
    setEditAsset(null);
    setNewAsset(null);
    setActiveView("command");

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("ARGOS logout failed:", error);
      alert("ARGOS could not sign out. Please try again.");
    }
  }

  if (authLoading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#07121f",
          color: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1 style={{ marginBottom: "0.4rem", letterSpacing: "0.12em" }}>ARGOS</h1>
          <p style={{ margin: 0, opacity: 0.75 }}>Verifying secure session…</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          background: "linear-gradient(145deg, #06111d 0%, #0d2033 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <section
          style={{
            width: "min(430px, 100%)",
            padding: "2.25rem",
            borderRadius: "18px",
            background: "#ffffff",
            boxShadow: "0 24px 70px rgba(0, 0, 0, 0.35)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
            <p
              style={{
                margin: "0 0 0.45rem",
                color: "#9a6b24",
                fontSize: "0.75rem",
                fontWeight: 800,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Secure Fleet Access
            </p>
            <h1 style={{ margin: 0, color: "#07121f", letterSpacing: "0.1em" }}>ARGOS</h1>
            <p style={{ margin: "0.5rem 0 0", color: "#5f6b78" }}>
              Fleet Operational Awareness
            </p>
          </div>

          {showPasswordResetRequest ? (
            <form onSubmit={handleRequestPasswordReset}>
              <label style={{ display: "block", marginBottom: "1rem", color: "#263443", fontWeight: 700 }}>
                Email address
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  autoComplete="email"
                  required
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    marginTop: "0.45rem",
                    padding: "0.85rem 0.95rem",
                    border: "1px solid #c9d1da",
                    borderRadius: "9px",
                    fontSize: "1rem",
                  }}
                />
              </label>

              {authError && (
                <p role="alert" style={{ margin: "0 0 1rem", padding: "0.75rem", borderRadius: "8px", background: "#fff1f1", color: "#9b1c1c", fontSize: "0.9rem" }}>
                  {authError}
                </p>
              )}

              {resetRequestMessage && (
                <p role="status" style={{ margin: "0 0 1rem", padding: "0.75rem", borderRadius: "8px", background: "#edf8f0", color: "#21643a", fontSize: "0.9rem" }}>
                  {resetRequestMessage}
                </p>
              )}

              <button type="submit" disabled={isSendingResetEmail} style={{ width: "100%", padding: "0.9rem 1rem", border: 0, borderRadius: "9px", background: isSendingResetEmail ? "#637080" : "#0b1d2e", color: "#ffffff", fontSize: "1rem", fontWeight: 800, cursor: isSendingResetEmail ? "not-allowed" : "pointer" }}>
                {isSendingResetEmail ? "Sending reset email…" : "Send Password Reset Email"}
              </button>

              <button type="button" onClick={() => { setShowPasswordResetRequest(false); setAuthError(""); setResetRequestMessage(""); }} style={{ width: "100%", marginTop: "0.75rem", padding: "0.65rem", border: 0, background: "transparent", color: "#314b64", fontWeight: 700, cursor: "pointer" }}>
                Back to Sign In
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignIn}>
              <label style={{ display: "block", marginBottom: "1rem", color: "#263443", fontWeight: 700 }}>
                Email address
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  autoComplete="email"
                  required
                  style={{ width: "100%", boxSizing: "border-box", marginTop: "0.45rem", padding: "0.85rem 0.95rem", border: "1px solid #c9d1da", borderRadius: "9px", fontSize: "1rem" }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "1rem", color: "#263443", fontWeight: 700 }}>
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  style={{ width: "100%", boxSizing: "border-box", marginTop: "0.45rem", padding: "0.85rem 0.95rem", border: "1px solid #c9d1da", borderRadius: "9px", fontSize: "1rem" }}
                />
              </label>

              {authError && (
                <p role="alert" style={{ margin: "0 0 1rem", padding: "0.75rem", borderRadius: "8px", background: "#fff1f1", color: "#9b1c1c", fontSize: "0.9rem" }}>
                  {authError}
                </p>
              )}

              <button type="submit" disabled={isSigningIn} style={{ width: "100%", padding: "0.9rem 1rem", border: 0, borderRadius: "9px", background: isSigningIn ? "#637080" : "#0b1d2e", color: "#ffffff", fontSize: "1rem", fontWeight: 800, cursor: isSigningIn ? "not-allowed" : "pointer" }}>
                {isSigningIn ? "Signing in…" : "Sign In"}
              </button>

              <button type="button" onClick={() => { setShowPasswordResetRequest(true); setAuthError(""); setResetRequestMessage(""); }} style={{ width: "100%", marginTop: "0.75rem", padding: "0.65rem", border: 0, background: "transparent", color: "#314b64", fontWeight: 700, cursor: "pointer" }}>
                Forgot password?
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="argos-shell">
      <aside className="argos-sidebar">
        <div className="argos-logo">
          <h1>ARGOS</h1>
          <p>Fleet Operational Awareness</p>
          <div className="logo-rule">
            <span></span>
            <strong>✦</strong>
            <span></span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeView === "command" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("command")}
          >
            ⌂ <span>Command Center</span>
          </button>

          <button
            className={`nav-item ${activeView === "fleet" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setFleetSearch("");
              setFleetStatusFilter("All Statuses");
              setActiveView("fleet");
            }}
          >
            ◫ <span>My Fleet</span>
          </button>

          <button className="nav-item" type="button" onClick={() => setShowDailySummary(true)}>
            ✦ <span>Daily Summary</span>
          </button>

          <button className="nav-item" type="button" onClick={handleOpenVinScanner}>
            ▣ <span>Scan VIN</span>
          </button>

          <button
            className={`nav-item ${activeView === "history" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("history")}
          >
            ⚒ <span>Repair History</span>
          </button>

          <button
            className={`nav-item ${activeView === "technicians" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("technicians")}
          >
            👥 <span>Technicians</span>
          </button>
          <button
            className={`nav-item ${activeView === "reports" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("reports")}
          >
            ▥ <span>Reports</span>
          </button>
          <button className="nav-item" type="button" onClick={handleSignOut}>
            ⇥ <span>Log Out</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <strong>{profile?.full_name || session.user.email}</strong>
          <span>{profile?.role || "user"}</span>
          <strong>ARGOS™</strong>
          <span>Fleet Operational Awareness</span>
        </div>
      </aside>

      <section className="dashboard">
        {activeView === "command" && (
          <>
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">Command Center</p>
                <h2>Fleet Visibility Dashboard</h2>
              </div>

              <div className="refresh-box">
                <span>Units Down</span>
                <strong>{activeBoardAssets.length}</strong>
              </div>
            </header>

            <section className="metrics-row">
              <div className="availability-card">
                <span>Current Fleet Availability</span>
                <strong>{availability}%</strong>
                <p>
                  {readyAssets} Ready · {unavailableAssets} Units Down · {totalAssets} Total Active Fleet Assets
                </p>
              </div>

              <div className="metric-card"><span>Total Assets</span><strong>{totalAssets}</strong></div>
              <div className="metric-card"><span>Units Down</span><strong>{unavailableAssets}</strong></div>
              <div className="metric-card"><span>Waiting Parts</span><strong>{waitingParts}</strong></div>
              <div className="metric-card critical"><span>Critical</span><strong>{criticalAssets}</strong></div>
            </section>

            <section className="status-board">
              <div className="status-board-header">
                <div>
                  <p className="eyebrow">✦ Live Status Board</p>
                  <h3>Assets Requiring Visibility</h3>
                </div>

                <div>
                  <button type="button" onClick={handleOpenVinScanner}>Scan VIN</button>{" "}
                  <button type="button" onClick={() => {
                    setSelectedAsset(null);
                    setEditAsset(null);
                    setNewAsset(createBlankAsset());
                    setActiveView("command");
                  }}>
                    Add Asset
                  </button>{" "}
                  <button type="button" onClick={handleDownloadCSVTemplate}>Download CSV Template</button>{" "}
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleImportCSV}
                    style={{ display: "none" }}
                  />
                  <button type="button" onClick={() => csvInputRef.current?.click()}>Import CSV</button>{" "}
                </div>
              </div>

              {importStatus && <p className="eyebrow">{importStatus}</p>}

              <table>
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Department</th>
                    <th>Asset</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Priority</th>
                    <th>Days Down</th>
                    <th>Technician</th>
                    <th>RTS</th>
                    <th>Details</th>
                  </tr>
                </thead>

                <tbody>
                  {activeBoardAssets.length === 0 ? (
                    <tr>
                      <td colSpan="10">
                        No assets currently require visibility. Ready assets are not shown on the Command Center.
                      </td>
                    </tr>
                  ) : (
                    activeBoardAssets.map((asset) => (
                      <tr
                        key={asset.unit}
                        onClick={() => handleSelectAsset(asset)}
                        className={selectedAsset?.unit === asset.unit ? "selected-row" : ""}
                      >
                        <td className="unit">{asset.unit}</td>
                        <td>{asset.department}</td>
                        <td>{asset.asset}</td>
                        <td>
                          <span className={`status-pill ${getStatusClass(asset.status)}`}>
                            {asset.status}
                          </span>
                        </td>
                        <td>{asset.reason}</td>
                        <td className={asset.priority.toLowerCase()}>{asset.priority}</td>
                        <td>{calculateDaysDown(asset.downSince, asset.status)}</td>
                        <td>{asset.technician}</td>
                        <td>{formatRTS(asset)}</td>
                        <td>{asset.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}

        {activeView === "fleet" && (
          <>
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">Asset Roster</p>
                <h2>My Fleet</h2>
              </div>

              <div className="refresh-box">
                <span>Total Assets</span>
                <strong>{assets.length}</strong>
              </div>
            </header>

            <section className="status-board">
              <div className="status-board-header">
                <div>
                  <p className="eyebrow">◫ Fleet Asset Directory</p>
                  <h3>Search and Update Established Assets</h3>
                </div>

                <div
                  style={{
                    minWidth: "280px",
                    display: "flex",
                    gap: "0.65rem",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <input
                    type="search"
                    value={fleetSearch}
                    onChange={(event) => setFleetSearch(event.target.value)}
                    placeholder="Search by unit number"
                    aria-label="Search My Fleet by unit number"
                    style={{
                      flex: "1 1 220px",
                      minWidth: "220px",
                      padding: "0.7rem 0.8rem",
                      border: "1px solid #c7d0d8",
                      borderRadius: "6px",
                      font: "inherit",
                    }}
                  />

                  <select
                    value={fleetStatusFilter}
                    onChange={(event) => setFleetStatusFilter(event.target.value)}
                    aria-label="Filter My Fleet by status"
                    style={{
                      flex: "0 1 210px",
                      minWidth: "190px",
                      padding: "0.7rem 0.8rem",
                      border: "1px solid #c7d0d8",
                      borderRadius: "6px",
                      background: "#ffffff",
                      font: "inherit",
                    }}
                  >
                    <option value="All Statuses">All Statuses</option>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="eyebrow">
                Select any asset to update its status. Ready assets moved to a down status will appear on the Command Center automatically.
              </p>

              <table>
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Department</th>
                    <th>Asset</th>
                    <th>VIN</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Priority</th>
                    <th>Technician</th>
                    <th>Details</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredFleetAssets.length === 0 ? (
                    <tr>
                      <td colSpan="9">
                        {assets.length === 0
                          ? "No assets are currently stored in My Fleet."
                          : fleetSearch.trim() && fleetStatusFilter !== "All Statuses"
                            ? `No ${fleetStatusFilter} assets match unit number “${fleetSearch.trim()}”.`
                            : fleetSearch.trim()
                              ? `No unit numbers match “${fleetSearch.trim()}”.`
                              : `No assets currently have the status “${fleetStatusFilter}”.`}
                      </td>
                    </tr>
                  ) : (
                    filteredFleetAssets.map((asset) => (
                      <tr
                        key={asset.unit}
                        onClick={() => handleSelectAsset(asset)}
                        className={selectedAsset?.unit === asset.unit ? "selected-row" : ""}
                        style={{ cursor: "pointer" }}
                      >
                        <td className="unit">{asset.unit}</td>
                        <td>{asset.department}</td>
                        <td>{asset.asset}</td>
                        <td>{asset.vin || "—"}</td>
                        <td>
                          <span className={`status-pill ${getStatusClass(asset.status)}`}>
                            {asset.status}
                          </span>
                        </td>
                        <td>{asset.reason}</td>
                        <td className={asset.priority.toLowerCase()}>{asset.priority}</td>
                        <td>{asset.technician}</td>
                        <td>{asset.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}

        {activeView === "history" && (
          <>
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">Repair History / Archive</p>
                <h2>Completed Repair Records</h2>
              </div>

              <div className="refresh-box">
                <span>Historical Records</span>
                <strong>{completedRepairRecords.length}</strong>
              </div>
            </header>

            <section className="status-board">
              <div className="status-board-header">
                <div>
                  <p className="eyebrow">⚒ Completed Work</p>
                  <h3>Completed Repair Records</h3>
                </div>

                <div>
                  <button type="button" onClick={handleExportRepairHistory}>Export Repair History</button>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Department</th>
                    <th>Asset</th>
                    <th>Record Type</th>
                    <th>Prior Status</th>
                    <th>Final Status</th>
                    <th>Reason</th>
                    <th>Priority</th>
                    <th>Days Down</th>
                    <th>Technician</th>
                    <th>Completed</th>
                    <th>Details</th>
                  </tr>
                </thead>

                <tbody>
                  {completedRepairRecords.length === 0 ? (
                    <tr>
                      <td colSpan="12">No completed repair records are currently available.</td>
                    </tr>
                  ) : (
                    completedRepairRecords.map((record) => (
                      <tr key={record.recordId}>
                        <td className="unit">{record.unit}</td>
                        <td>{record.department}</td>
                        <td>{record.asset}</td>
                        <td>{record.recordType}</td>
                        <td>
                          <span className={`status-pill ${getStatusClass(record.priorStatus)}`}>
                            {record.priorStatus}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${getStatusClass(record.finalStatus)}`}>
                            {record.finalStatus}
                          </span>
                        </td>
                        <td>{record.reason}</td>
                        <td className={record.priority.toLowerCase()}>{record.priority}</td>
                        <td>{record.daysDownDisplay}</td>
                        <td>{record.technician}</td>
                        <td>{formatDate(record.completedDisplayDate)}</td>
                        <td>{record.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}

        {activeView === "technicians" && (
          <>
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">Technician Analytics</p>
                <h2>Technician Workload Dashboard</h2>
              </div>

              <div className="refresh-box">
                <span>Active Technicians</span>
                <strong>{technicianAnalytics.activeTechnicians}</strong>
              </div>
            </header>

            <section className="metrics-row">
              <div className="availability-card">
                <span>Average Active Days Down</span>
                <strong>{technicianAnalytics.averageActiveDaysDown}</strong>
                <p>
                  Active repair duration across all currently unavailable assigned and unassigned assets
                </p>
              </div>

              <div className="metric-card">
                <span>Active Technicians</span>
                <strong>{technicianAnalytics.activeTechnicians}</strong>
              </div>
              <div className="metric-card">
                <span>Assigned Active Repairs</span>
                <strong>{technicianAnalytics.assignedActiveRepairs}</strong>
              </div>
              <div className="metric-card critical">
                <span>Unassigned Repairs</span>
                <strong>{technicianAnalytics.unassignedRepairs}</strong>
              </div>
            </section>

            <section className="status-board">
              <div className="status-board-header">
                <div>
                  <p className="eyebrow">👥 Workload Visibility</p>
                  <h3>Technician / Responsible Party Analytics</h3>
                </div>

                <div>
                  <button type="button" onClick={handleExportTechnicianAnalytics}>Export Technician Analytics</button>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Technician</th>
                    <th>Active Units</th>
                    <th>Average Active Days Down</th>
                    <th>Longest Open Unit</th>
                    <th>Longest Open Days</th>
                    <th>Completed Repairs</th>
                    <th>Average Repair Duration</th>
                  </tr>
                </thead>

                <tbody>
                  {technicianAnalytics.rows.length === 0 ? (
                    <tr>
                      <td colSpan="7">No technician analytics are currently available.</td>
                    </tr>
                  ) : (
                    technicianAnalytics.rows.map((row) => (
                      <tr key={row.technician}>
                        <td className="unit">{row.technician}</td>
                        <td>{row.activeUnits}</td>
                        <td>{row.averageActiveDaysDown}</td>
                        <td>{row.longestOpenUnit}</td>
                        <td>{row.longestOpenDays}</td>
                        <td>{row.completedRepairs}</td>
                        <td>{row.averageRepairDuration}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}

        {activeView === "reports" && (
          <>
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">Reports</p>
                <h2>Status Duration Analytics</h2>
              </div>

              <div className="refresh-box">
                <span>Tracked Transitions</span>
                <strong>{statusDurationAnalytics.trackedStatusTransitions}</strong>
              </div>
            </header>

            <section className="metrics-row">
              <div className="availability-card">
                <span>Current Largest Bottleneck</span>
                <strong>
                  {statusDurationAnalytics.currentLargestBottleneck
                    ? statusDurationAnalytics.currentLargestBottleneck.status
                    : "None"}
                </strong>
                <p>
                  {statusDurationAnalytics.currentLargestBottleneck
                    ? `${statusDurationAnalytics.currentLargestBottleneck.currentUnits} current unit${
                        statusDurationAnalytics.currentLargestBottleneck.currentUnits === 1 ? "" : "s"
                      } in this status`
                    : "No unavailable assets are currently creating a status bottleneck."}
                </p>
              </div>

              <div className="metric-card">
                <span>Tracked Status Transitions</span>
                <strong>{statusDurationAnalytics.trackedStatusTransitions}</strong>
              </div>
              <div className="metric-card">
                <span>Average Recorded Status Duration</span>
                <strong>{statusDurationAnalytics.averageRecordedStatusDuration}</strong>
              </div>
              <div className="metric-card critical">
                <span>Longest Recorded Status Duration</span>
                <strong>{statusDurationAnalytics.longestRecordedStatusDuration}</strong>
              </div>
            </section>

            <section className="status-board">
              <div className="status-board-header">
                <div>
                  <p className="eyebrow">▥ Bottleneck Visibility</p>
                  <h3>Status Duration Analytics</h3>
                </div>

                <div>
                  <button type="button" onClick={handleExportUnitsDown}>Export Units Down</button>{" "}
                  <button type="button" onClick={handleExportStatusDurationAnalytics}>Export Status Duration Analytics</button>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Current Units</th>
                    <th>Completed Status Events</th>
                    <th>Average Duration</th>
                    <th>Longest Duration</th>
                    <th>Percentage of Recorded Downtime</th>
                  </tr>
                </thead>

                <tbody>
                  {statusDurationAnalytics.rows.length === 0 ? (
                    <tr>
                      <td colSpan="6">No status duration analytics are currently available.</td>
                    </tr>
                  ) : (
                    statusDurationAnalytics.rows.map((row) => (
                      <tr key={row.status}>
                        <td>
                          <span className={`status-pill ${getStatusClass(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td>{row.currentUnits}</td>
                        <td>{row.completedStatusEvents}</td>
                        <td>{row.averageDuration}</td>
                        <td>{row.longestDuration}</td>
                        <td>{row.percentageOfRecordedDowntime}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {statusDurationAnalytics.trackedStatusTransitions === 0 && (
                <p className="eyebrow">
                  Status duration data will populate after assets move between unavailable statuses or return to Ready.
                </p>
              )}
            </section>
          </>
        )}


        {showVinScanner && (
          <div className="update-overlay">
            <section className="update-panel">
              <div className="update-panel-header">
                <div>
                  <p className="eyebrow">Mobile Fleet Lookup</p>
                  <h3>Scan VIN</h3>
                  <p className="update-asset-name">Scan a vehicle VIN or registration barcode to find an asset or start a new asset record</p>
                </div>

                <button className="close-button" onClick={handleCloseVinScanner} type="button">
                  ×
                </button>
              </div>

              <div className="update-form">
                <div className="issue-field">
                  <video
                    ref={vinScannerVideoRef}
                    style={{ width: "100%", borderRadius: "18px", background: "#071a33" }}
                    muted
                    playsInline
                  />
                </div>

                <div className="issue-field">
                  <p className="eyebrow">Scanner Status</p>
                  <strong>{vinScanStatus || "Preparing VIN scanner."}</strong>
                  {lastScannedVin && <p>Last scanned value: {lastScannedVin}</p>}
                  <p>Tips: reduce windshield glare, move slowly, let the barcode fill most of the camera view, or scan the registration barcode instead.</p>
                </div>

                <label className="issue-field">
                  Manual VIN Entry
                  <input
                    type="text"
                    value={manualVinEntry}
                    onChange={(event) => setManualVinEntry(event.target.value.toUpperCase())}
                    placeholder="Enter or paste 17-character VIN"
                  />
                </label>
              </div>

              <div className="update-actions">
                <button className="cancel-button" onClick={handleCloseVinScanner} type="button">
                  Cancel
                </button>

                <button className="cancel-button" onClick={handleScanAgain} type="button">
                  Scan Again
                </button>

                <button className="save-button" onClick={handleManualVinSubmit} type="button">
                  Use VIN
                </button>
              </div>
            </section>
          </div>
        )}

        {showDailySummary && (
          <div className="daily-summary-overlay">
            <section className="daily-summary-panel update-panel">
              <div className="update-panel-header">
                <div>
                  <p className="eyebrow">ARGOS Awareness Engine</p>
                  <h3>Daily Fleet Summary</h3>
                  <p className="update-asset-name">
                    Automated operational brief based on current fleet status
                  </p>
                </div>

                <button className="close-button" onClick={() => setShowDailySummary(false)} type="button">
                  ×
                </button>
              </div>

              <div className="update-form">
                <div className="issue-field">
                  <p className="eyebrow">Operational Readiness</p>
                  <h3>{dailySummary.availability}% Fleet Availability</h3>
                  <p>
                    ARGOS sees {dailySummary.readyAssets.length} ready assets and{" "}
                    {dailySummary.unavailableAssets.length} unavailable assets out of{" "}
                    {dailySummary.totalAssets} total tracked assets.
                  </p>
                </div>

                <div>
                  <p className="eyebrow">Highest Risk</p>
                  <strong>
                    {dailySummary.criticalUnavailableAssets.length > 0
                      ? `${dailySummary.criticalUnavailableAssets.length} critical unavailable`
                      : "No critical unavailable assets"}
                  </strong>
                  <p>
                    {dailySummary.criticalUnavailableAssets.length > 0
                      ? dailySummary.criticalUnavailableAssets
                          .map((asset) => `${asset.unit} · ${asset.department}`)
                          .join(", ")
                      : "Critical fleet availability is currently stable."}
                  </p>
                </div>

                <div>
                  <p className="eyebrow">Longest Down</p>
                  <strong>
                    {dailySummary.longestDownAsset
                      ? `${dailySummary.longestDownAsset.unit} · ${dailySummary.longestDownAsset.daysDown} days`
                      : "No down assets"}
                  </strong>
                  <p>
                    {dailySummary.longestDownAsset
                      ? `${dailySummary.longestDownAsset.asset}: ${dailySummary.longestDownAsset.details}`
                      : "All tracked assets are currently available."}
                  </p>
                </div>

                <div>
                  <p className="eyebrow">Parts Constraint</p>
                  <strong>
                    {dailySummary.waitingPartsAssets.length} unit
                    {dailySummary.waitingPartsAssets.length === 1 ? "" : "s"} waiting parts
                  </strong>
                  <p>
                    {dailySummary.waitingPartsAssets.length > 0
                      ? dailySummary.waitingPartsAssets
                          .map((asset) => `${asset.unit} · ${asset.details}`)
                          .join(", ")
                      : "No parts-delay assets are currently flagged."}
                  </p>
                </div>

                <div>
                  <p className="eyebrow">RTS Gaps</p>
                  <strong>
                    {dailySummary.tbdAssets.length} TBD · {dailySummary.noRtsAssets.length} no RTS
                  </strong>
                  <p>
                    ARGOS is tracking return-to-service uncertainty for assets without firm RTS dates.
                  </p>
                </div>

                <div>
                  <p className="eyebrow">Aging Threshold</p>
                  <strong>
                    {dailySummary.agedAssets.length} unit
                    {dailySummary.agedAssets.length === 1 ? "" : "s"} down{" "}
                    {dailySummary.agingThreshold}+ days
                  </strong>
                  <p>
                    {dailySummary.agedAssets.length > 0
                      ? dailySummary.agedAssets
                          .map((asset) => `${asset.unit} · ${asset.daysDown} days`)
                          .join(", ")
                      : "No units are currently beyond the aging threshold."}
                  </p>
                </div>

                <div className="issue-field">
                  <p className="eyebrow">Department Watch</p>
                  <strong>{dailySummary.departmentWatch || "No department watch items"}</strong>
                  <p>
                    Departments listed here currently have unavailable assets requiring visibility.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {newAsset && (
          <div className="update-overlay">
            <section className="update-panel">
              <div className="update-panel-header">
                <div>
                  <p className="eyebrow">Asset Management</p>
                  <h3>Add New Asset</h3>
                  <p className="update-asset-name">Create a new tracked fleet asset in ARGOS</p>
                </div>

                <button className="close-button" onClick={() => setNewAsset(null)} type="button">
                  ×
                </button>
              </div>

              {newAsset.__fromVinScan && newAsset.__decodedAssetDescription && (
                <div className="update-form">
                  <div className="issue-field">
                    <p className="eyebrow">VIN Decoded</p>
                    <strong>{newAsset.__decodedAssetDescription}</strong>
                    <p>ARGOS populated the Asset field from the scanned VIN. You can edit it before saving.</p>
                  </div>
                </div>
              )}

              {renderAssetForm(
                newAsset,
                handleNewAssetChange,
                handleNewAssetStatusChange,
                handleNewAssetRTSTypeChange
              )}

              <div className="update-actions">
                <button className="cancel-button" onClick={() => setNewAsset(null)} type="button">
                  Cancel
                </button>

                <button className="save-button" onClick={handleSaveNewAsset} type="button">
                  Add Asset
                </button>
              </div>
            </section>
          </div>
        )}

        {editAsset && (
          <div className="update-overlay">
            <section className="update-panel">
              <div className="update-panel-header">
                <div>
                  <p className="eyebrow">Manual Fleet Update</p>
                  <h3>Update Unit {editAsset.unit}</h3>
                  <p className="update-asset-name">
                    {editAsset.department} · {editAsset.asset}
                  </p>
                </div>

                <button
                  className="close-button"
                  onClick={() => {
                    setEditAsset(null);
                    setSelectedAsset(null);
                  }}
                  type="button"
                >
                  ×
                </button>
              </div>

              {renderAssetForm(editAsset, handleChange, handleStatusChange, handleRTSTypeChange)}

              <div className="update-actions">
                <button
                  className="cancel-button"
                  onClick={() => {
                    setEditAsset(null);
                    setSelectedAsset(null);
                  }}
                  type="button"
                >
                  Cancel
                </button>

                <button className="save-button" onClick={handleSave} type="button">
                  Save Fleet Update
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;