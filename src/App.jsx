import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { supabase } from "./supabaseClient";
import AdministrationModule from "./components/Administration/ARGOS_Administration_Module_Component";
import CommandCenter from "./components/CommandCenter/ARGOS_Command_Center_Component";
import ARGOSOperationsNavigation from "./components/Layout/ARGOS_Operations_Navigation_Blue_Shield_Reference_001U";
import { canViewAdministration } from "./utils/ARGOS_Permission_Resolver";
import "./App.css";


const STORAGE_KEY = "argosFleetAssets";
const COMPLETED_STORAGE_KEY = "argosCompletedRepairEvents";
const STATUS_HISTORY_STORAGE_KEY = "argosStatusHistoryEvents";
const ACTIVE_VIEW_STORAGE_KEY = "argosActiveView";

function getOrganizationStorageKey(baseKey, organizationId) {
  return organizationId ? `${baseKey}:${organizationId}` : null;
}

const FALLBACK_STATUS_CONFIGURATIONS = [
  { status_name: "Ready", status_code: "READY", display_order: 10, status_color: "#146C2E", counts_as_available: true, requires_down_date: false, is_active: true },
  { status_name: "Down", status_code: "DOWN", display_order: 20, status_color: "#A61B1B", counts_as_available: false, requires_down_date: true, is_active: true },
  { status_name: "In Shop", status_code: "IN_SHOP", display_order: 30, status_color: "#245B8A", counts_as_available: false, requires_down_date: true, is_active: true },
  { status_name: "At 3rd Party Shop", status_code: "THIRD_PARTY", display_order: 40, status_color: "#6C4A8B", counts_as_available: false, requires_down_date: true, is_active: true },
  { status_name: "Waiting Parts", status_code: "WAITING_PARTS", display_order: 50, status_color: "#A96300", counts_as_available: false, requires_down_date: true, is_active: true },
  { status_name: "Awaiting Approval", status_code: "AWAITING_APPROVAL", display_order: 60, status_color: "#82550F", counts_as_available: false, requires_down_date: true, is_active: true },
  { status_name: "Awaiting QC", status_code: "AWAITING_QC", display_order: 70, status_color: "#5B4B9A", counts_as_available: false, requires_down_date: true, is_active: true },
  { status_name: "Ready for Pickup", status_code: "READY_PICKUP", display_order: 80, status_color: "#8A6A14", counts_as_available: false, requires_down_date: true, is_active: true },
];

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

function getFieldGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

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
    technicianId: "",
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
    technicianId: "",
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
    technicianId: "",
    technician: "Unassigned",
    rtsType: "No RTS Established",
    rtsDate: "",
    details: "Available",
  },
];

const DEMO_DEPARTMENTS = [
  { id: "demo-public-works", department_name: "Public Works", department_code: "PW", is_active: true },
  { id: "demo-police", department_name: "Police", department_code: "POL", is_active: true },
  { id: "demo-fire", department_name: "Fire", department_code: "FIRE", is_active: true },
  { id: "demo-parks", department_name: "Parks", department_code: "PARKS", is_active: true },
  { id: "demo-utilities", department_name: "Utilities", department_code: "UTIL", is_active: true },
  { id: "demo-solid-waste", department_name: "Solid Waste", department_code: "SW", is_active: true },
  { id: "demo-transit", department_name: "Transit", department_code: "TRANSIT", is_active: true },
];

const DEMO_ASSET_TYPES = [
  { id: "demo-sedan", asset_type_name: "Sedan", asset_type_code: "SEDAN", is_active: true },
  { id: "demo-suv", asset_type_name: "SUV", asset_type_code: "SUV", is_active: true },
  { id: "demo-pickup", asset_type_name: "Pickup Truck", asset_type_code: "PICKUP", is_active: true },
  { id: "demo-service", asset_type_name: "Service / Utility Truck", asset_type_code: "SERVICE", is_active: true },
  { id: "demo-van", asset_type_name: "Van", asset_type_code: "VAN", is_active: true },
  { id: "demo-bus", asset_type_name: "Bus / Transit Vehicle", asset_type_code: "BUS", is_active: true },
  { id: "demo-fire", asset_type_name: "Fire Apparatus", asset_type_code: "FIRE", is_active: true },
  { id: "demo-refuse", asset_type_name: "Refuse Vehicle", asset_type_code: "REFUSE", is_active: true },
  { id: "demo-heavy", asset_type_name: "Heavy Truck", asset_type_code: "HEAVY", is_active: true },
  { id: "demo-trailer", asset_type_name: "Trailer", asset_type_code: "TRAILER", is_active: true },
  { id: "demo-construction", asset_type_name: "Construction Equipment", asset_type_code: "CONST", is_active: true },
  { id: "demo-grounds", asset_type_name: "Grounds Equipment", asset_type_code: "GROUNDS", is_active: true },
  { id: "demo-ag", asset_type_name: "Agricultural Equipment", asset_type_code: "AG", is_active: true },
  { id: "demo-other", asset_type_name: "Other", asset_type_code: "OTHER", is_active: true },
];


function normalizeDepartmentLookupValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findDepartmentByName(departments, departmentName) {
  const normalizedName = normalizeDepartmentLookupValue(departmentName);

  return departments.find(
    (department) =>
      normalizeDepartmentLookupValue(department.department_name) === normalizedName
  );
}

function normalizeTechnicianDisplayName(value) {
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

function normalizeTechnicianKey(value) {
  return normalizeTechnicianDisplayName(value).toLowerCase();
}

const DEMO_ASSETS = [
  { unit: "DEMO-101", vin: "1FTFW1E50NFA10101", department: "Public Works", asset: "2022 Ford F-150", status: "Ready", statusStartedAt: getTodayDateString(), reason: "Available", priority: "Normal", downSince: "", technician: "Unassigned", rtsType: "No RTS Established", rtsDate: "", details: "Available" },
  { unit: "DEMO-102", vin: "1FT7W2B60NEA10102", department: "Public Works", asset: "2022 Ford F-250", status: "Waiting Parts", statusStartedAt: "2026-07-02", reason: "Parts Availability", priority: "High", downSince: "2026-07-02", technician: "M. Carter", rtsType: "Estimated Date", rtsDate: "2026-07-15", details: "Alternator ordered; awaiting delivery" },
  { unit: "DEMO-103", vin: "1GC4YSEY0NF10103", department: "Public Works", asset: "2022 Chevrolet Silverado 2500HD", status: "In Shop", statusStartedAt: "2026-07-08", reason: "Preventive Maintenance", priority: "Medium", downSince: "2026-07-08", technician: "J. Reynolds", rtsType: "Estimated Date", rtsDate: "2026-07-11", details: "Scheduled brake and fluid service" },
  { unit: "DEMO-201", vin: "1FM5K8AB0NGA10201", department: "Police", asset: "2022 Ford Police Interceptor Utility", status: "Ready", statusStartedAt: getTodayDateString(), reason: "Available", priority: "Normal", downSince: "", technician: "Unassigned", rtsType: "No RTS Established", rtsDate: "", details: "Available" },
  { unit: "DEMO-202", vin: "1FM5K8AB2NGA10202", department: "Police", asset: "2022 Ford Police Interceptor Utility", status: "Awaiting QC", statusStartedAt: "2026-07-09", reason: "Inspection / QC", priority: "High", downSince: "2026-07-09", technician: "S. Mitchell", rtsType: "Estimated Date", rtsDate: "2026-07-11", details: "Post-repair road test and equipment inspection" },
  { unit: "DEMO-203", vin: "1GNSKLED0NR10203", department: "Police", asset: "2022 Chevrolet Tahoe PPV", status: "At 3rd Party Shop", statusStartedAt: "2026-06-24", reason: "Accident / Damage", priority: "Critical", downSince: "2026-06-24", technician: "Vendor Body Shop", rtsType: "Estimated Date", rtsDate: "2026-07-22", details: "Right-front collision repairs" },
  { unit: "DEMO-301", vin: "1GNSKLED2NR10301", department: "Fire", asset: "2022 Chevrolet Tahoe Command Vehicle", status: "Ready", statusStartedAt: getTodayDateString(), reason: "Available", priority: "Normal", downSince: "", technician: "Unassigned", rtsType: "No RTS Established", rtsDate: "", details: "Available" },
  { unit: "DEMO-302", vin: "4EN3AAA82N110302", department: "Fire", asset: "2022 Pierce Enforcer Pumper", status: "Awaiting Approval", statusStartedAt: "2026-07-03", reason: "Awaiting Approval", priority: "Critical", downSince: "2026-07-03", technician: "R. Davis", rtsType: "TBD", rtsDate: "", details: "Awaiting authorization for hydraulic repair" },
  { unit: "DEMO-401", vin: "1LV5065E0NN10401", department: "Parks", asset: "2022 John Deere 5065E Tractor", status: "Ready", statusStartedAt: getTodayDateString(), reason: "Available", priority: "Normal", downSince: "", technician: "Unassigned", rtsType: "No RTS Established", rtsDate: "", details: "Available" },
  { unit: "DEMO-402", vin: "1TC930MCLNT10402", department: "Parks", asset: "2022 John Deere 930M Mower", status: "Waiting Parts", statusStartedAt: "2026-07-01", reason: "Parts Availability", priority: "Medium", downSince: "2026-07-01", technician: "D. Foster", rtsType: "Estimated Date", rtsDate: "2026-07-16", details: "Deck spindle assembly on order" },
  { unit: "DEMO-501", vin: "1FT7W2BT0NE10501", department: "Utilities", asset: "2022 Ford F-250 Utility Truck", status: "Ready", statusStartedAt: getTodayDateString(), reason: "Available", priority: "Normal", downSince: "", technician: "Unassigned", rtsType: "No RTS Established", rtsDate: "", details: "Available" },
  { unit: "DEMO-502", vin: "3C7WRKBL2NG10502", department: "Utilities", asset: "2022 RAM 3500 Utility Truck", status: "At 3rd Party Shop", statusStartedAt: "2026-06-27", reason: "Vendor / 3rd Party Delay", priority: "High", downSince: "2026-06-27", technician: "Transmission Vendor", rtsType: "TBD", rtsDate: "", details: "Transmission rebuild awaiting vendor completion" },
  { unit: "DEMO-601", vin: "3ALACWFC0ND10601", department: "Solid Waste", asset: "2022 Freightliner M2 Rear Loader", status: "Down", statusStartedAt: "2026-06-21", reason: "Mechanical Failure", priority: "Critical", downSince: "2026-06-21", technician: "L. Garcia", rtsType: "TBD", rtsDate: "", details: "Hydraulic leak at compactor cylinder" },
  { unit: "DEMO-602", vin: "1FVACXDT0NH10602", department: "Solid Waste", asset: "2022 Freightliner M2 Front Loader", status: "Ready", statusStartedAt: getTodayDateString(), reason: "Available", priority: "Normal", downSince: "", technician: "Unassigned", rtsType: "No RTS Established", rtsDate: "", details: "Available" },
  { unit: "DEMO-701", vin: "1FDEE3FS0NDC10701", department: "Transit", asset: "2022 Ford E-350 Cutaway Bus", status: "Ready for Pickup", statusStartedAt: "2026-07-07", reason: "Mechanical Failure", priority: "Medium", downSince: "2026-07-04", technician: "E. Martin", rtsType: "Estimated Date", rtsDate: "2026-07-10", details: "Wheelchair lift repair completed" },
];

function inferDemoAssetTypeId(assetDescription) {
  const description = String(assetDescription || "").toLowerCase();
  if (/(police interceptor|tahoe|explorer|suv)/.test(description)) return "demo-suv";
  if (/(f-150|f-250|f-350|silverado|ram 1500|ram 2500|ram 3500|pickup)/.test(description)) return "demo-pickup";
  if (/(service truck|utility truck)/.test(description)) return "demo-service";
  if (/(transit connect|van|sprinter|promaster)/.test(description)) return "demo-van";
  if (/(bus|cutaway|shuttle)/.test(description)) return "demo-bus";
  if (/(pumper|engine|ladder|quint|ambulance|rescue)/.test(description)) return "demo-fire";
  if (/(rear loader|front loader|side loader|refuse|packer)/.test(description)) return "demo-refuse";
  if (/(freightliner|international|mack|dump truck)/.test(description)) return "demo-heavy";
  if (/trailer/.test(description)) return "demo-trailer";
  if (/(excavator|backhoe|loader|dozer|grader|skid steer)/.test(description)) return "demo-construction";
  if (/(mower|zero turn)/.test(description)) return "demo-grounds";
  if (/tractor/.test(description)) return "demo-ag";
  if (/(sedan|charger|impala|malibu|taurus)/.test(description)) return "demo-sedan";
  return "demo-other";
}

function calculateWarrantyAwareness(asset) {
  const explicitStatus = String(asset.warrantyStatus || "Unknown");
  const expirationDate = asset.warrantyExpirationDate
    ? new Date(`${asset.warrantyExpirationDate}T23:59:59`)
    : null;
  const mileageLimit = Number(asset.warrantyMileageLimit || 0);
  const currentMileage = Number(asset.currentMileage || 0);
  const expiredByDate = expirationDate && expirationDate.getTime() < Date.now();
  const expiredByMileage = mileageLimit > 0 && currentMileage >= mileageLimit;

  if (explicitStatus === "Not Applicable") return "Not Applicable";
  if (expiredByDate || expiredByMileage || explicitStatus === "Expired") return "Expired";
  if (expirationDate || mileageLimit > 0 || explicitStatus === "Under Warranty") return "In Warranty";
  return "Unknown";
}

function calculateServiceAwareness(asset) {
  const currentMileage = Number(asset.currentMileage || 0);
  const currentHours = Number(asset.currentEngineHours || 0);
  const dueMileage = Number(asset.nextServiceMileage || 0);
  const dueHours = Number(asset.nextServiceHours || 0);
  const mileageRemaining = dueMileage > 0 ? dueMileage - currentMileage : null;
  const hoursRemaining = dueHours > 0 ? dueHours - currentHours : null;

  if ((mileageRemaining !== null && mileageRemaining < 0) || (hoursRemaining !== null && hoursRemaining < 0)) {
    return "PM Overdue";
  }
  if ((mileageRemaining !== null && mileageRemaining === 0) || (hoursRemaining !== null && hoursRemaining === 0)) {
    return "PM Due";
  }
  if ((mileageRemaining !== null && mileageRemaining <= 500) || (hoursRemaining !== null && hoursRemaining <= 25)) {
    return "Oil Change Due Soon";
  }
  return "No Service Due";
}

function createBlankAsset() {
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
    apwaCode: "",
    apwaDescription: "",
    currentMileage: "",
    currentEngineHours: "",
    workOrderNumber: "",
    vendorShop: "",
    primaryVmrs: "",
    secondaryVmrs: "",
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

function normalizeAsset(asset) {
  const normalizedStatus = asset.status === "Completed" ? "Ready" : asset.status || "Ready";
  const isReadyStatus = normalizedStatus === "Ready";
  const technician = normalizeTechnicianDisplayName(asset.technician);

  return {
    vin: "",
    departmentId: asset.departmentId || "",
    assetTypeId: asset.assetTypeId || inferDemoAssetTypeId(asset.asset),
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
    apwaCode: asset.apwaCode || "",
    apwaDescription: asset.apwaDescription || "",
    currentMileage: asset.currentMileage ?? "",
    currentEngineHours: asset.currentEngineHours ?? "",
    workOrderNumber: asset.workOrderNumber || "",
    vendorShop: asset.vendorShop || "",
    primaryVmrs: asset.primaryVmrs || "",
    secondaryVmrs: asset.secondaryVmrs || "",
    repairOpenedAt: asset.repairOpenedAt || "",
    repairCompletedAt: asset.repairCompletedAt || "",
    mileageAtRepair: asset.mileageAtRepair ?? "",
    engineHoursAtRepair: asset.engineHoursAtRepair ?? "",
    warrantyStatus: asset.warrantyStatus || "Unknown",
    warrantyType: asset.warrantyType || "",
    warrantyExpirationDate: asset.warrantyExpirationDate || "",
    warrantyMileageLimit: asset.warrantyMileageLimit ?? "",
    lastServiceDate: asset.lastServiceDate || "",
    lastServiceMileage: asset.lastServiceMileage ?? "",
    lastServiceHours: asset.lastServiceHours ?? "",
    nextServiceMileage: asset.nextServiceMileage ?? "",
    nextServiceHours: asset.nextServiceHours ?? "",
    repairTimeline: Array.isArray(asset.repairTimeline) ? asset.repairTimeline : [],
    repairUpdateDraft: asset.repairUpdateDraft || "",
    mileageUpdatedAt: asset.mileageUpdatedAt || "",
    engineHoursUpdatedAt: asset.engineHoursUpdatedAt || "",
    nhtsaDecode: asset.nhtsaDecode || {},
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
    technician: normalizeTechnicianDisplayName(event.technician),
  };
}

function normalizeImportedAsset(row, statusOptions = FALLBACK_STATUS_CONFIGURATIONS.map((status) => status.status_name)) {
  const importedStatus = findOptionMatch(row.status, statusOptions) || "Ready";
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
    departmentId: "",
    department: String(row.department || "").trim(),
    assetTypeId: "",
    assetTypeName: String(row.assetType || "").trim(),
    asset: String(row.asset || "").trim(),
    status: importedStatus,
    statusStartedAt: isReadyStatus ? getTodayDateString() : downSince,
    reason,
    priority,
    downSince,
    technician: normalizeTechnicianDisplayName(row.technician),
    rtsType,
    rtsDate: !isReadyStatus && rtsType === "Estimated Date" ? String(row.rtsDate || "").trim() : "",
    details: String(row.details || "").trim() || (isReadyStatus ? "Available" : "Details pending"),
  };
}
function mapSupabaseAsset(row) {
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
    apwaCode: row.apwa_code || "",
    apwaDescription: row.apwa_description || "",
    currentMileage: row.current_mileage ?? "",
    currentEngineHours: row.current_engine_hours ?? "",
    workOrderNumber: row.work_order_number || "",
    vendorShop: row.vendor_shop || "",
    primaryVmrs: row.primary_vmrs || "",
    secondaryVmrs: row.secondary_vmrs || "",
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
    repairTimeline: Array.isArray(row.repair_timeline) ? row.repair_timeline : [],
    mileageUpdatedAt: row.mileage_updated_at || "",
    engineHoursUpdatedAt: row.engine_hours_updated_at || "",
    nhtsaDecode: row.nhtsa_decode || {},
    status: row.status || "Ready",
    statusStartedAt: row.status_started_at || row.down_since || getTodayDateString(),
    reason: row.reason || "Available",
    priority: row.priority || "Normal",
    downSince: row.down_since || "",
    technicianId: row.technician_id || "",
    technician: row.technicians?.technician_name || row.technician || "Unassigned",
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
    workOrderNumber: row.work_order_number || "",
    vendorShop: row.vendor_shop || "",
    primaryVmrs: row.primary_vmrs || "",
    secondaryVmrs: row.secondary_vmrs || "",
    mileageAtRepair: row.mileage_at_repair ?? "",
    engineHoursAtRepair: row.engine_hours_at_repair ?? "",
    warrantyStatus: row.warranty_status || "Unknown",
    repairOpenedAt: row.repair_opened_at || "",
    repairCompletedAt: row.repair_completed_at || row.completed || "",
    repairTimeline: Array.isArray(row.repair_timeline) ? row.repair_timeline : [],
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

function isSameLocalCalendarDate(value, comparisonDate = new Date()) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return (
    date.getFullYear() === comparisonDate.getFullYear() &&
    date.getMonth() === comparisonDate.getMonth() &&
    date.getDate() === comparisonDate.getDate()
  );
}

function buildTechnicianDailySummary({
  assets,
  statusHistoryEvents,
  completedRepairRecords,
  isAssignedToTechnician,
  technicianKey,
  now = new Date(),
}) {
  const assignedAssets = assets.filter(isAssignedToTechnician);
  const activeAssignedAssets = assignedAssets.filter((asset) => asset.status !== "Ready");

  const todayStatusEvents = statusHistoryEvents.filter(
    (event) =>
      isSameLocalCalendarDate(event.recordedAt || event.statusEndedAt, now) &&
      normalizeTechnicianKey(event.technician) === technicianKey
  );

  const todayCompletedRepairs = completedRepairRecords.filter(
    (record) =>
      isSameLocalCalendarDate(
        record.completedDate ||
          record.completedDisplayDate ||
          record.statusEndedAt ||
          record.recordedAt,
        now
      ) &&
      normalizeTechnicianKey(record.technician) === technicianKey
  );

  const updatedUnits = Array.from(
    new Set(todayStatusEvents.map((event) => event.unit).filter(Boolean))
  );

  return {
    assignedAssets,
    activeAssignedAssets,
    waitingPartsAssets: activeAssignedAssets.filter(
      (asset) => asset.status === "Waiting Parts"
    ),
    awaitingQcAssets: activeAssignedAssets.filter(
      (asset) => asset.status === "Awaiting QC"
    ),
    readyForPickupAssets: activeAssignedAssets.filter(
      (asset) => asset.status === "Ready for Pickup"
    ),
    criticalAssets: activeAssignedAssets.filter(
      (asset) => asset.priority === "Critical"
    ),
    todayStatusEvents: [...todayStatusEvents].sort((firstEvent, secondEvent) =>
      String(secondEvent.recordedAt || secondEvent.statusEndedAt || "").localeCompare(
        String(firstEvent.recordedAt || firstEvent.statusEndedAt || "")
      )
    ),
    todayCompletedRepairs,
    updatedUnits,
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
      technician: normalizeTechnicianDisplayName(asset.technician),
      technicianKey: normalizeTechnicianKey(asset.technician),
    }));

  const completedRecords = completedRepairRecords.map((record) => ({
    ...record,
    technician: normalizeTechnicianDisplayName(record.technician),
    technicianKey: normalizeTechnicianKey(record.technician),
    repairDuration: Number(record.daysDownDisplay ?? record.finalDaysDown ?? 0),
  }));

  const displayNamesByKey = new Map();

  [...activeAssets, ...completedRecords].forEach((record) => {
    if (!displayNamesByKey.has(record.technicianKey)) {
      displayNamesByKey.set(record.technicianKey, record.technician);
    }
  });

  const technicianKeys = Array.from(displayNamesByKey.keys()).sort((firstKey, secondKey) =>
    displayNamesByKey.get(firstKey).localeCompare(displayNamesByKey.get(secondKey))
  );

  const rows = technicianKeys.map((technicianKey) => {
    const technician = displayNamesByKey.get(technicianKey);
    const assignedAssets = activeAssets.filter(
      (asset) => asset.technicianKey === technicianKey
    );
    const completedRepairs = completedRecords.filter(
      (record) => record.technicianKey === technicianKey
    );
    const totalActiveDaysDown = assignedAssets.reduce((sum, asset) => sum + asset.daysDown, 0);
    const totalCompletedDuration = completedRepairs.reduce(
      (sum, record) => sum + record.repairDuration,
      0
    );
    const longestOpenAsset = [...assignedAssets].sort((a, b) => b.daysDown - a.daysDown)[0];

    return {
      technician,
      technicianKey,
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
    (row) => row.technicianKey !== "unassigned" && row.activeUnits > 0
  ).length;
  const assignedActiveRepairs = activeAssets.filter(
    (asset) => asset.technicianKey !== "unassigned"
  ).length;
  const unassignedRepairs = activeAssets.filter(
    (asset) => asset.technicianKey === "unassigned"
  ).length;
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


function buildStatusDurationAnalytics(assets, statusHistoryEvents, statusOptions) {
  const statusDurationOptions = statusOptions.filter((status) => status !== "Ready");
  const activeAssets = assets.filter((asset) => asset.status !== "Ready");

  const normalizedHistoryEvents = statusHistoryEvents
    .filter((event) => statusDurationOptions.includes(event.previousStatus))
    .map((event) => ({
      ...event,
      durationDays: Number(event.durationDays ?? 0),
    }));

  const totalRecordedDuration = normalizedHistoryEvents.reduce(
    (sum, event) => sum + event.durationDays,
    0
  );

  const rows = statusDurationOptions.map((status) => {
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
  const [showFieldHome, setShowFieldHome] = useState(true);
  const [fieldQueueMode, setFieldQueueMode] = useState("all");
  const [fieldScanContext, setFieldScanContext] = useState(null);
  const [fieldCurrentTime, setFieldCurrentTime] = useState(() => new Date());
  const [showFieldVehicleDetails, setShowFieldVehicleDetails] = useState(false);
  const [activeAdministrationSection, setActiveAdministrationSection] = useState("Organization Profile");
  const [fleetSearch, setFleetSearch] = useState("");
  const [fleetStatusFilter, setFleetStatusFilter] = useState("All Statuses");
  const [importStatus, setImportStatus] = useState("");
  const csvInputRef = useRef(null);
  const vinScannerVideoRef = useRef(null);
  const vinScannerControlsRef = useRef(null);
  const vinScanLockedRef = useRef(false);
  const fieldSaveCompletedRef = useRef(false);
  const [showVinScanner, setShowVinScanner] = useState(false);
  const [vinScanStatus, setVinScanStatus] = useState("");
  const [vinScanSuccess, setVinScanSuccess] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [lastScannedVin, setLastScannedVin] = useState("");
  const [manualVinEntry, setManualVinEntry] = useState("");
  const [pendingNewAssetDraft, setPendingNewAssetDraft] = useState(null);
  const [scannerRunId, setScannerRunId] = useState(0);
  const [session, setSession] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
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
  const [organizationProfile, setOrganizationProfile] = useState(null);
  const [organizationProfileLoading, setOrganizationProfileLoading] = useState(false);
  const [organizationProfileError, setOrganizationProfileError] = useState("");
  const [departments, setDepartments] = useState([]);
  const [departmentAliases, setDepartmentAliases] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [assetTypesLoading, setAssetTypesLoading] = useState(false);
  const [assetTypesError, setAssetTypesError] = useState("");
  const [statusConfigurations, setStatusConfigurations] = useState(FALLBACK_STATUS_CONFIGURATIONS);
  const [statusConfigurationsLoading, setStatusConfigurationsLoading] = useState(false);
  const [statusConfigurationsError, setStatusConfigurationsError] = useState("");
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [departmentsError, setDepartmentsError] = useState("");
  const [technicians, setTechnicians] = useState([]);
  const [techniciansLoading, setTechniciansLoading] = useState(false);
  const [techniciansError, setTechniciansError] = useState("");

  const hasAdministrationAccess = isDemoMode || canViewAdministration(profile);

  useEffect(() => {
    const greetingClock = window.setInterval(() => {
      setFieldCurrentTime(new Date());
    }, 60 * 1000);

    return () => window.clearInterval(greetingClock);
  }, []);

  useEffect(() => {
    setShowFieldVehicleDetails(false);
  }, [editAsset?.unit]);

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

    if (isDemoMode) {
      setOrganizationId(null);
      setProfile({ full_name: "ARGOS Demo Visitor", role: "demo" });
      setOrganizationLoading(false);
      setOrganizationError("");
      return undefined;
    }

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
  }, [session?.user?.id, isDemoMode]);

useEffect(() => {
  let isMounted = true;

  if (isDemoMode) {
    setOrganizationProfile({
      name: "Argos Public Demo",
      fleet_name: "ARGOS Demonstration Fleet",
      primary_contact_name: "Demo Administrator",
      contact_email: "",
      contact_phone: "",
      address_line_1: "",
      address_line_2: "",
      city: "",
      state: "",
      postal_code: "",
      time_zone: "America/New_York",
    });
    setOrganizationProfileLoading(false);
    setOrganizationProfileError("");
    return undefined;
  }

  if (!session || !organizationId) {
    setOrganizationProfile(null);
    setOrganizationProfileLoading(false);
    setOrganizationProfileError("");
    return undefined;
  }

  async function loadOrganizationProfile() {
    setOrganizationProfileLoading(true);
    setOrganizationProfileError("");

    const { data, error } = await supabase
      .from("organizations")
      .select(
        "id, name, fleet_name, primary_contact_name, contact_email, contact_phone, address_line_1, address_line_2, city, state, postal_code, time_zone, updated_at"
      )
      .eq("id", organizationId)
      .single();

    if (!isMounted) return;

    if (error) {
      console.error("ARGOS organization profile load failed:", error);
      setOrganizationProfile(null);
      setOrganizationProfileError(
        "ARGOS could not load the organization profile. Confirm the new organization columns exist and the current user can read this organization."
      );
      setOrganizationProfileLoading(false);
      return;
    }

    setOrganizationProfile(data);
    setOrganizationProfileLoading(false);
  }

  loadOrganizationProfile();

  return () => {
    isMounted = false;
  };
}, [session, organizationId, isDemoMode]);

useEffect(() => {
  let isMounted = true;

  if (isDemoMode) {
    setDepartments(DEMO_DEPARTMENTS);
    setDepartmentAliases([]);
    setDepartmentsLoading(false);
    setDepartmentsError("");
    return undefined;
  }

  if (!session || !organizationId) {
    setDepartments([]);
    setDepartmentAliases([]);
    setDepartmentsLoading(false);
    setDepartmentsError("");
    return undefined;
  }

  async function loadOrganizationDepartments() {
    setDepartmentsLoading(true);
    setDepartmentsError("");

    const [
      { data: departmentRows, error: departmentLoadError },
      { data: aliasRows, error: aliasLoadError },
    ] = await Promise.all([
      supabase
        .from("departments")
        .select("id, department_name, department_code, is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("department_name", { ascending: true }),
      supabase
        .from("department_aliases")
        .select("id, department_id, alias_name")
        .eq("organization_id", organizationId),
    ]);

    if (!isMounted) return;

    if (departmentLoadError) {
      console.error("ARGOS departments load failed:", departmentLoadError);
      setDepartments([]);
      setDepartmentAliases([]);
      setDepartmentsError(
        "ARGOS could not load active departments for asset management."
      );
      setDepartmentsLoading(false);
      return;
    }

    if (aliasLoadError) {
      console.error("ARGOS department aliases load failed:", aliasLoadError);
    }

    setDepartments(departmentRows || []);
    setDepartmentAliases(aliasRows || []);
    setDepartmentsLoading(false);
  }

  loadOrganizationDepartments();

  return () => {
    isMounted = false;
  };
}, [session, organizationId, isDemoMode]);

useEffect(() => {
  let isMounted = true;

  if (isDemoMode) {
    setAssetTypes(DEMO_ASSET_TYPES);
    setAssetTypesLoading(false);
    setAssetTypesError("");
    return undefined;
  }

  if (!session || !organizationId) {
    setAssetTypes([]);
    setAssetTypesLoading(false);
    setAssetTypesError("");
    return undefined;
  }

  async function loadOrganizationAssetTypes() {
    setAssetTypesLoading(true);
    setAssetTypesError("");

    const { data, error } = await supabase
      .from("asset_types")
      .select("id, asset_type_name, asset_type_code, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("asset_type_name", { ascending: true });

    if (!isMounted) return;

    if (error) {
      console.error("ARGOS Asset Types load failed:", error);
      setAssetTypes([]);
      setAssetTypesError("ARGOS could not load active Asset Types for asset management.");
      setAssetTypesLoading(false);
      return;
    }

    setAssetTypes(data || []);
    setAssetTypesLoading(false);
  }

  loadOrganizationAssetTypes();

  return () => {
    isMounted = false;
  };
}, [session, organizationId, isDemoMode]);

useEffect(() => {
  let isMounted = true;
  if (isDemoMode) { setStatusConfigurations(FALLBACK_STATUS_CONFIGURATIONS); return undefined; }
  if (!session || !organizationId) { setStatusConfigurations(FALLBACK_STATUS_CONFIGURATIONS); return undefined; }
  async function loadOrganizationStatusConfigurations() {
    setStatusConfigurationsLoading(true); setStatusConfigurationsError("");
    const { data, error } = await supabase.from("status_configurations")
      .select("id, status_name, status_code, display_order, status_color, counts_as_available, requires_down_date, is_active")
      .eq("organization_id", organizationId).eq("is_active", true)
      .order("display_order", { ascending: true }).order("status_name", { ascending: true });
    if (!isMounted) return;
    if (error) { console.error("ARGOS Status Configuration load failed:", error); setStatusConfigurations(FALLBACK_STATUS_CONFIGURATIONS); setStatusConfigurationsError("ARGOS could not load active Status Configuration. Standard statuses are being used."); setStatusConfigurationsLoading(false); return; }
    setStatusConfigurations(data && data.length ? data : FALLBACK_STATUS_CONFIGURATIONS); setStatusConfigurationsLoading(false);
  }
  loadOrganizationStatusConfigurations();
  return () => { isMounted = false; };
}, [session, organizationId, isDemoMode]);

useEffect(() => {
  let isMounted = true;

  if (isDemoMode) {
    const demoNames = Array.from(
      new Set(DEMO_ASSETS.map((asset) => normalizeTechnicianDisplayName(asset.technician)))
    ).filter((name) => name !== "Unassigned");
    setTechnicians(demoNames.map((name, index) => ({
      id: `demo-technician-${index}`,
      technician_name: name,
      is_active: true,
    })));
    setTechniciansLoading(false);
    setTechniciansError("");
    return undefined;
  }

  if (!session || !organizationId) {
    setTechnicians([]);
    setTechniciansLoading(false);
    setTechniciansError("");
    return undefined;
  }

  async function loadOrganizationTechnicians() {
    setTechniciansLoading(true);
    setTechniciansError("");
    const { data, error } = await supabase
      .from("technicians")
      .select("id, technician_name, employee_number, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("technician_name", { ascending: true });

    if (!isMounted) return;
    if (error) {
      console.error("ARGOS technicians load failed:", error);
      setTechnicians([]);
      setTechniciansError("ARGOS could not load active technicians.");
      setTechniciansLoading(false);
      return;
    }
    setTechnicians(data || []);
    setTechniciansLoading(false);
  }

  loadOrganizationTechnicians();
  return () => { isMounted = false; };
}, [session, organizationId, isDemoMode]);

useEffect(() => {
  if (!session || !organizationId) return;

  async function loadCloudAssets() {
    const { data, error } = await supabase
      .from("assets")
      .select("*, asset_types(asset_type_name), technicians(technician_name)")
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
    if (
      activeView === "administration" &&
      !organizationLoading &&
      !hasAdministrationAccess
    ) {
      setActiveView("command");
      setActiveAdministrationSection("Organization Profile");
    }
  }, [activeView, hasAdministrationAccess, organizationLoading]);

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

          const activeTrack = vinScannerVideoRef.current?.srcObject
            ?.getVideoTracks?.()[0];
          const capabilities = activeTrack?.getCapabilities?.() || {};
          setTorchSupported(Boolean(capabilities.torch));
          setTorchEnabled(false);

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
      setTorchSupported(false);
      setTorchEnabled(false);
    };
  }, [showVinScanner, scannerRunId, assets]);

  const statusOptions = statusConfigurations.map((status) => status.status_name);
  const activeBoardAssets = assets.filter((asset) => asset.status !== "Ready");
  const readyArchiveAssets = assets.filter((asset) => asset.status === "Ready");
  const normalizedFleetSearch = fleetSearch.trim().toLowerCase();
  const signedInTechnicianName = normalizeTechnicianDisplayName(
    profile?.full_name || session?.user?.user_metadata?.full_name || ""
  );
  const signedInTechnicianKey = normalizeTechnicianKey(signedInTechnicianName);
  const signedInTechnician = technicians.find(
    (technician) => normalizeTechnicianKey(technician.technician_name) === signedInTechnicianKey
  );
  const isAssignedToSignedInTechnician = (asset) => {
    if (signedInTechnician?.id && asset.technicianId) {
      return asset.technicianId === signedInTechnician.id;
    }

    return (
      signedInTechnicianName !== "Unassigned" &&
      normalizeTechnicianKey(asset.technician) === signedInTechnicianKey
    );
  };
  const assignedToMeAssets = assets.filter(isAssignedToSignedInTechnician);
  const unitsAwaitingMeAssets = assignedToMeAssets.filter((asset) => asset.status !== "Ready");
  const awaitingQcAssets = activeBoardAssets.filter((asset) => asset.status === "Awaiting QC");
  const readyForPickupAssets = activeBoardAssets.filter((asset) => asset.status === "Ready for Pickup");
  const filteredFleetAssets = [...assets]
    .filter((asset) => {
      const matchesUnitSearch =
        !normalizedFleetSearch ||
        String(asset.unit || "").toLowerCase().includes(normalizedFleetSearch);
      const matchesStatusFilter =
        fleetStatusFilter === "All Statuses" || asset.status === fleetStatusFilter;
      const matchesFieldQueue =
        fieldQueueMode === "all" ||
        (fieldQueueMode === "assigned" && isAssignedToSignedInTechnician(asset)) ||
        (fieldQueueMode === "awaiting" && isAssignedToSignedInTechnician(asset) && asset.status !== "Ready");

      return matchesUnitSearch && matchesStatusFilter && matchesFieldQueue;
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
  const technicianDailySummary = buildTechnicianDailySummary({
    assets,
    statusHistoryEvents,
    completedRepairRecords,
    isAssignedToTechnician: isAssignedToSignedInTechnician,
    technicianKey: signedInTechnicianKey,
    now: fieldCurrentTime,
  });
  const technicianAnalytics = buildTechnicianAnalytics(assets, completedRepairRecords);

  const statusDurationAnalytics = buildStatusDurationAnalytics(assets, statusHistoryEvents, statusOptions);

  function handleSelectAsset(asset) {
    const liveAsset = assets.find((currentAsset) => currentAsset.unit === asset.unit) || asset;
    setSelectedAsset(liveAsset);
    setEditAsset(normalizeAsset(liveAsset));
  }

  function handleOpenDailySummaryAsset(asset) {
    setShowDailySummary(false);
    setShowFieldHome(false);
    setActiveView(asset.status === "Ready" ? "fleet" : "command");
    handleSelectAsset(asset);
  }

  function cleanAsset(assetToClean) {
    const { __fromVinScan, __decodedAssetDescription, ...assetFields } = assetToClean;
    const isReadyStatus = assetFields.status === "Ready";

    const repairUpdateText = String(assetFields.repairUpdateDraft || "").trim();
    const repairTimeline = Array.isArray(assetFields.repairTimeline)
      ? [...assetFields.repairTimeline]
      : [];

    if (repairUpdateText) {
      repairTimeline.unshift({
        id: `repair-update-${Date.now()}`,
        note: repairUpdateText,
        recordedAt: new Date().toISOString(),
      });
    }

    return {
      ...assetFields,
      unit: assetFields.unit.trim(),
      vin: assetFields.vin.trim().toUpperCase(),
      departmentId: assetFields.departmentId || "",
      department: String(assetFields.department || "").trim(),
      assetTypeId: assetFields.assetTypeId || "",
      assetTypeName: String(assetFields.assetTypeName || "").trim(),
      asset: assetFields.asset.trim(),
      workOrderNumber: String(assetFields.workOrderNumber || "").trim(),
      vendorShop: String(assetFields.vendorShop || "").trim(),
      primaryVmrs: String(assetFields.primaryVmrs || "").trim(),
      secondaryVmrs: String(assetFields.secondaryVmrs || "").trim(),
      warrantyStatus: calculateWarrantyAwareness(assetFields),
      repairTimeline,
      repairUpdateDraft: "",
      technician: normalizeTechnicianDisplayName(assetFields.technician),
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

  function applyDepartmentSelection(currentAsset, departmentId) {
    const selectedDepartment = departments.find(
      (department) => department.id === departmentId
    );

    return {
      ...currentAsset,
      departmentId: selectedDepartment?.id || "",
      department: selectedDepartment?.department_name || "",
    };
  }

  function handleDepartmentChange(event) {
    setEditAsset((currentAsset) =>
      applyDepartmentSelection(currentAsset, event.target.value)
    );
  }

  function handleNewAssetDepartmentChange(event) {
    setNewAsset((currentAsset) =>
      applyDepartmentSelection(currentAsset, event.target.value)
    );
  }

  function applyAssetTypeSelection(currentAsset, assetTypeId) {
    const selectedAssetType = assetTypes.find((assetType) => assetType.id === assetTypeId);
    return {
      ...currentAsset,
      assetTypeId: selectedAssetType?.id || "",
      assetTypeName: selectedAssetType?.asset_type_name || "",
    };
  }

  function handleAssetTypeChange(event) {
    setEditAsset((currentAsset) =>
      applyAssetTypeSelection(currentAsset, event.target.value)
    );
  }

  function handleNewAssetTypeChange(event) {
    setNewAsset((currentAsset) =>
      applyAssetTypeSelection(currentAsset, event.target.value)
    );
  }

  function resolveDepartmentValue(value) {
    const normalizedValue = normalizeDepartmentLookupValue(value);

    if (!normalizedValue) return null;

    const canonicalMatch = departments.find((department) => {
      const normalizedName = normalizeDepartmentLookupValue(
        department.department_name
      );
      const normalizedCode = normalizeDepartmentLookupValue(
        department.department_code
      );

      return normalizedName === normalizedValue || normalizedCode === normalizedValue;
    });

    if (canonicalMatch) return canonicalMatch;

    const aliasMatch = departmentAliases.find(
      (alias) =>
        normalizeDepartmentLookupValue(alias.alias_name) === normalizedValue
    );

    if (!aliasMatch) return null;

    return departments.find(
      (department) => department.id === aliasMatch.department_id
    ) || null;
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
      repairOpenedAt:
        !isNowReady && wasReady
          ? currentAsset.repairOpenedAt || getTodayDateString()
          : currentAsset.repairOpenedAt,
      repairCompletedAt: isNowReady ? getTodayDateString() : "",
      mileageAtRepair:
        !isNowReady && wasReady && currentAsset.mileageAtRepair === ""
          ? currentAsset.currentMileage
          : currentAsset.mileageAtRepair,
      engineHoursAtRepair:
        !isNowReady && wasReady && currentAsset.engineHoursAtRepair === ""
          ? currentAsset.currentEngineHours
          : currentAsset.engineHoursAtRepair,
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
    if (
      !updatedAsset.unit ||
      !updatedAsset.departmentId ||
      !updatedAsset.department ||
      !updatedAsset.assetTypeId ||
      !updatedAsset.asset
    ) {
      alert("Unit, Department, Asset Type, and Asset Description are required.");
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

  function applyTechnicianSelection(currentAsset, technicianId) {
    const selectedTechnician = technicians.find((technician) => technician.id === technicianId);
    return {
      ...currentAsset,
      technicianId: selectedTechnician?.id || "",
      technician: selectedTechnician?.technician_name || "Unassigned",
    };
  }

  function handleTechnicianChange(event) {
    setEditAsset((currentAsset) => applyTechnicianSelection(currentAsset, event.target.value));
  }

  function handleNewAssetTechnicianChange(event) {
    setNewAsset((currentAsset) => applyTechnicianSelection(currentAsset, event.target.value));
  }

  function handleSave() { completeSave(); }
  function handleSaveNewAsset() { completeSaveNewAsset(); }

  async function completeSave() {
    fieldSaveCompletedRef.current = false;
    const originalUnit = selectedAsset.unit;
    const originalVin = selectedAsset.vin || "";
    const statusChanged = selectedAsset.status !== editAsset.status;

    const updatedAsset = cleanAsset({
      ...editAsset,
      statusStartedAt: statusChanged ? getTodayDateString() : editAsset.statusStartedAt,
    });

    if (!validateAsset(updatedAsset, originalUnit, originalVin)) return;

    const isCompletingRepairEvent = selectedAsset.status !== "Ready" && updatedAsset.status === "Ready";

    if (isDemoMode) {
      if (isCompletingRepairEvent) {
        const shouldComplete = window.confirm(
          `Return Unit ${selectedAsset.unit} to Ready? This demo change will move the repair event to Repair History until the demo is exited or refreshed.`
        );
        if (!shouldComplete) return;

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
        const completedEvent = normalizeCompletedRepairEvent({
          ...selectedAsset,
          id: `demo-completed-${Date.now()}`,
          completedDate: getTodayDateString(),
          finalDaysDown: calculateFinalDaysDown(selectedAsset.downSince),
          finalStatus: "Ready",
        });
        const historyEvent = createStatusHistoryEvent(selectedAsset, returnedAsset, statusHistoryEvents);

        setCompletedRepairEvents((currentEvents) => [completedEvent, ...currentEvents]);
        setStatusHistoryEvents((currentEvents) => [historyEvent, ...currentEvents]);
        setAssets((currentAssets) => currentAssets.map((asset) => asset.unit === originalUnit ? returnedAsset : asset));
        fieldSaveCompletedRef.current = true;
        setSelectedAsset(null);
        setEditAsset(null);
        setActiveView("history");
        return;
      }

      if (statusChanged) {
        const historyEvent = createStatusHistoryEvent(selectedAsset, updatedAsset, statusHistoryEvents);
        setStatusHistoryEvents((currentEvents) => [historyEvent, ...currentEvents]);
      }

      setAssets((currentAssets) => currentAssets.map((asset) => asset.unit === originalUnit ? updatedAsset : asset));
      fieldSaveCompletedRef.current = true;
      setSelectedAsset(updatedAsset);
      setEditAsset(null);
      setActiveView(updatedAsset.status === "Ready" ? "fleet" : "command");
      return;
    }

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
    department_id: returnedAsset.departmentId,
    asset_type_id: returnedAsset.assetTypeId,
    asset: returnedAsset.asset,
    year: returnedAsset.year || null,
    make: returnedAsset.make || null,
    model: returnedAsset.model || null,
    engine: returnedAsset.engine || null,
    fuel_type: returnedAsset.fuelType || null,
    body_class: returnedAsset.bodyClass || null,
    drive_type: returnedAsset.driveType || null,
    gvwr_class: returnedAsset.gvwrClass || null,
    manufacturer: returnedAsset.manufacturer || null,
    apwa_code: returnedAsset.apwaCode || null,
    apwa_description: returnedAsset.apwaDescription || null,
    current_mileage: returnedAsset.currentMileage === "" ? null : Number(returnedAsset.currentMileage),
    current_engine_hours: returnedAsset.currentEngineHours === "" ? null : Number(returnedAsset.currentEngineHours),
    work_order_number: returnedAsset.workOrderNumber || null,
    vendor_shop: returnedAsset.vendorShop || null,
    primary_vmrs: returnedAsset.primaryVmrs || null,
    secondary_vmrs: returnedAsset.secondaryVmrs || null,
    repair_opened_at: returnedAsset.repairOpenedAt || null,
    repair_completed_at: returnedAsset.repairCompletedAt || getTodayDateString(),
    mileage_at_repair: returnedAsset.mileageAtRepair === "" ? null : Number(returnedAsset.mileageAtRepair),
    engine_hours_at_repair: returnedAsset.engineHoursAtRepair === "" ? null : Number(returnedAsset.engineHoursAtRepair),
    warranty_status: calculateWarrantyAwareness(returnedAsset),
    warranty_type: returnedAsset.warrantyType || null,
    warranty_expiration_date: returnedAsset.warrantyExpirationDate || null,
    warranty_mileage_limit: returnedAsset.warrantyMileageLimit === "" ? null : Number(returnedAsset.warrantyMileageLimit),
    last_service_date: returnedAsset.lastServiceDate || null,
    last_service_mileage: returnedAsset.lastServiceMileage === "" ? null : Number(returnedAsset.lastServiceMileage),
    last_service_hours: returnedAsset.lastServiceHours === "" ? null : Number(returnedAsset.lastServiceHours),
    next_service_mileage: returnedAsset.nextServiceMileage === "" ? null : Number(returnedAsset.nextServiceMileage),
    next_service_hours: returnedAsset.nextServiceHours === "" ? null : Number(returnedAsset.nextServiceHours),
    repair_timeline: returnedAsset.repairTimeline || [],
    nhtsa_decode: returnedAsset.nhtsaDecode || {},
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
    work_order_number: completedEvent.workOrderNumber || null,
    vendor_shop: completedEvent.vendorShop || null,
    primary_vmrs: completedEvent.primaryVmrs || null,
    secondary_vmrs: completedEvent.secondaryVmrs || null,
    mileage_at_repair: completedEvent.mileageAtRepair === "" ? null : Number(completedEvent.mileageAtRepair),
    engine_hours_at_repair: completedEvent.engineHoursAtRepair === "" ? null : Number(completedEvent.engineHoursAtRepair),
    warranty_status: completedEvent.warrantyStatus || "Unknown",
    repair_opened_at: completedEvent.repairOpenedAt || completedEvent.downSince || null,
    repair_completed_at: completedEvent.completedDate,
    repair_timeline: completedEvent.repairTimeline || [],
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
    department_id: updatedAsset.departmentId,
    asset_type_id: updatedAsset.assetTypeId,
    asset: updatedAsset.asset,
    year: updatedAsset.year || null,
    make: updatedAsset.make || null,
    model: updatedAsset.model || null,
    engine: updatedAsset.engine || null,
    fuel_type: updatedAsset.fuelType || null,
    body_class: updatedAsset.bodyClass || null,
    drive_type: updatedAsset.driveType || null,
    gvwr_class: updatedAsset.gvwrClass || null,
    manufacturer: updatedAsset.manufacturer || null,
    apwa_code: updatedAsset.apwaCode || null,
    apwa_description: updatedAsset.apwaDescription || null,
    current_mileage: updatedAsset.currentMileage === "" ? null : Number(updatedAsset.currentMileage),
    current_engine_hours: updatedAsset.currentEngineHours === "" ? null : Number(updatedAsset.currentEngineHours),
    work_order_number: updatedAsset.workOrderNumber || null,
    vendor_shop: updatedAsset.vendorShop || null,
    primary_vmrs: updatedAsset.primaryVmrs || null,
    secondary_vmrs: updatedAsset.secondaryVmrs || null,
    repair_opened_at: updatedAsset.repairOpenedAt || null,
    repair_completed_at: updatedAsset.repairCompletedAt || null,
    mileage_at_repair: updatedAsset.mileageAtRepair === "" ? null : Number(updatedAsset.mileageAtRepair),
    engine_hours_at_repair: updatedAsset.engineHoursAtRepair === "" ? null : Number(updatedAsset.engineHoursAtRepair),
    warranty_status: calculateWarrantyAwareness(updatedAsset),
    warranty_type: updatedAsset.warrantyType || null,
    warranty_expiration_date: updatedAsset.warrantyExpirationDate || null,
    warranty_mileage_limit: updatedAsset.warrantyMileageLimit === "" ? null : Number(updatedAsset.warrantyMileageLimit),
    last_service_date: updatedAsset.lastServiceDate || null,
    last_service_mileage: updatedAsset.lastServiceMileage === "" ? null : Number(updatedAsset.lastServiceMileage),
    last_service_hours: updatedAsset.lastServiceHours === "" ? null : Number(updatedAsset.lastServiceHours),
    next_service_mileage: updatedAsset.nextServiceMileage === "" ? null : Number(updatedAsset.nextServiceMileage),
    next_service_hours: updatedAsset.nextServiceHours === "" ? null : Number(updatedAsset.nextServiceHours),
    repair_timeline: updatedAsset.repairTimeline || [],
    nhtsa_decode: updatedAsset.nhtsaDecode || {},
    status: updatedAsset.status,
    status_started_at: updatedAsset.statusStartedAt,
    reason: updatedAsset.reason,
    priority: updatedAsset.priority,
    down_since: updatedAsset.downSince,
    technician_id: updatedAsset.technicianId || null,
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

fieldSaveCompletedRef.current = true;
setSelectedAsset(savedAsset);
setEditAsset(null);
setActiveView(savedAsset.status === "Ready" ? "history" : "command");
  }

  async function handleSaveAndScanNext() {
    fieldSaveCompletedRef.current = false;
    await completeSave();

    if (!fieldSaveCompletedRef.current) return;

    setFieldScanContext(null);
    handleOpenVinScanner();
  }

  async function completeSaveNewAsset() {
  const cleanedAsset = cleanAsset({
    ...newAsset,
    statusStartedAt: newAsset.statusStartedAt || getTodayDateString(),
  });

  if (!validateAsset(cleanedAsset)) return;

  if (isDemoMode) {
    const demoAsset = normalizeAsset({ ...cleanedAsset });
    setAssets((currentAssets) => [...currentAssets, demoAsset]);
    setSelectedAsset(demoAsset);
    setNewAsset(null);
    setActiveView(demoAsset.status === "Ready" ? "fleet" : "command");
    return;
  }

  const { data, error } = await supabase
    .from("assets")
    .insert({
      organization_id: organizationId,
      unit: cleanedAsset.unit,
      vin: cleanedAsset.vin,
      department: cleanedAsset.department,
      department_id: cleanedAsset.departmentId,
      asset_type_id: cleanedAsset.assetTypeId,
      asset: cleanedAsset.asset,
      year: cleanedAsset.year || null,
      make: cleanedAsset.make || null,
      model: cleanedAsset.model || null,
      engine: cleanedAsset.engine || null,
      fuel_type: cleanedAsset.fuelType || null,
      body_class: cleanedAsset.bodyClass || null,
      drive_type: cleanedAsset.driveType || null,
      gvwr_class: cleanedAsset.gvwrClass || null,
      manufacturer: cleanedAsset.manufacturer || null,
      apwa_code: cleanedAsset.apwaCode || null,
      apwa_description: cleanedAsset.apwaDescription || null,
      current_mileage: cleanedAsset.currentMileage === "" ? null : Number(cleanedAsset.currentMileage),
      current_engine_hours: cleanedAsset.currentEngineHours === "" ? null : Number(cleanedAsset.currentEngineHours),
      work_order_number: cleanedAsset.workOrderNumber || null,
      vendor_shop: cleanedAsset.vendorShop || null,
      primary_vmrs: cleanedAsset.primaryVmrs || null,
      secondary_vmrs: cleanedAsset.secondaryVmrs || null,
      repair_opened_at: cleanedAsset.repairOpenedAt || null,
      repair_completed_at: cleanedAsset.repairCompletedAt || null,
      mileage_at_repair: cleanedAsset.mileageAtRepair === "" ? null : Number(cleanedAsset.mileageAtRepair),
      engine_hours_at_repair: cleanedAsset.engineHoursAtRepair === "" ? null : Number(cleanedAsset.engineHoursAtRepair),
      warranty_status: calculateWarrantyAwareness(cleanedAsset),
      warranty_type: cleanedAsset.warrantyType || null,
      warranty_expiration_date: cleanedAsset.warrantyExpirationDate || null,
      warranty_mileage_limit: cleanedAsset.warrantyMileageLimit === "" ? null : Number(cleanedAsset.warrantyMileageLimit),
      last_service_date: cleanedAsset.lastServiceDate || null,
      last_service_mileage: cleanedAsset.lastServiceMileage === "" ? null : Number(cleanedAsset.lastServiceMileage),
      last_service_hours: cleanedAsset.lastServiceHours === "" ? null : Number(cleanedAsset.lastServiceHours),
      next_service_mileage: cleanedAsset.nextServiceMileage === "" ? null : Number(cleanedAsset.nextServiceMileage),
      next_service_hours: cleanedAsset.nextServiceHours === "" ? null : Number(cleanedAsset.nextServiceHours),
      repair_timeline: cleanedAsset.repairTimeline || [],
      nhtsa_decode: cleanedAsset.nhtsaDecode || {},
      status: cleanedAsset.status,
      status_started_at: cleanedAsset.statusStartedAt,
      reason: cleanedAsset.reason,
      priority: cleanedAsset.priority,
      down_since: cleanedAsset.downSince,
      technician_id: cleanedAsset.technicianId || null,
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
        const importedAsset = normalizeImportedAsset(row, statusOptions);
        const resolvedDepartment = resolveDepartmentValue(importedAsset.department);
        const rowNumber = index + 2;
        const rowErrors = [];
        const unitKey = importedAsset.unit.toLowerCase();
        const vinKey = importedAsset.vin.toLowerCase();

        if (!importedAsset.unit) rowErrors.push("missing Unit");
        if (!importedAsset.department) {
          rowErrors.push("missing Department");
        } else if (!resolvedDepartment) {
          rowErrors.push(
            `Department "${importedAsset.department}" is not configured as an active department, code, or alias`
          );
        }
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
        validImportedAssets.push({
          ...importedAsset,
          departmentId: resolvedDepartment.id,
          department: resolvedDepartment.department_name,
        });
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

      if (isDemoMode) {
        setAssets((currentAssets) => [...currentAssets, ...validImportedAssets]);
        setActiveView("command");
        setImportStatus(
          `Imported ${validImportedAssets.length} temporary demo asset${validImportedAssets.length === 1 ? "" : "s"}. These changes will disappear when the demo is exited or refreshed.${rejectedRows.length > 0 ? ` Rejected ${rejectedRows.length} row${rejectedRows.length === 1 ? "" : "s"}: ${rejectedRows.join(" | ")}` : ""}`
        );
        event.target.value = "";
        return;
      }

      const cloudRows = validImportedAssets.map((asset) => ({
        organization_id: organizationId,
        unit: asset.unit,
        vin: asset.vin,
        department: asset.department,
        department_id: asset.departmentId,
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


  async function handleToggleScannerTorch() {
    const activeTrack = vinScannerVideoRef.current?.srcObject
      ?.getVideoTracks?.()[0];

    if (!activeTrack || !torchSupported) return;

    const nextTorchState = !torchEnabled;

    try {
      await activeTrack.applyConstraints({
        advanced: [{ torch: nextTorchState }],
      });
      setTorchEnabled(nextTorchState);
    } catch (error) {
      console.warn("ARGOS scanner torch control is unavailable:", error);
      setTorchSupported(false);
      setTorchEnabled(false);
    }
  }

  function resetVinScannerFeedback() {
    setVinScanSuccess(false);
    setTorchSupported(false);
    setTorchEnabled(false);
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
    resetVinScannerFeedback();
    setFieldScanContext(null);
    setShowVinScanner(true);
    setScannerRunId((currentRunId) => currentRunId + 1);
  }

  function handleCloseVinScanner() {
    vinScanLockedRef.current = false;
    vinScannerControlsRef.current?.stop();
    vinScannerControlsRef.current = null;
    resetVinScannerFeedback();
    setShowVinScanner(false);
  }

  function handleScanAgain() {
    vinScanLockedRef.current = false;
    vinScannerControlsRef.current?.stop();
    vinScannerControlsRef.current = null;
    setLastScannedVin("");
    setVinScanStatus("");
    resetVinScannerFeedback();
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
    setVinScanSuccess(true);
    setVinScanStatus(
      matchedAsset
        ? `VIN recognized. Unit ${matchedAsset.unit} found.`
        : "VIN recognized. Preparing a new vehicle record."
    );

    await new Promise((resolve) => window.setTimeout(resolve, 650));

    if (matchedAsset) {
      setVinScanStatus(`Matched VIN ${scannedVin} to Unit ${matchedAsset.unit}.`);
      setFieldScanContext({ type: "matched", vin: scannedVin, unit: matchedAsset.unit });
      setShowVinScanner(false);
      setShowFieldHome(false);
      setActiveView("fleet");
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

    setFieldScanContext({ type: "new", vin: scannedVin, description: decodedAssetDescription || "Vehicle details pending" });
    setShowVinScanner(false);
    setShowFieldHome(false);
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

    if (source === "scanner" && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([90, 45, 140]);
    }

    await openAssetFromVin(scannedVin, source === "manual" ? "Manual entry" : "Scanner");
  }

  function handleManualVinSubmit() {
    handleVinScanResult(manualVinEntry, "manual");
  }

  function renderAssetForm(
    asset,
    onChange,
    onDepartmentChange,
    onAssetTypeChange,
    onStatusChange,
    onRTSTypeChange,
    onTechnicianChange
  ) {
    const decodedEntries = Object.entries(asset.nhtsaDecode || {}).filter(
      ([, value]) => value !== null && value !== undefined && String(value).trim() !== ""
    );

    return (
      <div className="vehicle-record-form">
        <section className="vehicle-form-section vehicle-form-section-open">
          <div className="vehicle-form-section-heading">
            <div>
              <p className="eyebrow">Fleet Record</p>
              <h4>Vehicle Identity</h4>
            </div>
            <span>Required working fields</span>
          </div>

          <div className="vehicle-form-grid">
            <label>
              Unit Number
              <input type="text" name="unit" value={asset.unit} onChange={onChange} />
            </label>

            <label>
              VIN
              <input type="text" name="vin" value={asset.vin} onChange={onChange} placeholder="17-character VIN" maxLength="17" />
            </label>

            <label>
              Year
              <input type="text" name="year" value={asset.year || ""} onChange={onChange} inputMode="numeric" />
            </label>

            <label>
              Make
              <input type="text" name="make" value={asset.make || ""} onChange={onChange} />
            </label>

            <label>
              Model
              <input type="text" name="model" value={asset.model || ""} onChange={onChange} />
            </label>

            <label>
              Engine
              <input type="text" name="engine" value={asset.engine || ""} onChange={onChange} />
            </label>

            <label className="vehicle-field-wide">
              Fleet Asset Description
              <input type="text" name="asset" value={asset.asset} onChange={onChange} placeholder="Agency-facing vehicle description" />
            </label>
          </div>
        </section>

        <section className="vehicle-form-section vehicle-meter-section">
          <div className="vehicle-section-heading">
            <span><strong>Current Meter Readings</strong><small>Used for maintenance history, utilization, and lifecycle reporting</small></span>
          </div>
          <div className="vehicle-form-grid vehicle-details-body">
            <label>
              Current Mileage
              <input
                type="number"
                name="currentMileage"
                value={asset.currentMileage ?? ""}
                onChange={onChange}
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="Miles"
              />
              {asset.mileageUpdatedAt && <small className="meter-updated-note">Last updated {new Date(asset.mileageUpdatedAt).toLocaleString()}</small>}
            </label>

            <label>
              Current Engine Hours
              <input
                type="number"
                name="currentEngineHours"
                value={asset.currentEngineHours ?? ""}
                onChange={onChange}
                inputMode="decimal"
                min="0"
                step="0.1"
                placeholder="Hours"
              />
              {asset.engineHoursUpdatedAt && <small className="meter-updated-note">Last updated {new Date(asset.engineHoursUpdatedAt).toLocaleString()}</small>}
            </label>

            <div className="vehicle-field-wide meter-guidance">
              <strong>Meter history is preserved automatically.</strong>
              <span>Each saved change creates a dated reading for future maintenance, cost-per-mile, cost-per-hour, and replacement analysis.</span>
            </div>
          </div>
        </section>

        <details className="vehicle-form-section" open>
          <summary>
            <span><strong>Fleet Classification</strong><small>Department, asset type, and APWA reporting carve-out</small></span>
          </summary>
          <div className="vehicle-form-grid vehicle-details-body">
            <label>
              Department
              <select name="departmentId" value={asset.departmentId || ""} onChange={onDepartmentChange} disabled={departmentsLoading || departments.length === 0}>
                <option value="">{departmentsLoading ? "Loading departments…" : departments.length === 0 ? "No active departments configured" : "Select Department"}</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.department_name}{department.department_code ? ` (${department.department_code})` : ""}</option>
                ))}
              </select>
              {departmentsError && <span className="department-field-error">{departmentsError}</span>}
            </label>

            <label>
              Asset Type
              <select name="assetTypeId" value={asset.assetTypeId || ""} onChange={onAssetTypeChange} disabled={assetTypesLoading || assetTypes.length === 0}>
                <option value="">{assetTypesLoading ? "Loading Asset Types…" : assetTypes.length === 0 ? "No active Asset Types configured" : "Select Asset Type"}</option>
                {assetTypes.map((assetType) => (
                  <option key={assetType.id} value={assetType.id}>{assetType.asset_type_name}{assetType.asset_type_code ? ` (${assetType.asset_type_code})` : ""}</option>
                ))}
              </select>
              {assetTypesError && <span className="department-field-error">{assetTypesError}</span>}
            </label>

            <label>
              APWA Code
              <input type="text" name="apwaCode" value={asset.apwaCode || ""} onChange={onChange} placeholder="Controlled code" />
            </label>

            <label>
              APWA Description
              <input type="text" name="apwaDescription" value={asset.apwaDescription || ""} onChange={onChange} placeholder="Equipment classification" />
            </label>
          </div>
        </details>

        <details className="vehicle-form-section">
          <summary>
            <span><strong>NHTSA Vehicle Specifications</strong><small>Expanded decoded data; editable where operationally relevant</small></span>
          </summary>
          <div className="vehicle-form-grid vehicle-details-body">
            <label>Fuel Type<input type="text" name="fuelType" value={asset.fuelType || ""} onChange={onChange} /></label>
            <label>Body Class<input type="text" name="bodyClass" value={asset.bodyClass || ""} onChange={onChange} /></label>
            <label>Drive Type<input type="text" name="driveType" value={asset.driveType || ""} onChange={onChange} /></label>
            <label>GVWR Class<input type="text" name="gvwrClass" value={asset.gvwrClass || ""} onChange={onChange} /></label>
            <label className="vehicle-field-wide">Manufacturer<input type="text" name="manufacturer" value={asset.manufacturer || ""} onChange={onChange} /></label>
            <div className="vehicle-field-wide nhtsa-decode-summary">
              <strong>Complete NHTSA Decode</strong>
              <span>{decodedEntries.length > 0 ? `${decodedEntries.length} populated decoded values retained.` : "No mobile NHTSA decode has been attached to this record yet."}</span>
              {decodedEntries.length > 0 && (
                <details className="raw-decode-details">
                  <summary>Show all decoded values</summary>
                  <dl>{decodedEntries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>
                </details>
              )}
            </div>
          </div>
        </details>

        <details className="vehicle-form-section repair-awareness-section" open>
          <summary>
            <span><strong>Repair Awareness</strong><small>Operational reference only — ARGOS does not replace the work order system</small></span>
          </summary>
          <div className="vehicle-form-grid vehicle-details-body">
            <label>
              Work Order Number
              <input type="text" name="workOrderNumber" value={asset.workOrderNumber || ""} onChange={onChange} placeholder="Optional FMIS or internal reference" maxLength="80" />
            </label>
            <label>
              Vendor / Shop
              <input type="text" name="vendorShop" value={asset.vendorShop || ""} onChange={onChange} placeholder="Internal shop or third-party provider" maxLength="160" />
            </label>
            <label>
              Primary VMRS Code
              <input type="text" name="primaryVmrs" value={asset.primaryVmrs || ""} onChange={onChange} placeholder="Optional; controlled lookup follows later" maxLength="40" />
            </label>
            <label>
              Secondary VMRS Code
              <input type="text" name="secondaryVmrs" value={asset.secondaryVmrs || ""} onChange={onChange} placeholder="Optional" maxLength="40" />
            </label>
            <label>
              Repair Opened
              <input type="date" name="repairOpenedAt" value={asset.repairOpenedAt || ""} onChange={onChange} />
            </label>
            <label>
              Repair Completed
              <input type="date" name="repairCompletedAt" value={asset.repairCompletedAt || ""} onChange={onChange} />
            </label>
            <label>
              Mileage at Repair
              <input type="number" name="mileageAtRepair" value={asset.mileageAtRepair ?? ""} onChange={onChange} min="0" step="1" placeholder="Snapshot when repair opens" />
            </label>
            <label>
              Engine Hours at Repair
              <input type="number" name="engineHoursAtRepair" value={asset.engineHoursAtRepair ?? ""} onChange={onChange} min="0" step="0.1" placeholder="Optional snapshot" />
            </label>
            <label className="vehicle-field-wide">
              Warranty Status at Repair
              <select name="warrantyStatus" value={asset.warrantyStatus || "Unknown"} onChange={onChange}>
                <option>Unknown</option>
                <option>Under Warranty</option>
                <option>Near Expiration</option>
                <option>Expired</option>
                <option>Not Applicable</option>
              </select>
            </label>
            <label className="vehicle-field-wide">
              Add Repair Timeline Update
              <textarea name="repairUpdateDraft" value={asset.repairUpdateDraft || ""} onChange={onChange} rows="3" placeholder="Example: Diagnosis confirmed; alternator ordered. This entry will be timestamped when saved." />
            </label>
            <div className="vehicle-field-wide repair-timeline-preview">
              <div className="repair-timeline-heading">
                <strong>Operational Timeline</strong>
                <span>{(asset.repairTimeline || []).length} update{(asset.repairTimeline || []).length === 1 ? "" : "s"}</span>
              </div>
              {(asset.repairTimeline || []).length === 0 ? (
                <p>No repair updates have been recorded.</p>
              ) : (
                <ol>
                  {(asset.repairTimeline || []).map((entry) => (
                    <li key={entry.id || `${entry.recordedAt}-${entry.note}`}>
                      <time>{entry.recordedAt ? new Date(entry.recordedAt).toLocaleString() : "Recorded update"}</time>
                      <span>{entry.note}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </details>


        <details className="vehicle-form-section warranty-awareness-section" open>
          <summary>
            <span><strong>Warranty Awareness</strong><small>Expiration and mileage awareness without warranty claim administration</small></span>
          </summary>
          <div className="vehicle-form-grid vehicle-details-body">
            <div className="vehicle-field-wide awareness-status-banner">
              <span>Current Warranty State</span>
              <strong>{calculateWarrantyAwareness(asset)}</strong>
            </div>
            <label>Warranty Type<input type="text" name="warrantyType" value={asset.warrantyType || ""} onChange={onChange} placeholder="Example: Powertrain" maxLength="100" /></label>
            <label>Warranty Expiration Date<input type="date" name="warrantyExpirationDate" value={asset.warrantyExpirationDate || ""} onChange={onChange} /></label>
            <label>Warranty Mileage Limit<input type="number" name="warrantyMileageLimit" value={asset.warrantyMileageLimit ?? ""} onChange={onChange} min="0" step="1" placeholder="Example: 100000" /></label>
            <label>Warranty Status Override<select name="warrantyStatus" value={asset.warrantyStatus || "Unknown"} onChange={onChange}><option>Unknown</option><option>Under Warranty</option><option>Expired</option><option>Not Applicable</option></select></label>
          </div>
        </details>

        <details className="vehicle-form-section service-awareness-section" open>
          <summary>
            <span><strong>Service Awareness</strong><small>Lightweight meter-based awareness; no PM scheduling or work-order generation</small></span>
          </summary>
          <div className="vehicle-form-grid vehicle-details-body">
            <div className="vehicle-field-wide awareness-status-banner">
              <span>Current Service State</span>
              <strong>{calculateServiceAwareness(asset)}</strong>
            </div>
            <label>Last Service Date<input type="date" name="lastServiceDate" value={asset.lastServiceDate || ""} onChange={onChange} /></label>
            <label>Last Service Mileage<input type="number" name="lastServiceMileage" value={asset.lastServiceMileage ?? ""} onChange={onChange} min="0" step="1" /></label>
            <label>Last Service Engine Hours<input type="number" name="lastServiceHours" value={asset.lastServiceHours ?? ""} onChange={onChange} min="0" step="0.1" /></label>
            <label>Next Service Mileage<input type="number" name="nextServiceMileage" value={asset.nextServiceMileage ?? ""} onChange={onChange} min="0" step="1" /></label>
            <label>Next Service Engine Hours<input type="number" name="nextServiceHours" value={asset.nextServiceHours ?? ""} onChange={onChange} min="0" step="0.1" /></label>
          </div>
        </details>

        <details className="vehicle-form-section" open>
          <summary>
            <span><strong>Operational Status</strong><small>Availability, assignment, and return-to-service workflow</small></span>
          </summary>
          <div className="vehicle-form-grid vehicle-details-body">
            <label>Status<select name="status" value={asset.status} onChange={onStatusChange}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>Reason<select name="reason" value={asset.reason} onChange={onChange}>{REASON_OPTIONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
            <label>Priority<select name="priority" value={asset.priority} onChange={onChange}>{PRIORITY_OPTIONS.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
            {asset.status !== "Ready" && <label>Down Since<input type="date" name="downSince" value={asset.downSince} onChange={onChange} /></label>}
            <label>Technician<select name="technicianId" value={asset.technicianId || ""} onChange={onTechnicianChange} disabled={techniciansLoading}><option value="">{techniciansLoading ? "Loading technicians…" : "Unassigned"}</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.technician_name}{technician.employee_number ? ` (${technician.employee_number})` : ""}</option>)}</select>{techniciansError && <span className="department-field-error">{techniciansError}</span>}</label>
            {asset.status !== "Ready" && <label>RTS Status<select name="rtsType" value={asset.rtsType} onChange={onRTSTypeChange}>{RTS_TYPE_OPTIONS.map((rtsType) => <option key={rtsType}>{rtsType}</option>)}</select></label>}
            {asset.status !== "Ready" && asset.rtsType === "Estimated Date" && <label>Estimated Return to Service<input type="date" name="rtsDate" value={asset.rtsDate} onChange={onChange} /></label>}
            <label className="vehicle-field-wide">Details / Notes<textarea name="details" value={asset.details} onChange={onChange} rows="4" /></label>
          </div>
        </details>
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

  function handleEnterDemo() {
    setAuthError("");
    setIsDemoMode(true);
    setProfile({ full_name: "ARGOS Demo Visitor", role: "demo" });
    setDepartments(DEMO_DEPARTMENTS);
    setDepartmentAliases([]);
    setAssets(
      DEMO_ASSETS.map((asset) => {
        const matchedDepartment = findDepartmentByName(
          DEMO_DEPARTMENTS,
          asset.department
        );

        return normalizeAsset({
          ...asset,
          departmentId: matchedDepartment?.id || "",
        });
      })
    );
    setCompletedRepairEvents([]);
    setStatusHistoryEvents([]);
    setSelectedAsset(null);
    setEditAsset(null);
    setNewAsset(null);
    setFleetSearch("");
    setFleetStatusFilter("All Statuses");
    setImportStatus("");
    setActiveView("command");
  }

  function handleExitDemo() {
    const shouldExit = window.confirm("Exit the ARGOS demo? All demo changes will be discarded.");
    if (!shouldExit) return;

    setIsDemoMode(false);
    setProfile(null);
    setDepartments([]);
    setDepartmentAliases([]);
    setAssets([]);
    setCompletedRepairEvents([]);
    setStatusHistoryEvents([]);
    setSelectedAsset(null);
    setEditAsset(null);
    setNewAsset(null);
    setActiveView("command");
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
    if (isDemoMode) {
      handleExitDemo();
      return;
    }

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

  if (!session && !isDemoMode) {
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

              <div style={{ margin: "1rem 0", display: "flex", alignItems: "center", gap: "0.75rem", color: "#7a8793", fontSize: "0.8rem" }}>
                <span style={{ flex: 1, height: "1px", background: "#d9dfe5" }}></span>
                <span>or explore without signing in</span>
                <span style={{ flex: 1, height: "1px", background: "#d9dfe5" }}></span>
              </div>

              <button type="button" onClick={handleEnterDemo} style={{ width: "100%", padding: "0.9rem 1rem", border: "1px solid #9a6b24", borderRadius: "9px", background: "#fffaf1", color: "#6f4b18", fontSize: "1rem", fontWeight: 800, cursor: "pointer" }}>
                Try ARGOS Demo
              </button>
              <p style={{ margin: "0.65rem 0 0", color: "#6d7884", fontSize: "0.78rem", lineHeight: 1.45, textAlign: "center" }}>
                Uses fictional fleet data. Changes are temporary and disappear when you exit or refresh.
              </p>
            </form>
          )}
        </section>
      </main>
    );
  }

  function openFieldView(view, options = {}) {
    if (options.resetFleet) {
      setFleetSearch("");
      setFleetStatusFilter("All Statuses");
    }

    setFieldQueueMode(options.fieldQueueMode || "all");
    setActiveView(view);
    setShowFieldHome(false);
  }

  return (
    <main className={`argos-shell ${showFieldHome ? "argos-field-home-active" : "argos-field-workspace-active"}`}>
      <section className="argos-field-home" aria-label="ARGOS Field mobile workspace">
        <header className="argos-field-hero">
          <div>
            <p className="argos-field-kicker">Technician Fleet Operations</p>
            <h1>ARGOS <span>Field</span></h1>
            <p>{getFieldGreeting(fieldCurrentTime)}, {profile?.full_name?.split(" ")?.[0] || "Operator"}.</p>
          </div>
          <div className="argos-field-availability" aria-label={`${availability}% fleet availability`}>
            <span>Availability</span>
            <strong>{availability}%</strong>
          </div>
        </header>

        {isDemoMode && <p className="argos-field-demo-badge">Demo environment · fictional fleet data</p>}

        <section className="argos-field-priority-strip" aria-label="Technician work metrics">
          <article><span>Assigned to Me</span><strong>{assignedToMeAssets.length}</strong></article>
          <article className="critical"><span>Critical</span><strong>{criticalAssets}</strong></article>
          <article><span>Waiting Parts</span><strong>{waitingParts}</strong></article>
          <article><span>Awaiting QC</span><strong>{awaitingQcAssets.length}</strong></article>
          <article><span>Ready Pickup</span><strong>{readyForPickupAssets.length}</strong></article>
        </section>

        <section className="argos-field-primary-workflow" aria-label="Primary technician action">
          <button className="argos-field-scan-button" type="button" onClick={() => { setShowFieldHome(false); handleOpenVinScanner(); }}>
            <span className="argos-field-scan-icon">▣</span>
            <span><strong>Scan VIN</strong><small>Identify a vehicle and open its record</small></span>
            <b>›</b>
          </button>
        </section>

        <div className="argos-field-actions">
          <button className="argos-field-action argos-field-action-emphasis" type="button" onClick={() => openFieldView("fleet", { resetFleet: true, fieldQueueMode: "assigned" })}>
            <span className="argos-field-action-icon">✓</span>
            <span><strong>My Assigned Work</strong><small>{assignedToMeAssets.length} vehicles currently assigned to your technician record</small></span>
            <b>›</b>
          </button>

          <button className="argos-field-action" type="button" onClick={() => openFieldView("fleet", { resetFleet: true, fieldQueueMode: "awaiting" })}>
            <span className="argos-field-action-icon">!</span>
            <span><strong>Units Awaiting Me</strong><small>{unitsAwaitingMeAssets.length} assigned units require action</small></span>
            <b>›</b>
          </button>

          <button className="argos-field-action" type="button" onClick={() => openFieldView("fleet", { resetFleet: true })}>
            <span className="argos-field-action-icon">⌕</span>
            <span><strong>Find Vehicle</strong><small>Search the complete fleet by unit number</small></span>
            <b>›</b>
          </button>

          <button className="argos-field-action" type="button" onClick={() => openFieldView("command")}>
            <span className="argos-field-action-icon">↯</span>
            <span><strong>Update Vehicle Status</strong><small>Open the operational exception board</small></span>
            <b>›</b>
          </button>

          <button className="argos-field-action" type="button" onClick={() => { setShowFieldHome(false); setShowDailySummary(true); }}>
            <span className="argos-field-action-icon">✦</span>
            <span><strong>Daily Summary</strong><small>Review your work, handoffs, blockers, and completed activity</small></span>
            <b>›</b>
          </button>
        </div>

        <footer className="argos-field-footer">
          <div><span>Signed in as</span><strong>{profile?.full_name || session?.user?.email || "ARGOS Demo Visitor"}</strong></div>
          <button type="button" onClick={handleSignOut}>{isDemoMode ? "Exit Demo" : "Log Out"}</button>
        </footer>
      </section>
      <header className="argos-field-workspace-header">
        <button type="button" onClick={() => setShowFieldHome(true)} aria-label="Return to ARGOS Field home">‹</button>
        <div><strong>ARGOS Field</strong><span>{activeView === "command" ? "Update Vehicle Status" : activeView === "fleet" && fieldQueueMode === "assigned" ? "My Assigned Work" : activeView === "fleet" && fieldQueueMode === "awaiting" ? "Units Awaiting Me" : activeView === "fleet" ? "Find Vehicle" : activeView}</span></div>
        <button type="button" onClick={handleOpenVinScanner} aria-label="Scan VIN">▣</button>
      </header>
      <ARGOSOperationsNavigation
        activeView={activeView}
        onNavigate={(nextView) => {
          if (nextView === "fleet") {
            setFleetSearch("");
            setFleetStatusFilter("All Statuses");
          }

          setActiveView(nextView);
        }}
        onOpenDailySummary={() => setShowDailySummary(true)}
        onSignOut={handleSignOut}
        hasAdministrationAccess={hasAdministrationAccess}
        isDemoMode={isDemoMode}
        organizationName={
          organizationProfile?.fleet_name ||
          organizationProfile?.name ||
          "Fleet Services"
        }
        userName={
          profile?.full_name ||
          session?.user?.email ||
          "ARGOS Demo Visitor"
        }
        userRole={profile?.role || (isDemoMode ? "demo" : "user")}
        versionLabel="Version 1.0"
      />

      <section className="dashboard">
        {activeView === "command" && (
          <CommandCenter
            availability={availability}
            readyAssets={readyAssets}
            unavailableAssets={unavailableAssets}
            totalAssets={totalAssets}
            waitingParts={waitingParts}
            criticalAssets={criticalAssets}
            activeBoardAssets={activeBoardAssets}
            assets={assets}
            completedRepairRecords={completedRepairRecords}
            statusHistoryEvents={statusHistoryEvents}
            technicianAnalytics={technicianAnalytics}
            organizationName={organizationProfile?.fleet_name || organizationProfile?.name || "Fleet Services"}
            selectedAsset={selectedAsset}
            importStatus={importStatus}
            csvInputRef={csvInputRef}
            onAddAsset={() => {
              setSelectedAsset(null);
              setEditAsset(null);
              setNewAsset(createBlankAsset());
              setActiveView("command");
            }}
            onDownloadCSVTemplate={handleDownloadCSVTemplate}
            onImportCSV={handleImportCSV}
            onSelectCSV={() => csvInputRef.current?.click()}
            onSelectAsset={handleSelectAsset}
            getStatusClass={getStatusClass}
            calculateDaysDown={calculateDaysDown}
            formatRTS={formatRTS}
          />
        )}

        {activeView === "fleet" && (
          <>
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">{fieldQueueMode === "assigned" ? "Technician Work Queue" : fieldQueueMode === "awaiting" ? "Technician Exceptions" : "Asset Roster"}</p>
                <h2>{fieldQueueMode === "assigned" ? "My Assigned Work" : fieldQueueMode === "awaiting" ? "Units Awaiting Me" : "My Fleet"}</h2>
              </div>

              <div className="refresh-box">
                <span>{fieldQueueMode === "all" ? "Total Assets" : "Queue Assets"}</span>
                <strong>{fieldQueueMode === "all" ? assets.length : filteredFleetAssets.length}</strong>
              </div>
            </header>

            <section className="status-board">
              <div className="status-board-header">
                <div>
                  <p className="eyebrow">◫ Fleet Asset Directory</p>
                  <h3>Search and Update Established Assets</h3>
                </div>

                <div className="fleet-directory-toolbar">
                  <input
                    type="search"
                    value={fleetSearch}
                    onChange={(event) => setFleetSearch(event.target.value)}
                    placeholder="Search by unit number"
                    aria-label="Search My Fleet by unit number"
                  />

                  <select
                    value={fleetStatusFilter}
                    onChange={(event) => setFleetStatusFilter(event.target.value)}
                    aria-label="Filter My Fleet by status"
                  >
                    <option value="All Statuses">All Statuses</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="fleet-directory-guidance">
                <p>{fieldQueueMode === "assigned" ? "This mobile queue shows vehicles assigned to your technician record. Select a vehicle to review or update it." : fieldQueueMode === "awaiting" ? "This mobile queue shows your assigned vehicles that are not Ready and currently require technician action." : "Select any asset to open its expandable vehicle record. Ready assets moved to a down status will appear on the Command Center automatically."}</p>
                <span>{fieldQueueMode !== "all" ? "Use the ARGOS Field back button to return to the technician home." : "Mobile VIN Intake: receiving workflow foundation prepared; desktop camera scanning is no longer part of the primary interface."}</span>
              </div>

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


        {activeView === "administration" && hasAdministrationAccess && (
          <AdministrationModule
            activeSection={activeAdministrationSection}
            onSelectSection={setActiveAdministrationSection}
            isDemoMode={isDemoMode}
            profile={profile}
            organizationProfile={organizationProfile}
            organizationProfileLoading={organizationProfileLoading}
            organizationProfileError={organizationProfileError}
          />
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
                  <div
                    className={`argos-vin-scanner-viewport${vinScanSuccess ? " is-success" : ""}`}
                  >
                    <video
                      ref={vinScannerVideoRef}
                      className="argos-vin-scanner-video"
                      muted
                      playsInline
                    />

                    <div className="argos-vin-scanner-overlay" aria-hidden="true">
                      <div className="argos-vin-scanner-shade argos-vin-scanner-shade-top" />
                      <div className="argos-vin-scanner-shade argos-vin-scanner-shade-bottom" />

                      <div className="argos-vin-scanner-target">
                        <span className="argos-vin-scanner-corner corner-top-left" />
                        <span className="argos-vin-scanner-corner corner-top-right" />
                        <span className="argos-vin-scanner-corner corner-bottom-left" />
                        <span className="argos-vin-scanner-corner corner-bottom-right" />
                        <span className="argos-vin-scanner-laser" />
                      </div>

                      {vinScanSuccess && (
                        <div className="argos-vin-scanner-success">
                          <span aria-hidden="true">✓</span>
                          <strong>VIN Recognized</strong>
                        </div>
                      )}

                      <div className="argos-vin-scanner-instruction">
                        {vinScanSuccess
                          ? "Opening vehicle record"
                          : "Align VIN barcode inside the guide"}
                      </div>
                    </div>
                  </div>
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

              <div className="update-actions argos-vin-scanner-actions">
                {torchSupported && (
                  <button
                    className={`cancel-button argos-vin-torch-button${torchEnabled ? " active" : ""}`}
                    onClick={handleToggleScannerTorch}
                    type="button"
                  >
                    {torchEnabled ? "Turn Flashlight Off" : "Turn Flashlight On"}
                  </button>
                )}

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

              <section className="argos-technician-daily-summary">
                <div className="argos-technician-summary-heading">
                  <div>
                    <p className="eyebrow">My Work Today</p>
                    <h4>{signedInTechnicianName !== "Unassigned" ? signedInTechnicianName : "Current Operator"}</h4>
                    <p>
                      {fieldCurrentTime.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <span>{technicianDailySummary.activeAssignedAssets.length} active</span>
                </div>

                <div className="argos-technician-summary-metrics">
                  <article>
                    <span>Assigned</span>
                    <strong>{technicianDailySummary.assignedAssets.length}</strong>
                  </article>
                  <article>
                    <span>Updated Today</span>
                    <strong>{technicianDailySummary.updatedUnits.length}</strong>
                  </article>
                  <article>
                    <span>Awaiting QC</span>
                    <strong>{technicianDailySummary.awaitingQcAssets.length}</strong>
                  </article>
                  <article>
                    <span>Ready Pickup</span>
                    <strong>{technicianDailySummary.readyForPickupAssets.length}</strong>
                  </article>
                  <article>
                    <span>Waiting Parts</span>
                    <strong>{technicianDailySummary.waitingPartsAssets.length}</strong>
                  </article>
                  <article className="critical">
                    <span>Critical</span>
                    <strong>{technicianDailySummary.criticalAssets.length}</strong>
                  </article>
                </div>

                <div className="argos-technician-summary-grid">
                  <div className="argos-technician-work-list">
                    <div className="argos-technician-list-heading">
                      <div>
                        <p className="eyebrow">Current Work</p>
                        <h4>Assigned Units Requiring Action</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDailySummary(false);
                          openFieldView("fleet", {
                            resetFleet: true,
                            fieldQueueMode: "awaiting",
                          });
                        }}
                      >
                        Open Queue
                      </button>
                    </div>

                    {technicianDailySummary.activeAssignedAssets.length === 0 ? (
                      <p className="argos-technician-empty-state">
                        No active units are currently assigned to you.
                      </p>
                    ) : (
                      technicianDailySummary.activeAssignedAssets.map((asset) => (
                        <button
                          className="argos-technician-work-item"
                          key={`daily-work-${asset.unit}`}
                          type="button"
                          onClick={() => handleOpenDailySummaryAsset(asset)}
                        >
                          <span>
                            <strong>{asset.unit}</strong>
                            <small>{asset.asset}</small>
                          </span>
                          <span>
                            <b className={`status-pill ${getStatusClass(asset.status)}`}>
                              {asset.status}
                            </b>
                            <small>{asset.details}</small>
                          </span>
                          <i aria-hidden="true">›</i>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="argos-technician-activity-list">
                    <div className="argos-technician-list-heading">
                      <div>
                        <p className="eyebrow">Activity Log</p>
                        <h4>Updates Recorded Today</h4>
                      </div>
                      <strong>
                        {technicianDailySummary.todayStatusEvents.length +
                          technicianDailySummary.todayCompletedRepairs.length}
                      </strong>
                    </div>

                    {technicianDailySummary.todayStatusEvents.length === 0 &&
                    technicianDailySummary.todayCompletedRepairs.length === 0 ? (
                      <p className="argos-technician-empty-state">
                        No technician activity has been recorded today.
                      </p>
                    ) : (
                      <>
                        {technicianDailySummary.todayStatusEvents.slice(0, 6).map((event) => (
                          <article key={`daily-event-${event.id}`}>
                            <span>{event.unit}</span>
                            <strong>{event.previousStatus} → {event.newStatus}</strong>
                            <small>
                              {new Date(event.recordedAt || event.statusEndedAt).toLocaleTimeString(
                                undefined,
                                { hour: "numeric", minute: "2-digit" }
                              )}
                            </small>
                          </article>
                        ))}

                        {technicianDailySummary.todayCompletedRepairs.slice(0, 4).map((record) => (
                          <article key={`daily-completed-${record.recordId}`}>
                            <span>{record.unit}</span>
                            <strong>Repair completed</strong>
                            <small>{record.details || record.reason || "Returned to service"}</small>
                          </article>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </section>

              <div className="argos-fleet-daily-divider">
                <span>Fleet-wide operational brief</span>
              </div>

              <div className="update-form argos-fleet-daily-summary">
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
            <section className="update-panel vehicle-record-panel">
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
                handleNewAssetDepartmentChange,
                handleNewAssetTypeChange,
                handleNewAssetStatusChange,
                handleNewAssetRTSTypeChange,
                handleNewAssetTechnicianChange
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
            <section className="update-panel vehicle-record-panel">
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
                    setFieldScanContext(null);
                  }}
                  type="button"
                >
                  ×
                </button>
              </div>

              {fieldScanContext?.type === "matched" && fieldScanContext.unit === editAsset.unit && (
                <section className="argos-field-scan-result" aria-label="VIN match result">
                  <div>
                    <p className="eyebrow">VIN Match Confirmed</p>
                    <h4>Unit {editAsset.unit} is ready for field action</h4>
                    <span>{fieldScanContext.vin}</span>
                  </div>
                  <strong>{editAsset.status}</strong>
                </section>
              )}

              <section className="argos-field-quick-status" aria-label="Quick vehicle status update">
                <div>
                  <p className="eyebrow">Field Quick Update</p>
                  <h4>Set current operational status</h4>
                </div>
                <div className="argos-field-status-buttons">
                  {statusOptions.map((status) => (
                    <button
                      type="button"
                      key={status}
                      className={editAsset.status === status ? "active" : ""}
                      onClick={() => setEditAsset((currentAsset) => applyStatusChange(currentAsset, status))}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </section>

              <button
                className="argos-field-details-toggle"
                type="button"
                onClick={() => setShowFieldVehicleDetails((currentValue) => !currentValue)}
                aria-expanded={showFieldVehicleDetails}
              >
                <span>
                  <strong>{showFieldVehicleDetails ? "Hide Full Vehicle Details" : "More Vehicle Details"}</strong>
                  <small>
                    {showFieldVehicleDetails
                      ? "Return to the compact status workflow"
                      : "Mileage, technician, repair, warranty, and asset information"}
                  </small>
                </span>
                <b aria-hidden="true">{showFieldVehicleDetails ? "−" : "+"}</b>
              </button>

              <div className={`argos-field-full-form${showFieldVehicleDetails ? " is-open" : ""}`}>
                {renderAssetForm(
                  editAsset,
                  handleChange,
                  handleDepartmentChange,
                  handleAssetTypeChange,
                  handleStatusChange,
                  handleRTSTypeChange,
                  handleTechnicianChange
                )}
              </div>

              <div className="update-actions argos-field-update-actions">
                <button
                  className="cancel-button"
                  onClick={() => {
                    setEditAsset(null);
                    setSelectedAsset(null);
                    setFieldScanContext(null);
                  }}
                  type="button"
                >
                  Cancel
                </button>

                {fieldScanContext?.type === "matched" && (
                  <button
                    className="cancel-button argos-save-scan-next-button"
                    onClick={handleSaveAndScanNext}
                    type="button"
                  >
                    Save & Scan Next
                  </button>
                )}

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