import { useMemo, useState } from "react";
import "./ARGOS_Reports_Module_001Z3.css";

function normalizeText(value) {
  return String(value || "").trim();
}

function getStatusClass(status) {
  return normalizeText(status).toLowerCase().replaceAll(" ", "-").replaceAll("/", "");
}

function parseRepairDate(record) {
  const value = record.completedDisplayDate || record.completedDate || record.repairCompletedAt;
  if (!value) return null;
  const date = new Date(String(value).includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateInput(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function downloadCSV(filename, columns, rows) {
  const escapeValue = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const csv = [
    columns.map((column) => escapeValue(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => escapeValue(typeof column.value === "function" ? column.value(row) : row[column.value])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function rankRecords(records, codeField, descriptionField) {
  const counts = new Map();
  records.forEach((record) => {
    const code = normalizeText(record[codeField]);
    const description = normalizeText(record[descriptionField]);
    if (!code && !description) return;
    const key = `${code}|||${description}`;
    const current = counts.get(key) || { code: code || "—", description: description || "Unspecified", count: 0 };
    current.count += 1;
    counts.set(key, current);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.description.localeCompare(b.description));
}

export default function ARGOSReportsModule({
  statusDurationAnalytics,
  completedRepairRecords = [],
  onExportUnitsDown,
  onExportStatusDurationAnalytics,
}) {
  const [activeReport, setActiveReport] = useState("status");
  const [statusSort, setStatusSort] = useState({ key: "currentUnits", direction: "desc" });
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [technicianFilter, setTechnicianFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const statusRows = useMemo(() => {
    const rows = [...(statusDurationAnalytics?.rows || [])];
    const numericKeys = {
      currentUnits: "currentUnits",
      completedStatusEvents: "completedStatusEvents",
      averageDuration: "averageDurationDays",
      longestDuration: "longestDurationDays",
      percentageOfRecordedDowntime: "percentageOfRecordedDowntime",
    };
    return rows.sort((a, b) => {
      const key = numericKeys[statusSort.key] || statusSort.key;
      const first = a[key];
      const second = b[key];
      const comparison = typeof first === "number" || !Number.isNaN(Number(first))
        ? Number(first) - Number(second)
        : normalizeText(first).localeCompare(normalizeText(second));
      return statusSort.direction === "asc" ? comparison : -comparison;
    });
  }, [statusDurationAnalytics, statusSort]);

  const departments = useMemo(() => [...new Set(completedRepairRecords.map((record) => normalizeText(record.department)).filter(Boolean))].sort(), [completedRepairRecords]);
  const technicians = useMemo(() => [...new Set(completedRepairRecords.map((record) => normalizeText(record.technician)).filter(Boolean))].sort(), [completedRepairRecords]);

  const filteredRepairs = useMemo(() => completedRepairRecords.filter((record) => {
    if (departmentFilter !== "All" && normalizeText(record.department) !== departmentFilter) return false;
    if (technicianFilter !== "All" && normalizeText(record.technician) !== technicianFilter) return false;
    const repairDate = parseRepairDate(record);
    if (dateFrom && (!repairDate || repairDate < new Date(`${dateFrom}T00:00:00`))) return false;
    if (dateTo && (!repairDate || repairDate > new Date(`${dateTo}T23:59:59`))) return false;
    return true;
  }), [completedRepairRecords, departmentFilter, technicianFilter, dateFrom, dateTo]);

  const vmrsAnalytics = useMemo(() => {
    const systems = rankRecords(filteredRepairs, "vmrsSystemCode", "vmrsSystemDescription");
    const components = rankRecords(filteredRepairs, "vmrsComponentCode", "vmrsComponentDescription");
    const reasons = rankRecords(filteredRepairs, "vmrsReasonCode", "vmrsReasonDescription");
    const work = rankRecords(filteredRepairs, "vmrsWorkAccomplishedCode", "vmrsWorkAccomplishedDescription");
    const codedRepairs = filteredRepairs.filter((record) => normalizeText(record.vmrsSystemCode) || normalizeText(record.vmrsComponentCode));
    const warrantyRepairs = filteredRepairs.filter((record) => /under warranty|in warranty/i.test(normalizeText(record.warrantyStatus))).length;
    const durationValues = filteredRepairs.map((record) => Number(record.finalDaysDown ?? record.daysDownDisplay)).filter(Number.isFinite);
    const averageDuration = durationValues.length ? durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length : 0;
    const assetCounts = new Map();
    filteredRepairs.forEach((record) => {
      const key = normalizeText(record.unit);
      if (key) assetCounts.set(key, (assetCounts.get(key) || 0) + 1);
    });
    const repeatRepairAssets = [...assetCounts.values()].filter((count) => count > 1).length;
    return {
      systems,
      components,
      reasons,
      work,
      totalRepairs: filteredRepairs.length,
      codedRepairs: codedRepairs.length,
      codingRate: filteredRepairs.length ? Math.round((codedRepairs.length / filteredRepairs.length) * 100) : 0,
      warrantyPercentage: filteredRepairs.length ? Math.round((warrantyRepairs / filteredRepairs.length) * 100) : 0,
      averageDuration: averageDuration.toFixed(1),
      repeatRepairAssets,
    };
  }, [filteredRepairs]);

  function handleStatusSort(key) {
    setStatusSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  }

  function exportVMRSAnalytics() {
    const rows = [
      ...vmrsAnalytics.systems.map((item) => ({ category: "System", ...item })),
      ...vmrsAnalytics.components.map((item) => ({ category: "Component", ...item })),
      ...vmrsAnalytics.reasons.map((item) => ({ category: "Failure Reason", ...item })),
      ...vmrsAnalytics.work.map((item) => ({ category: "Work Accomplished", ...item })),
    ];
    downloadCSV(`argos-vmrs-analytics-${formatDateInput(new Date())}.csv`, [
      { header: "Category", value: "category" },
      { header: "Code", value: "code" },
      { header: "Description", value: "description" },
      { header: "Repair Count", value: "count" },
    ], rows);
  }

  const renderRanking = (title, rows) => (
    <section className="argos-vmrs-ranking-card">
      <div className="argos-vmrs-ranking-header"><h3>{title}</h3><span>Top {Math.min(rows.length, 10)}</span></div>
      {rows.length === 0 ? <p className="argos-vmrs-empty">No coded repair records match the selected filters.</p> : (
        <div className="argos-vmrs-ranking-list">
          {rows.slice(0, 10).map((row, index) => (
            <div className="argos-vmrs-ranking-row" key={`${title}-${row.code}-${row.description}`}>
              <b>{index + 1}</b>
              <div><strong>{row.code}</strong><span>{row.description}</span></div>
              <em>{row.count}</em>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <section className="argos-reports-module" aria-label="ARGOS Reports">
      <header className="dashboard-header argos-reports-module-header">
        <div><p className="eyebrow">Reports</p><h2>{activeReport === "status" ? "Status Duration Analytics" : "VMRS Executive Analytics"}</h2></div>
        <div className="refresh-box"><span>{activeReport === "status" ? "Tracked Transitions" : "Completed Repairs"}</span><strong>{activeReport === "status" ? statusDurationAnalytics.trackedStatusTransitions : vmrsAnalytics.totalRepairs}</strong></div>
      </header>

      <nav className="argos-reports-tabs" aria-label="Report categories">
        <button type="button" className={activeReport === "status" ? "active" : ""} onClick={() => setActiveReport("status")}>Status Duration</button>
        <button type="button" className={activeReport === "vmrs" ? "active" : ""} onClick={() => setActiveReport("vmrs")}>VMRS Analytics</button>
      </nav>

      {activeReport === "status" ? (
        <>
          <section className="metrics-row argos-reports-metrics">
            <div className="availability-card argos-reports-bottleneck-card"><span>Current Largest Bottleneck</span><strong>{statusDurationAnalytics.currentLargestBottleneck?.status || "None"}</strong><p>{statusDurationAnalytics.currentLargestBottleneck ? `${statusDurationAnalytics.currentLargestBottleneck.currentUnits} current unit${statusDurationAnalytics.currentLargestBottleneck.currentUnits === 1 ? "" : "s"} in this status` : "No unavailable assets are currently creating a status bottleneck."}</p></div>
            <div className="metric-card argos-reports-metric-card"><span>Tracked Status Transitions</span><strong>{statusDurationAnalytics.trackedStatusTransitions}</strong></div>
            <div className="metric-card argos-reports-metric-card"><span>Average Recorded Status Duration</span><strong>{statusDurationAnalytics.averageRecordedStatusDuration}</strong><small>{statusDurationAnalytics.averageRecordedStatusEvent ? `Unit ${statusDurationAnalytics.averageRecordedStatusEvent.unit} · ${statusDurationAnalytics.averageRecordedStatusEvent.previousStatus}` : "No recorded unit available"}</small></div>
            <div className="metric-card critical argos-reports-metric-card"><span>Longest Recorded Status Duration</span><strong>{statusDurationAnalytics.longestRecordedStatusDuration}</strong><small>{statusDurationAnalytics.longestRecordedStatusEvent ? `Unit ${statusDurationAnalytics.longestRecordedStatusEvent.unit} · ${statusDurationAnalytics.longestRecordedStatusEvent.previousStatus}` : "No recorded unit available"}</small></div>
          </section>
          <section className="status-board argos-reports-status-board">
            <div className="status-board-header argos-reports-status-board-header"><div><button type="button" onClick={onExportUnitsDown}>Export Units Down</button><button type="button" onClick={onExportStatusDurationAnalytics}>Export Status Duration Analytics</button></div></div>
            <table className="argos-reports-analytics-table"><thead><tr>{[["status","Status"],["currentUnits","Current Units"],["completedStatusEvents","Completed Status Events"],["averageDuration","Average Duration"],["longestDuration","Longest Duration"],["percentageOfRecordedDowntime","Percentage of Recorded Downtime"]].map(([key,label]) => <th key={key}><button type="button" className="argos-reports-sort-button" onClick={() => handleStatusSort(key)}><span>{label}</span><b>{statusSort.key === key ? (statusSort.direction === "asc" ? "▲" : "▼") : ""}</b></button></th>)}</tr></thead><tbody>{statusRows.length === 0 ? <tr><td colSpan="6">No status duration analytics are currently available.</td></tr> : statusRows.map((row) => <tr key={row.status}><td><span className={`status-pill ${getStatusClass(row.status)}`}>{row.status}</span></td><td>{row.currentUnits}</td><td>{row.completedStatusEvents}</td><td>{row.averageDuration}</td><td>{row.longestDuration}</td><td>{row.percentageOfRecordedDowntime}%</td></tr>)}</tbody></table>
            {statusDurationAnalytics.trackedStatusTransitions === 0 && <p className="eyebrow">Status duration data will populate after assets move between unavailable statuses or return to Ready.</p>}
          </section>
        </>
      ) : (
        <>
          <section className="argos-vmrs-filter-bar">
            <label>Department<select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option>All</option>{departments.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Technician<select value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)}><option>All</option>{technicians.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
            <button type="button" onClick={() => { setDepartmentFilter("All"); setTechnicianFilter("All"); setDateFrom(""); setDateTo(""); }}>Clear Filters</button>
            <button type="button" onClick={exportVMRSAnalytics}>Export VMRS Analytics</button>
          </section>
          <section className="argos-vmrs-kpis">
            <article className="primary"><span>Total Repairs</span><strong>{vmrsAnalytics.totalRepairs}</strong><small>Completed records in scope</small></article>
            <article><span>VMRS Coding Rate</span><strong>{vmrsAnalytics.codingRate}%</strong><small>{vmrsAnalytics.codedRepairs} coded repairs</small></article>
            <article><span>Top Repair System</span><strong>{vmrsAnalytics.systems[0]?.code || "—"}</strong><small>{vmrsAnalytics.systems[0]?.description || "No coded systems"}</small></article>
            <article><span>Top Component</span><strong>{vmrsAnalytics.components[0]?.code || "—"}</strong><small>{vmrsAnalytics.components[0]?.description || "No coded components"}</small></article>
            <article><span>Average Days Down</span><strong>{vmrsAnalytics.averageDuration}</strong><small>Across filtered repairs</small></article>
            <article><span>Warranty Repairs</span><strong>{vmrsAnalytics.warrantyPercentage}%</strong><small>Repairs identified in warranty</small></article>
            <article><span>Repeat-Repair Assets</span><strong>{vmrsAnalytics.repeatRepairAssets}</strong><small>Units with multiple completed repairs</small></article>
          </section>
          <section className="argos-vmrs-ranking-grid">{renderRanking("Top Repair Systems", vmrsAnalytics.systems)}{renderRanking("Top Components", vmrsAnalytics.components)}{renderRanking("Top Failure Reasons", vmrsAnalytics.reasons)}{renderRanking("Work Accomplished", vmrsAnalytics.work)}</section>
        </>
      )}
    </section>
  );
}
