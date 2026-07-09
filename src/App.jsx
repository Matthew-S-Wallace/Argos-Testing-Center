import { useEffect, useState } from "react";
import "./App.css";

const STORAGE_KEY = "argosFleetAssets";
const COMPLETED_STORAGE_KEY = "argosCompletedRepairEvents";

const STATUS_OPTIONS = [
  "Ready",
  "Down",
  "In Shop",
  "At 3rd Party Shop",
  "Waiting Parts",
  "Awaiting Approval",
  "Awaiting QC",
  "Ready for Pickup",
  "Completed",
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

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
    technician: "—",
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
    technician: "—",
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
    technician: "—",
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
    technician: "—",
    rtsType: "No RTS Established",
    rtsDate: "",
    details: "Available",
  };
}

function normalizeAsset(asset) {
  return {
    vin: "",
    reason: asset.reason || asset.issue || "Available",
    details: asset.details || asset.issue || "Available",
    statusStartedAt: asset.statusStartedAt || asset.downSince || getTodayDateString(),
    ...asset,
    reason: asset.reason || asset.issue || "Available",
    details: asset.details || asset.issue || "Available",
    statusStartedAt: asset.statusStartedAt || asset.downSince || getTodayDateString(),
  };
}

function loadSavedAssets() {
  const savedAssets = localStorage.getItem(STORAGE_KEY);

  if (!savedAssets) {
    return initialAssets;
  }

  try {
    return JSON.parse(savedAssets).map(normalizeAsset);
  } catch {
    return initialAssets;
  }
}

function loadCompletedRepairEvents() {
  const savedEvents = localStorage.getItem(COMPLETED_STORAGE_KEY);

  if (!savedEvents) {
    return [];
  }

  try {
    return JSON.parse(savedEvents).map(normalizeAsset);
  } catch {
    return [];
  }
}

function getStatusClass(status) {
  return status.toLowerCase().replaceAll(" ", "-").replaceAll("/", "");
}

function isUnavailable(status) {
  return status !== "Ready";
}

function calculateDaysDown(downSince, status) {
  if (!isUnavailable(status) || !downSince) {
    return 0;
  }

  const downDate = new Date(`${downSince}T00:00:00`);
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const difference = today.getTime() - downDate.getTime();

  return Math.max(0, Math.floor(difference / millisecondsPerDay));
}

function calculateFinalDaysDown(downSince) {
  if (!downSince) {
    return 0;
  }

  const downDate = new Date(`${downSince}T00:00:00`);
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const difference = today.getTime() - downDate.getTime();

  return Math.max(0, Math.floor(difference / millisecondsPerDay));
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

function getAssetsWithDaysDown(assets) {
  return assets.map((asset) => ({
    ...asset,
    daysDown: calculateDaysDown(asset.downSince, asset.status),
  }));
}

function buildDailySummary(assets) {
  const assetsWithDaysDown = getAssetsWithDaysDown(assets);
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

  const departmentWatch = Object.entries(departmentCounts)
    .map(([department, count]) => `${department}: ${count}`)
    .join(" | ");

  const availability =
    totalAssets > 0 ? ((readyAssets.length / totalAssets) * 100).toFixed(1) : "0.0";

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
    departmentWatch,
    availability,
    agingThreshold,
  };
}

function App() {
  const [assets, setAssets] = useState(loadSavedAssets);
  const [completedRepairEvents, setCompletedRepairEvents] = useState(loadCompletedRepairEvents);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [editAsset, setEditAsset] = useState(null);
  const [newAsset, setNewAsset] = useState(null);
  const [showDailySummary, setShowDailySummary] = useState(false);
  const [activeView, setActiveView] = useState("command");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(completedRepairEvents));
  }, [completedRepairEvents]);

  const totalAssets = assets.length;
  const readyAssets = assets.filter((asset) => asset.status === "Ready").length;
  const unavailableAssets = totalAssets - readyAssets;
  const waitingParts = assets.filter((asset) => asset.status === "Waiting Parts").length;
  const criticalAssets = assets.filter((asset) => asset.priority === "Critical").length;
  const availability = totalAssets > 0 ? ((readyAssets / totalAssets) * 100).toFixed(1) : "0.0";
  const dailySummary = buildDailySummary(assets);

  function handleSelectAsset(asset) {
    setSelectedAsset(asset);
    setEditAsset(normalizeAsset(asset));
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setEditAsset((currentAsset) => ({
      ...currentAsset,
      [name]: value,
    }));
  }

  function handleStatusChange(event) {
    const newStatus = event.target.value;

    setEditAsset((currentAsset) => {
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
            : currentAsset.downSince,
        rtsType: isNowReady ? "No RTS Established" : currentAsset.rtsType,
        rtsDate: isNowReady ? "" : currentAsset.rtsDate,
        details: isNowReady ? "Available" : currentAsset.details,
      };
    });
  }

  function handleRTSTypeChange(event) {
    const newRTSType = event.target.value;

    setEditAsset((currentAsset) => ({
      ...currentAsset,
      rtsType: newRTSType,
      rtsDate: newRTSType === "Estimated Date" ? currentAsset.rtsDate : "",
    }));
  }

  function handleSave() {
    const originalUnit = selectedAsset.unit;
    const originalVin = selectedAsset.vin || "";
    const statusChanged = selectedAsset.status !== editAsset.status;

    const updatedAsset = {
      ...editAsset,
      unit: editAsset.unit.trim(),
      vin: editAsset.vin.trim().toUpperCase(),
      department: editAsset.department.trim(),
      asset: editAsset.asset.trim(),
      technician: editAsset.technician.trim() || "—",
      statusStartedAt: statusChanged ? getTodayDateString() : editAsset.statusStartedAt,
      reason: editAsset.reason || (editAsset.status === "Ready" ? "Available" : "Other"),
      details: editAsset.details.trim() || (editAsset.status === "Ready" ? "Available" : "Details pending"),
    };

    if (!updatedAsset.unit || !updatedAsset.department || !updatedAsset.asset) {
      alert("Unit, Department, and Asset are required.");
      return;
    }

    const unitAlreadyExists = assets.some(
      (asset) =>
        asset.unit.toLowerCase() !== originalUnit.toLowerCase() &&
        asset.unit.toLowerCase() === updatedAsset.unit.toLowerCase()
    );

    if (unitAlreadyExists) {
      alert("That unit number already exists in ARGOS.");
      return;
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
      return;
    }

    const isCompletingRepairEvent =
      selectedAsset.status !== "Ready" &&
      (updatedAsset.status === "Ready" || updatedAsset.status === "Completed");

    if (isCompletingRepairEvent) {
      const shouldComplete = window.confirm(
        `Complete the active repair event for Unit ${selectedAsset.unit}? This will copy the event to Repair History and return the asset to Ready in the Command Center.`
      );

      if (!shouldComplete) {
        return;
      }

      const completedEvent = {
        ...selectedAsset,
        vin: updatedAsset.vin,
        reason: updatedAsset.reason,
        details: updatedAsset.details,
        statusStartedAt: selectedAsset.statusStartedAt || selectedAsset.downSince || getTodayDateString(),
        statusEndedAt: getTodayDateString(),
        id: `${selectedAsset.unit}-${Date.now()}`,
        completedDate: getTodayDateString(),
        finalDaysDown: calculateFinalDaysDown(selectedAsset.downSince),
        finalStatus: "Ready",
        completionNote: "Returned to service",
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

      setCompletedRepairEvents((currentEvents) => [completedEvent, ...currentEvents]);

      setAssets((currentAssets) =>
        currentAssets.map((asset) =>
          asset.unit === originalUnit ? returnedAsset : asset
        )
      );

      setSelectedAsset(returnedAsset);
      setEditAsset(null);
      return;
    }

    setAssets((currentAssets) =>
      currentAssets.map((asset) =>
        asset.unit === originalUnit ? updatedAsset : asset
      )
    );

    setSelectedAsset(updatedAsset);
    setEditAsset(null);
  }

  function handleCancel() {
    setEditAsset(null);
    setSelectedAsset(null);
  }

  function handleOpenAddAsset() {
    setSelectedAsset(null);
    setEditAsset(null);
    setNewAsset(createBlankAsset());
    setActiveView("command");
  }

  function handleNewAssetChange(event) {
    const { name, value } = event.target;

    setNewAsset((currentAsset) => ({
      ...currentAsset,
      [name]: value,
    }));
  }

  function handleNewAssetStatusChange(event) {
    const newStatus = event.target.value;

    setNewAsset((currentAsset) => {
      const isNowReady = newStatus === "Ready";
      const statusChanged = currentAsset.status !== newStatus;

      return {
        ...currentAsset,
        status: newStatus,
        statusStartedAt: statusChanged ? getTodayDateString() : currentAsset.statusStartedAt,
        reason: isNowReady ? "Available" : currentAsset.reason === "Available" ? "Other" : currentAsset.reason,
        downSince: isNowReady ? "" : currentAsset.downSince || getTodayDateString(),
        rtsType: isNowReady ? "No RTS Established" : currentAsset.rtsType,
        rtsDate: isNowReady ? "" : currentAsset.rtsDate,
        details: isNowReady ? "Available" : currentAsset.details === "Available" ? "" : currentAsset.details,
      };
    });
  }

  function handleNewAssetRTSTypeChange(event) {
    const newRTSType = event.target.value;

    setNewAsset((currentAsset) => ({
      ...currentAsset,
      rtsType: newRTSType,
      rtsDate: newRTSType === "Estimated Date" ? currentAsset.rtsDate : "",
    }));
  }

  function handleSaveNewAsset() {
    const cleanedAsset = {
      ...newAsset,
      unit: newAsset.unit.trim(),
      vin: newAsset.vin.trim().toUpperCase(),
      department: newAsset.department.trim(),
      asset: newAsset.asset.trim(),
      technician: newAsset.technician.trim() || "—",
      statusStartedAt: newAsset.statusStartedAt || getTodayDateString(),
      reason: newAsset.reason || (newAsset.status === "Ready" ? "Available" : "Other"),
      details: newAsset.details.trim() || (newAsset.status === "Ready" ? "Available" : "Details pending"),
    };

    if (!cleanedAsset.unit || !cleanedAsset.department || !cleanedAsset.asset) {
      alert("Unit, Department, and Asset are required.");
      return;
    }

    const unitAlreadyExists = assets.some(
      (asset) => asset.unit.toLowerCase() === cleanedAsset.unit.toLowerCase()
    );

    if (unitAlreadyExists) {
      alert("That unit number already exists in ARGOS.");
      return;
    }

    const vinAlreadyExists =
      cleanedAsset.vin &&
      assets.some(
        (asset) => (asset.vin || "").toLowerCase() === cleanedAsset.vin.toLowerCase()
      );

    if (vinAlreadyExists) {
      alert("That VIN already exists in ARGOS.");
      return;
    }

    const finalizedAsset = {
      ...cleanedAsset,
      status: cleanedAsset.status === "Completed" ? "Ready" : cleanedAsset.status,
      statusStartedAt: cleanedAsset.statusStartedAt || getTodayDateString(),
      reason:
        cleanedAsset.status === "Ready" || cleanedAsset.status === "Completed"
          ? "Available"
          : cleanedAsset.reason,
      downSince:
        cleanedAsset.status === "Ready" || cleanedAsset.status === "Completed"
          ? ""
          : cleanedAsset.downSince || getTodayDateString(),
      rtsType:
        cleanedAsset.status === "Ready" || cleanedAsset.status === "Completed"
          ? "No RTS Established"
          : cleanedAsset.rtsType,
      rtsDate:
        cleanedAsset.status !== "Ready" &&
        cleanedAsset.status !== "Completed" &&
        cleanedAsset.rtsType === "Estimated Date"
          ? cleanedAsset.rtsDate
          : "",
      details:
        cleanedAsset.status === "Ready" || cleanedAsset.status === "Completed"
          ? "Available"
          : cleanedAsset.details,
    };

    setAssets((currentAssets) => [...currentAssets, finalizedAsset]);
    setSelectedAsset(finalizedAsset);
    setNewAsset(null);
    setActiveView("command");
  }

  function handleCancelNewAsset() {
    setNewAsset(null);
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

          <a className="nav-item">👥 <span>Technicians</span></a>
          <a className="nav-item">♢ <span>Alerts</span></a>
          <a className="nav-item">▥ <span>Reports</span></a>
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
                <h2>Fleet Availability Dashboard</h2>
              </div>

              <div className="refresh-box">
                <span>Last Refresh</span>
                <strong>Today · 08:42</strong>
              </div>
            </header>

            <section className="metrics-row">
              <div className="availability-card">
                <span>Fleet Availability</span>
                <strong>{availability}%</strong>
                <p>{readyAssets} of {totalAssets} assets ready for service</p>
              </div>

              <div className="metric-card"><span>Total Assets</span><strong>{totalAssets}</strong></div>
              <div className="metric-card"><span>Unavailable</span><strong>{unavailableAssets}</strong></div>
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
                  <button type="button" onClick={handleOpenAddAsset}>Add Asset</button>{" "}
                  <button type="button">Export View</button>
                </div>
              </div>

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
                  {assets.map((asset) => (
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
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

        {activeView === "history" && (
          <>
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">Repair History</p>
                <h2>Completed Repair Events</h2>
              </div>

              <div className="refresh-box">
                <span>Completed Events</span>
                <strong>{completedRepairEvents.length}</strong>
              </div>
            </header>

            <section className="status-board">
              <div className="status-board-header">
                <div>
                  <p className="eyebrow">⚒ Completed Work</p>
                  <h3>Completed Service Records</h3>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Department</th>
                    <th>Asset</th>
                    <th>Prior Status</th>
                    <th>Reason</th>
                    <th>Priority</th>
                    <th>Days Down</th>
                    <th>Technician</th>
                    <th>Completed</th>
                    <th>Details</th>
                  </tr>
                </thead>

                <tbody>
                  {completedRepairEvents.length === 0 ? (
                    <tr>
                      <td colSpan="10">
                        No completed repair events have been moved to Repair History yet.
                      </td>
                    </tr>
                  ) : (
                    completedRepairEvents.map((event) => (
                      <tr key={event.id}>
                        <td className="unit">{event.unit}</td>
                        <td>{event.department}</td>
                        <td>{event.asset}</td>
                        <td>
                          <span className={`status-pill ${getStatusClass(event.status)}`}>
                            {event.status}
                          </span>
                        </td>
                        <td>{event.reason}</td>
                        <td className={event.priority.toLowerCase()}>{event.priority}</td>
                        <td>{event.finalDaysDown}</td>
                        <td>{event.technician}</td>
                        <td>{formatDate(event.completedDate)}</td>
                        <td>{event.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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

                <button
                  className="close-button"
                  onClick={() => setShowDailySummary(false)}
                  type="button"
                >
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
                  <p className="update-asset-name">
                    Create a new tracked fleet asset in ARGOS
                  </p>
                </div>

                <button className="close-button" onClick={handleCancelNewAsset} type="button">
                  ×
                </button>
              </div>

              <div className="update-form">
                <label>
                  Unit
                  <input
                    type="text"
                    name="unit"
                    value={newAsset.unit}
                    onChange={handleNewAssetChange}
                    placeholder="Example: 9001"
                  />
                </label>

                <label>
                  VIN
                  <input
                    type="text"
                    name="vin"
                    value={newAsset.vin}
                    onChange={handleNewAssetChange}
                    placeholder="Optional"
                  />
                </label>

                <label>
                  Department
                  <input
                    type="text"
                    name="department"
                    value={newAsset.department}
                    onChange={handleNewAssetChange}
                    placeholder="Example: Public Works"
                  />
                </label>

                <label>
                  Asset
                  <input
                    type="text"
                    name="asset"
                    value={newAsset.asset}
                    onChange={handleNewAssetChange}
                    placeholder="Example: Ford F-150"
                  />
                </label>

                <label>
                  Status
                  <select name="status" value={newAsset.status} onChange={handleNewAssetStatusChange}>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Reason
                  <select name="reason" value={newAsset.reason} onChange={handleNewAssetChange}>
                    {REASON_OPTIONS.map((reason) => (
                      <option key={reason}>{reason}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Priority
                  <select name="priority" value={newAsset.priority} onChange={handleNewAssetChange}>
                    <option>Normal</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Critical</option>
                  </select>
                </label>

                {newAsset.status !== "Ready" && newAsset.status !== "Completed" && (
                  <label>
                    Down Since
                    <input
                      type="date"
                      name="downSince"
                      value={newAsset.downSince}
                      onChange={handleNewAssetChange}
                    />
                  </label>
                )}

                <label>
                  Technician / Responsible Party
                  <input
                    type="text"
                    name="technician"
                    value={newAsset.technician}
                    onChange={handleNewAssetChange}
                  />
                </label>

                {newAsset.status !== "Ready" && newAsset.status !== "Completed" && (
                  <label>
                    RTS Status
                    <select
                      name="rtsType"
                      value={newAsset.rtsType}
                      onChange={handleNewAssetRTSTypeChange}
                    >
                      <option>Estimated Date</option>
                      <option>TBD</option>
                      <option>No RTS Established</option>
                    </select>
                  </label>
                )}

                {newAsset.status !== "Ready" && newAsset.status !== "Completed" && newAsset.rtsType === "Estimated Date" && (
                  <label>
                    Estimated Return to Service
                    <input
                      type="date"
                      name="rtsDate"
                      value={newAsset.rtsDate}
                      onChange={handleNewAssetChange}
                    />
                  </label>
                )}

                <label className="issue-field">
                  Details / Notes
                  <textarea
                    name="details"
                    value={newAsset.details}
                    onChange={handleNewAssetChange}
                    rows="4"
                  />
                </label>
              </div>

              <div className="update-actions">
                <button className="cancel-button" onClick={handleCancelNewAsset} type="button">
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

                <button className="close-button" onClick={handleCancel} type="button">
                  ×
                </button>
              </div>

              <div className="update-form">
                <label>
                  Unit
                  <input
                    type="text"
                    name="unit"
                    value={editAsset.unit}
                    onChange={handleChange}
                  />
                </label>

                <label>
                  VIN
                  <input
                    type="text"
                    name="vin"
                    value={editAsset.vin}
                    onChange={handleChange}
                    placeholder="Optional"
                  />
                </label>

                <label>
                  Department
                  <input
                    type="text"
                    name="department"
                    value={editAsset.department}
                    onChange={handleChange}
                  />
                </label>

                <label>
                  Asset
                  <input
                    type="text"
                    name="asset"
                    value={editAsset.asset}
                    onChange={handleChange}
                  />
                </label>

                <label>
                  Status
                  <select name="status" value={editAsset.status} onChange={handleStatusChange}>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Reason
                  <select name="reason" value={editAsset.reason} onChange={handleChange}>
                    {REASON_OPTIONS.map((reason) => (
                      <option key={reason}>{reason}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Priority
                  <select name="priority" value={editAsset.priority} onChange={handleChange}>
                    <option>Normal</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Critical</option>
                  </select>
                </label>

                {editAsset.status !== "Ready" && editAsset.status !== "Completed" && (
                  <label>
                    Down Since
                    <input
                      type="date"
                      name="downSince"
                      value={editAsset.downSince}
                      onChange={handleChange}
                    />
                  </label>
                )}

                <label>
                  Technician / Responsible Party
                  <input
                    type="text"
                    name="technician"
                    value={editAsset.technician}
                    onChange={handleChange}
                  />
                </label>

                {editAsset.status !== "Ready" && editAsset.status !== "Completed" && (
                  <label>
                    RTS Status
                    <select name="rtsType" value={editAsset.rtsType} onChange={handleRTSTypeChange}>
                      <option>Estimated Date</option>
                      <option>TBD</option>
                      <option>No RTS Established</option>
                    </select>
                  </label>
                )}

                {editAsset.status !== "Ready" && editAsset.status !== "Completed" && editAsset.rtsType === "Estimated Date" && (
                  <label>
                    Estimated Return to Service
                    <input
                      type="date"
                      name="rtsDate"
                      value={editAsset.rtsDate}
                      onChange={handleChange}
                    />
                  </label>
                )}

                <label className="issue-field">
                  Details / Notes
                  <textarea
                    name="details"
                    value={editAsset.details}
                    onChange={handleChange}
                    rows="4"
                  />
                </label>
              </div>

              <div className="update-actions">
                <button className="cancel-button" onClick={handleCancel} type="button">
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