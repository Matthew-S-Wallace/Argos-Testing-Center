import "./ARGOS_Repair_History_Module.css";

const EXPORT_COLUMNS = [
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
  { header: "VMRS System Code", value: "vmrsSystemCode" },
  { header: "VMRS System Description", value: "vmrsSystemDescription" },
  { header: "VMRS Assembly Code", value: "vmrsAssemblyCode" },
  { header: "VMRS Assembly Description", value: "vmrsAssemblyDescription" },
  { header: "VMRS Component Code", value: "vmrsComponentCode" },
  { header: "VMRS Component Description", value: "vmrsComponentDescription" },
  { header: "VMRS Reason Code", value: "vmrsReasonCode" },
  { header: "VMRS Reason Description", value: "vmrsReasonDescription" },
  { header: "VMRS Work Accomplished Code", value: "vmrsWorkAccomplishedCode" },
  { header: "VMRS Work Accomplished Description", value: "vmrsWorkAccomplishedDescription" },
  { header: "VMRS Position Code", value: "vmrsPositionCode" },
  { header: "VMRS Position Description", value: "vmrsPositionDescription" },
  { header: "Completed", value: (record) => formatDate(record.completedDisplayDate) },
  { header: "Details", value: "details" },
];

function getTodayDateString() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
}

function formatDate(dateString) {
  if (!dateString) return "—";

  const date = new Date(`${String(dateString).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(dateString);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusClass(status) {
  return String(status || "Ready")
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("/", "");
}

function escapeCSVValue(value) {
  const stringValue = String(value ?? "");
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

function downloadCSV(filename, columns, records) {
  const headerRow = columns.map((column) => escapeCSVValue(column.header)).join(",");
  const dataRows = records.map((record) =>
    columns
      .map((column) => {
        const value =
          typeof column.value === "function"
            ? column.value(record)
            : record[column.value];
        return escapeCSVValue(value);
      })
      .join(",")
  );

  const blob = new Blob([[headerRow, ...dataRows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function VMRSClassification({ record }) {
  const classifications = [
    ["System", record.vmrsSystemCode, record.vmrsSystemDescription],
    ["Assembly", record.vmrsAssemblyCode, record.vmrsAssemblyDescription],
    ["Component", record.vmrsComponentCode, record.vmrsComponentDescription],
    ["Reason", record.vmrsReasonCode, record.vmrsReasonDescription],
    ["Work", record.vmrsWorkAccomplishedCode, record.vmrsWorkAccomplishedDescription],
    ["Position", record.vmrsPositionCode, record.vmrsPositionDescription],
  ].filter(([, code]) => code);

  if (classifications.length === 0) return <span>—</span>;

  return (
    <div className="argos-repair-history-vmrs">
      {classifications.map(([label, code, description]) => (
        <span key={`${record.recordId}-${label}`}>
          <strong>
            {label}: {code}
          </strong>
          {description ? <small>{description}</small> : null}
        </span>
      ))}
    </div>
  );
}

export default function ARGOSRepairHistoryModule({
  completedRepairRecords = [],
}) {
  function handleExportRepairHistory() {
    if (completedRepairRecords.length === 0) {
      window.alert("There are no completed repair records to export.");
      return;
    }

    downloadCSV(
      `argos-repair-history-${getTodayDateString()}.csv`,
      EXPORT_COLUMNS,
      completedRepairRecords
    );

    window.alert(
      `Exported ${completedRepairRecords.length} repair history record${
        completedRepairRecords.length === 1 ? "" : "s"
      } successfully.`
    );
  }

  return (
    <>
      <header className="dashboard-header argos-repair-history-header">
        <div>
          <p className="eyebrow">Repair History / Archive</p>
          <h2>Completed Repair Records</h2>
        </div>

        <div className="refresh-box">
          <span>Historical Records</span>
          <strong>{completedRepairRecords.length}</strong>
        </div>
      </header>

      <section className="status-board argos-repair-history-board">
        <div className="status-board-header argos-repair-history-actions">
          <button type="button" onClick={handleExportRepairHistory}>
            Export Repair History
          </button>
        </div>

        <div className="argos-repair-history-table-shell">
          <table className="argos-repair-history-table">
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
                <th>VMRS Classification</th>
                <th>Completed</th>
                <th>Details</th>
              </tr>
            </thead>

            <tbody>
              {completedRepairRecords.length === 0 ? (
                <tr>
                  <td colSpan="13">
                    No completed repair records are currently available.
                  </td>
                </tr>
              ) : (
                completedRepairRecords.map((record) => (
                  <tr key={record.recordId}>
                    <td className="unit">{record.unit}</td>
                    <td>{record.department}</td>
                    <td>{record.asset}</td>
                    <td>{record.recordType}</td>
                    <td>
                      <span
                        className={`status-pill ${getStatusClass(
                          record.priorStatus
                        )}`}
                      >
                        {record.priorStatus}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${getStatusClass(
                          record.finalStatus
                        )}`}
                      >
                        {record.finalStatus}
                      </span>
                    </td>
                    <td>{record.reason}</td>
                    <td className={String(record.priority || "").toLowerCase()}>
                      {record.priority}
                    </td>
                    <td>{record.daysDownDisplay}</td>
                    <td>{record.technician}</td>
                    <td>
                      <VMRSClassification record={record} />
                    </td>
                    <td>{formatDate(record.completedDisplayDate)}</td>
                    <td>{record.details}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
