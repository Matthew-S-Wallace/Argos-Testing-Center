import { useState } from "react";
import "./App.css";

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const initialAssets = [
  { unit: "1042", department: "Public Works", asset: "Ford F-250", status: "Waiting Parts", priority: "High", downSince: "2026-07-01", technician: "Smith", rtsType: "Estimated Date", rtsDate: "2026-07-10", issue: "Alternator on order" },
  { unit: "2217", department: "Police", asset: "Ford Explorer", status: "In Shop", priority: "Medium", downSince: "2026-07-05", technician: "Jones", rtsType: "Estimated Date", rtsDate: "2026-07-08", issue: "Brake inspection" },
  { unit: "3314", department: "Fire", asset: "Chevrolet Tahoe", status: "Ready", priority: "Normal", downSince: "", technician: "—", rtsType: "No RTS Established", rtsDate: "", issue: "Available" },
  { unit: "5088", department: "Solid Waste", asset: "Freightliner M2", status: "Down", priority: "Critical", downSince: "2026-06-26", technician: "Garcia", rtsType: "TBD", rtsDate: "", issue: "Hydraulic leak" },
  { unit: "6120", department: "Parks", asset: "John Deere Tractor", status: "PM Due", priority: "Normal", downSince: "2026-07-07", technician: "—", rtsType: "No RTS Established", rtsDate: "", issue: "250-hour service due" },
  { unit: "7741", department: "Utilities", asset: "RAM 3500 Service Truck", status: "Ready", priority: "Normal", downSince: "", technician: "—", rtsType: "No RTS Established", rtsDate: "", issue: "Available" },
];

function getStatusClass(status) {
  return status.toLowerCase().replaceAll(" ", "-");
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

function App() {
  const [assets, setAssets] = useState(initialAssets);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [editAsset, setEditAsset] = useState(null);

  const totalAssets = assets.length;
  const readyAssets = assets.filter((asset) => asset.status === "Ready").length;
  const unavailableAssets = totalAssets - readyAssets;
  const waitingParts = assets.filter((asset) => asset.status === "Waiting Parts").length;
  const criticalAssets = assets.filter((asset) => asset.priority === "Critical").length;
  const availability = totalAssets > 0 ? ((readyAssets / totalAssets) * 100).toFixed(1) : "0.0";

  function handleSelectAsset(asset) {
    setSelectedAsset(asset);
    setEditAsset({ ...asset });
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

      return {
        ...currentAsset,
        status: newStatus,
        downSince: isNowReady
          ? ""
          : wasReady && !currentAsset.downSince
            ? getTodayDateString()
            : currentAsset.downSince,
        rtsType: isNowReady ? "No RTS Established" : currentAsset.rtsType,
        rtsDate: isNowReady ? "" : currentAsset.rtsDate,
        issue: isNowReady ? "Available" : currentAsset.issue,
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
    const updatedAsset = { ...editAsset };

    setAssets((currentAssets) =>
      currentAssets.map((asset) =>
        asset.unit === updatedAsset.unit ? updatedAsset : asset
      )
    );

    setSelectedAsset(updatedAsset);
    setEditAsset(null);
  }

  function handleCancel() {
    setEditAsset(null);
    setSelectedAsset(null);
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
          <a className="nav-item active">⌂ <span>Command Center</span></a>
          <a className="nav-item">▣ <span>Asset Status</span></a>
          <a className="nav-item">⚒ <span>Work Orders</span></a>
          <a className="nav-item">👥 <span>Technicians</span></a>
          <a className="nav-item">□ <span>Parts & Inventory</span></a>
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

            <button type="button">Export View</button>
          </div>

          <table>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Department</th>
                <th>Asset</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Days Down</th>
                <th>Technician</th>
                <th>RTS</th>
                <th>Issue</th>
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
                  <td className={asset.priority.toLowerCase()}>{asset.priority}</td>
                  <td>{calculateDaysDown(asset.downSince, asset.status)}</td>
                  <td>{asset.technician}</td>
                  <td>{formatRTS(asset)}</td>
                  <td>{asset.issue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

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
                  Status
                  <select name="status" value={editAsset.status} onChange={handleStatusChange}>
                    <option>Ready</option>
                    <option>In Shop</option>
                    <option>Waiting Parts</option>
                    <option>Down</option>
                    <option>PM Due</option>
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

                {editAsset.status !== "Ready" && (
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

                {editAsset.status !== "Ready" && (
                  <label>
                    RTS Status
                    <select name="rtsType" value={editAsset.rtsType} onChange={handleRTSTypeChange}>
                      <option>Estimated Date</option>
                      <option>TBD</option>
                      <option>No RTS Established</option>
                    </select>
                  </label>
                )}

                {editAsset.status !== "Ready" && editAsset.rtsType === "Estimated Date" && (
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
                  Operational Status / Reason
                  <textarea
                    name="issue"
                    value={editAsset.issue}
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