import "./App.css";

const assets = [
  { unit: "1042", department: "Public Works", asset: "Ford F-250", status: "Waiting Parts", priority: "High", daysDown: 6, technician: "Smith", rts: "Jul 10", issue: "Alternator on order" },
  { unit: "2217", department: "Police", asset: "Ford Explorer", status: "In Shop", priority: "Medium", daysDown: 2, technician: "Jones", rts: "Jul 8", issue: "Brake inspection" },
  { unit: "3314", department: "Fire", asset: "Chevrolet Tahoe", status: "Ready", priority: "Normal", daysDown: 0, technician: "—", rts: "—", issue: "Available" },
  { unit: "5088", department: "Solid Waste", asset: "Freightliner M2", status: "Down", priority: "Critical", daysDown: 11, technician: "Garcia", rts: "TBD", issue: "Hydraulic leak" },
  { unit: "6120", department: "Parks", asset: "John Deere Tractor", status: "PM Due", priority: "Normal", daysDown: 0, technician: "—", rts: "—", issue: "250-hour service due" },
  { unit: "7741", department: "Utilities", asset: "RAM 3500 Service Truck", status: "Ready", priority: "Normal", daysDown: 0, technician: "—", rts: "—", issue: "Available" },
];

function getStatusClass(status) {
  return status.toLowerCase().replaceAll(" ", "-");
}

function App() {
  const totalAssets = assets.length;
  const readyAssets = assets.filter((asset) => asset.status === "Ready").length;
  const unavailableAssets = totalAssets - readyAssets;
  const waitingParts = assets.filter((asset) => asset.status === "Waiting Parts").length;
  const criticalAssets = assets.filter((asset) => asset.priority === "Critical").length;
  const availability = ((readyAssets / totalAssets) * 100).toFixed(1);

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

          <div className="metric-card">
            <span>Total Assets</span>
            <strong>{totalAssets}</strong>
          </div>

          <div className="metric-card">
            <span>Unavailable</span>
            <strong>{unavailableAssets}</strong>
          </div>

          <div className="metric-card">
            <span>Waiting Parts</span>
            <strong>{waitingParts}</strong>
          </div>

          <div className="metric-card critical">
            <span>Critical</span>
            <strong>{criticalAssets}</strong>
          </div>
        </section>

        <section className="status-board">
          <div className="status-board-header">
            <div>
              <p className="eyebrow">✦ Live Status Board</p>
              <h3>Assets Requiring Visibility</h3>
            </div>
            <button>Export View</button>
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
                <tr key={asset.unit}>
                  <td className="unit">{asset.unit}</td>
                  <td>{asset.department}</td>
                  <td>{asset.asset}</td>
                  <td>
                    <span className={`status-pill ${getStatusClass(asset.status)}`}>
                      {asset.status}
                    </span>
                  </td>
                  <td className={asset.priority.toLowerCase()}>{asset.priority}</td>
                  <td>{asset.daysDown}</td>
                  <td>{asset.technician}</td>
                  <td>{asset.rts}</td>
                  <td>{asset.issue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </main>
  );
}

export default App;