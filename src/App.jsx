import { useEffect, useRef, useState } from "react";
import "./App.css";

const STORAGE_KEY = "argosFleetAssets";
const COMPLETED_STORAGE_KEY = "argosCompletedRepairEvents";
const STATUS_HISTORY_STORAGE_KEY = "argosStatusHistoryEvents";

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

function calculateStatusDurationDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay));
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

function loadSavedAssets() {
  const savedAssets = localStorage.getItem(STORAGE_KEY);
  if (!savedAssets) return initialAssets;

  try {
    return JSON.parse(savedAssets).map(normalizeAsset);
  } catch {
    return initialAssets;
  }
}

function loadCompletedRepairEvents() {
  const savedEvents = localStorage.getItem(COMPLETED_STORAGE_KEY);
  if (!savedEvents) return [];

  try {
    return JSON.parse(savedEvents).map(normalizeCompletedRepairEvent);
  } catch {
    return [];
  }
}

function loadStatusHistoryEvents() {
  const savedEvents = localStorage.getItem(STATUS_HISTORY_STORAGE_KEY);
  if (!savedEvents) return [];

  try {
    return JSON.parse(savedEvents);
  } catch {
    return [];
  }
}

function createStatusHistoryEvent(previousAsset, updatedAsset) {
  const statusEndedAt = getTodayDateString();
  const statusStartedAt = previousAsset.statusStartedAt || previousAsset.downSince || getTodayDateString();

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
    recordedAt: new Date().toISOString(),
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
          ? (totalCompletedDuration / completedRepairs.length).toFixed(1)
          : "0.0",
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
        completedStatusEvents > 0 ? (totalDuration / completedStatusEvents).toFixed(1) : "0.0",
      longestDuration,
      totalDuration,
      percentageOfRecordedDowntime:
        totalRecordedDuration > 0 ? ((totalDuration / totalRecordedDuration) * 100).toFixed(1) : "0.0",
    };
  });

  const trackedStatusTransitions = normalizedHistoryEvents.length;
  const averageRecordedStatusDuration =
    trackedStatusTransitions > 0
      ? (totalRecordedDuration / trackedStatusTransitions).toFixed(1)
      : "0.0";
  const longestRecordedStatusDuration =
    normalizedHistoryEvents.length > 0
      ? Math.max(...normalizedHistoryEvents.map((event) => event.durationDays))
      : 0;
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
  const [assets, setAssets] = useState(loadSavedAssets);
  const [completedRepairEvents, setCompletedRepairEvents] = useState(loadCompletedRepairEvents);
  const [statusHistoryEvents, setStatusHistoryEvents] = useState(loadStatusHistoryEvents);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [editAsset, setEditAsset] = useState(null);
  const [newAsset, setNewAsset] = useState(null);
  const [showDailySummary, setShowDailySummary] = useState(false);
  const [activeView, setActiveView] = useState("command");
  const [importStatus, setImportStatus] = useState("");
  const csvInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(completedRepairEvents));
  }, [completedRepairEvents]);

  useEffect(() => {
    localStorage.setItem(STATUS_HISTORY_STORAGE_KEY, JSON.stringify(statusHistoryEvents));
  }, [statusHistoryEvents]);

  const activeBoardAssets = assets.filter((asset) => asset.status !== "Ready");
  const readyArchiveAssets = assets.filter((asset) => asset.status === "Ready");

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
    const isReadyStatus = assetToClean.status === "Ready";

    return {
      ...assetToClean,
      unit: assetToClean.unit.trim(),
      vin: assetToClean.vin.trim().toUpperCase(),
      department: assetToClean.department.trim(),
      asset: assetToClean.asset.trim(),
      technician:
        assetToClean.technician && assetToClean.technician.trim() && assetToClean.technician !== "—"
          ? assetToClean.technician.trim()
          : "Unassigned",
      reason: isReadyStatus ? "Available" : assetToClean.reason || "Other",
      priority: isReadyStatus ? assetToClean.priority || "Normal" : assetToClean.priority,
      downSince: isReadyStatus ? "" : assetToClean.downSince || getTodayDateString(),
      rtsType: isReadyStatus ? "No RTS Established" : assetToClean.rtsType,
      rtsDate: isReadyStatus ? "" : assetToClean.rtsDate,
      details: assetToClean.details.trim() || (isReadyStatus ? "Available" : "Details pending"),
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

  function handleSave() {
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

      setStatusHistoryEvents((currentEvents) => [
        createStatusHistoryEvent(selectedAsset, returnedAsset),
        ...currentEvents,
      ]);
      setCompletedRepairEvents((currentEvents) => [completedEvent, ...currentEvents]);
      setAssets((currentAssets) =>
        currentAssets.map((asset) => (asset.unit === originalUnit ? returnedAsset : asset))
      );

      setSelectedAsset(null);
      setEditAsset(null);
      setActiveView("history");
      return;
    }

    if (statusChanged) {
      setStatusHistoryEvents((currentEvents) => [
        createStatusHistoryEvent(selectedAsset, updatedAsset),
        ...currentEvents,
      ]);
    }

    setAssets((currentAssets) =>
      currentAssets.map((asset) => (asset.unit === originalUnit ? updatedAsset : asset))
    );

    setSelectedAsset(updatedAsset);
    setEditAsset(null);
    setActiveView(updatedAsset.status === "Ready" ? "history" : "command");
  }

  function handleSaveNewAsset() {
    const cleanedAsset = cleanAsset({
      ...newAsset,
      statusStartedAt: newAsset.statusStartedAt || getTodayDateString(),
    });

    if (!validateAsset(cleanedAsset)) return;

    setAssets((currentAssets) => [...currentAssets, cleanedAsset]);
    setSelectedAsset(cleanedAsset);
    setNewAsset(null);
    setActiveView(cleanedAsset.status === "Ready" ? "history" : "command");
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

    reader.onload = (readerEvent) => {
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

      if (validImportedAssets.length > 0) {
        setAssets((currentAssets) => [...currentAssets, ...validImportedAssets]);
        setActiveView("command");
      }

      if (validImportedAssets.length === 0 && rejectedRows.length === 0) {
        setImportStatus("No asset rows were found in that CSV file.");
      } else if (rejectedRows.length > 0) {
        setImportStatus(
          `Imported ${validImportedAssets.length} asset${validImportedAssets.length === 1 ? "" : "s"}. Rejected ${rejectedRows.length} row${rejectedRows.length === 1 ? "" : "s"}: ${rejectedRows.join(" | ")}`
        );
      } else {
        setImportStatus(
          `Imported ${validImportedAssets.length} asset${validImportedAssets.length === 1 ? "" : "s"} successfully.`
        );
      }
    };

    reader.onerror = () => {
      setImportStatus("ARGOS could not read that CSV file. Please try again.");
    };

    reader.readAsText(file);
    event.target.value = "";
  }

  function handleExportView() {
    if (assets.length === 0) {
      setImportStatus("There are no assets to export.");
      return;
    }

    const exportAssets = assets.map((asset) => ({
      ...asset,
      technician:
        !asset.technician || asset.technician === "—" || asset.technician === "‚Äî"
          ? "Unassigned"
          : asset.technician,
    }));

    const csvContent = [
      CSV_COLUMNS.join(","),
      ...exportAssets.map((asset) =>
        CSV_COLUMNS.map((column) => escapeCSVValue(asset[column])).join(",")
      ),
    ].join("\n");

    downloadFile(
      `argos-fleet-export-${getTodayDateString()}.csv`,
      `\uFEFF${csvContent}`,
      "text/csv;charset=utf-8"
    );

    setImportStatus(`Exported ${assets.length} asset${assets.length === 1 ? "" : "s"} successfully.`);
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

          <button className="nav-item" type="button" onClick={() => setShowDailySummary(true)}>
            ✦ <span>Daily Summary</span>
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
          <a className="nav-item">♢ <span>Alerts</span></a>
          <button
            className={`nav-item ${activeView === "reports" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("reports")}
          >
            ▥ <span>Reports</span>
          </button>
          <a className="nav-item">⚙ <span>Settings</span></a>
        </nav>

        <div className="sidebar-footer">
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
                <span>Active Exceptions</span>
                <strong>{activeBoardAssets.length}</strong>
              </div>
            </header>

            <section className="metrics-row">
              <div className="availability-card">
                <span>Current Fleet Availability</span>
                <strong>{availability}%</strong>
                <p>
                  {readyAssets} Ready · {unavailableAssets} Active Exceptions · {totalAssets} Total Active Fleet Assets
                </p>
              </div>

              <div className="metric-card"><span>Total Assets</span><strong>{totalAssets}</strong></div>
              <div className="metric-card"><span>Active Exceptions</span><strong>{unavailableAssets}</strong></div>
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
                  <button type="button" onClick={handleExportView}>Export View</button>
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