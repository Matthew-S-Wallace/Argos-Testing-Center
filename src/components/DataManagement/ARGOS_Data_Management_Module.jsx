import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  Download,
  FileClock,
  FileUp,
  Filter,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { exportCSVReportFile } from "../../services/ARGOS_CSV_Data_Management_Service";
import "./ARGOS_Data_Management_Module.css";

const DATA_MANAGEMENT_TABS = [
  { id: "import", label: "CSV Import", icon: FileUp },
  { id: "export", label: "CSV Export", icon: Download },
  { id: "history", label: "Import History", icon: FileClock },
  { id: "archived", label: "Archived Assets", icon: Archive },
];

const EXPORT_SCOPES = [
  {
    id: "all",
    label: "Entire Fleet",
    description: "Export every active asset currently visible to this organization.",
  },
  {
    id: "ready",
    label: "Ready Assets",
    description: "Export assets whose current operational status is Ready.",
  },
  {
    id: "unavailable",
    label: "Unavailable Assets",
    description: "Export all assets that are not currently in Ready status.",
  },
];

const EXPORT_COLUMNS = [
  { header: "Unit", value: "unit" },
  { header: "VIN", value: "vin" },
  { header: "Department", value: "department" },
  { header: "Asset", value: "asset" },
  { header: "Year", value: "year" },
  { header: "Make", value: "make" },
  { header: "Model", value: "model" },
  { header: "Asset Type", value: (asset) => asset.assetType || asset.asset_type || "" },
  { header: "Status", value: "status" },
  { header: "Reason", value: "reason" },
  { header: "Priority", value: "priority" },
  { header: "Down Since", value: (asset) => asset.downSince || asset.down_since || "" },
  { header: "Technician", value: "technician" },
  { header: "RTS Type", value: (asset) => asset.rtsType || asset.rts_type || "" },
  { header: "RTS Date", value: (asset) => asset.rtsDate || asset.rts_date || "" },
  { header: "Details", value: "details" },
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function createExportFilename(scope) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `argos-${scope}-assets-${dateStamp}.csv`;
}

export default function ARGOSDataManagementModule({
  csvImport,
  assets = [],
  isDemoMode = false,
}) {
  const [activeTab, setActiveTab] = useState("import");
  const [exportScope, setExportScope] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exportStatus, setExportStatus] = useState("");

  const previewRows = csvImport?.previewAssets || [];
  const rejectedRows = csvImport?.rejectedRows || [];
  const validationSummary = csvImport?.validationSummary || {
    total: 0,
    valid: 0,
    rejected: 0,
    duplicates: 0,
  };
  const isBusy = Boolean(csvImport?.isReading || csvImport?.isImporting);

  const departments = useMemo(
    () =>
      [...new Set((assets || []).map((asset) => asset.department).filter(Boolean))].sort(
        (a, b) => String(a).localeCompare(String(b))
      ),
    [assets]
  );

  const statuses = useMemo(
    () =>
      [...new Set((assets || []).map((asset) => asset.status).filter(Boolean))].sort(
        (a, b) => String(a).localeCompare(String(b))
      ),
    [assets]
  );

  const exportRows = useMemo(() => {
    return (assets || []).filter((asset) => {
      const status = normalizeText(asset.status);
      const matchesScope =
        exportScope === "all" ||
        (exportScope === "ready" && status === "ready") ||
        (exportScope === "unavailable" && status !== "ready");

      const matchesDepartment =
        departmentFilter === "all" || asset.department === departmentFilter;

      const matchesStatus = statusFilter === "all" || asset.status === statusFilter;

      return matchesScope && matchesDepartment && matchesStatus;
    });
  }, [assets, departmentFilter, exportScope, statusFilter]);

  const handleExport = () => {
    if (!exportRows.length) {
      setExportStatus("No assets match the selected export criteria.");
      return;
    }

    exportCSVReportFile({
      filename: createExportFilename(exportScope),
      columns: EXPORT_COLUMNS,
      rows: exportRows,
    });

    setExportStatus(
      `${exportRows.length} asset${exportRows.length === 1 ? "" : "s"} exported successfully.`
    );
  };

  const resetExportFilters = () => {
    setExportScope("all");
    setDepartmentFilter("all");
    setStatusFilter("all");
    setExportStatus("");
  };

  return (
    <section className="argos-data-management" aria-labelledby="argos-data-management-title">
      <header className="argos-data-management__page-header">
        <div>
          <p className="argos-data-management__page-eyebrow">Data Administration</p>
          <h1 id="argos-data-management-title">Data Management</h1>
        </div>
        <div className="argos-data-management__status-card">
          <Database size={22} strokeWidth={1.9} aria-hidden="true" />
          <span>Workspace</span>
          <strong>Sprint 001AE</strong>
        </div>
      </header>

      <div className="argos-data-management__workspace">
        <nav className="argos-data-management__tabs" aria-label="Data Management sections">
          {DATA_MANAGEMENT_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                className={`argos-data-management__tab${isActive ? " is-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="argos-data-management__content">
          {activeTab === "import" && (
            <section className="argos-data-management__panel" aria-labelledby="csv-import-title">
              <div className="argos-data-management__panel-heading">
                <div>
                  <p className="eyebrow">Fleet Data Intake</p>
                  <h3 id="csv-import-title">CSV Import</h3>
                </div>
                <span className="argos-data-management__phase">Operational</span>
              </div>

              {isDemoMode && (
                <div className="argos-data-management__notice" role="status">
                  Demo imports are temporary and disappear when the demo is refreshed or exited.
                </div>
              )}

              <div className="argos-data-management__action-grid">
                <article className="argos-data-management__action-card">
                  <span className="argos-data-management__action-icon" aria-hidden="true">
                    <Download size={24} strokeWidth={1.9} />
                  </span>
                  <div>
                    <h4>Download Template</h4>
                    <p>Start with the current ARGOS asset columns and example formatting.</p>
                  </div>
                  <button type="button" onClick={csvImport?.downloadTemplate}>
                    Download CSV Template
                  </button>
                </article>

                <article className="argos-data-management__action-card">
                  <span className="argos-data-management__action-icon" aria-hidden="true">
                    <Upload size={24} strokeWidth={1.9} />
                  </span>
                  <div>
                    <h4>Select Asset File</h4>
                    <p>Select a completed CSV file to validate before importing.</p>
                    {csvImport?.selectedFileName && (
                      <span className="argos-data-management__filename">
                        {csvImport.selectedFileName}
                      </span>
                    )}
                  </div>
                  <input
                    ref={csvImport?.csvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={csvImport?.prepareCSVPreview}
                    className="argos-data-management__file-input"
                  />
                  <button type="button" onClick={csvImport?.selectCSVFile} disabled={isBusy}>
                    {csvImport?.isReading ? "Validating…" : "Select CSV File"}
                  </button>
                </article>
              </div>

              {csvImport?.progress?.message && (
                <div className="argos-data-management__progress" role="status" aria-live="polite">
                  <LoaderCircle
                    size={18}
                    className="argos-data-management__spinner"
                    aria-hidden="true"
                  />
                  <span>{csvImport.progress.message}</span>
                </div>
              )}

              {(validationSummary.total > 0 ||
                previewRows.length > 0 ||
                rejectedRows.length > 0) && (
                <section
                  className="argos-data-management__preview"
                  aria-labelledby="csv-preview-title"
                >
                  <div className="argos-data-management__preview-heading">
                    <div>
                      <p className="eyebrow">Validation Results</p>
                      <h4 id="csv-preview-title">Import Preview</h4>
                    </div>
                    <div
                      className="argos-data-management__counts"
                      aria-label="CSV validation summary"
                    >
                      <span>
                        <strong>{validationSummary.total}</strong> Total
                      </span>
                      <span className="is-valid">
                        <strong>{validationSummary.valid}</strong> Valid
                      </span>
                      <span className="is-rejected">
                        <strong>{validationSummary.rejected}</strong> Rejected
                      </span>
                      <span className="is-duplicate">
                        <strong>{validationSummary.duplicates}</strong> Duplicates
                      </span>
                    </div>
                  </div>

                  {previewRows.length > 0 && (
                    <div className="argos-data-management__table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Unit</th>
                            <th>VIN</th>
                            <th>Department</th>
                            <th>Asset</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.slice(0, 25).map((asset, index) => (
                            <tr key={`${asset.unit}-${index}`}>
                              <td>{asset.unit}</td>
                              <td>{asset.vin || "—"}</td>
                              <td>{asset.department}</td>
                              <td>{asset.asset}</td>
                              <td>{asset.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {previewRows.length > 25 && (
                        <p className="argos-data-management__preview-limit">
                          Showing the first 25 valid rows.
                        </p>
                      )}
                    </div>
                  )}

                  {rejectedRows.length > 0 && (
                    <div className="argos-data-management__rejections">
                      <div className="argos-data-management__rejections-heading">
                        <div>
                          <AlertTriangle size={18} aria-hidden="true" />
                          <strong>Rejected rows require correction</strong>
                        </div>
                        <button
                          type="button"
                          className="secondary"
                          onClick={csvImport?.downloadRejectedRows}
                        >
                          Download Error Report
                        </button>
                      </div>
                      <ul>
                        {rejectedRows.slice(0, 50).map((row, index) => {
                          const rowNumber = row?.rowNumber ?? index + 2;
                          const reasons = Array.isArray(row?.reasons)
                            ? row.reasons.join("; ")
                            : String(row?.message || row || "");

                          return (
                            <li key={`${rowNumber}-${reasons}`}>
                              <strong>Row {rowNumber}</strong>
                              <span>{reasons}</span>
                            </li>
                          );
                        })}
                      </ul>
                      {rejectedRows.length > 50 && (
                        <p>
                          Showing the first 50 rejected rows. Download the error report for the
                          complete list.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="argos-data-management__preview-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => csvImport?.resetPreview()}
                      disabled={isBusy}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={csvImport?.confirmImport}
                      disabled={!previewRows.length || isBusy}
                    >
                      {csvImport?.isImporting
                        ? "Importing…"
                        : `Import ${previewRows.length} Asset${
                            previewRows.length === 1 ? "" : "s"
                          }`}
                    </button>
                  </div>
                </section>
              )}

              {csvImport?.importStatus && (
                <div
                  className={`argos-data-management__result is-${
                    csvImport?.importStatusTone || "neutral"
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {csvImport?.importStatusTone === "success" ? (
                    <CheckCircle2 size={19} aria-hidden="true" />
                  ) : (
                    <AlertTriangle size={19} aria-hidden="true" />
                  )}
                  <div>
                    <strong>
                      {csvImport?.importStatusTone === "success"
                        ? "Import Status"
                        : "Import Review"}
                    </strong>
                    <p>{csvImport.importStatus}</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeTab === "export" && (
            <section className="argos-data-management__panel" aria-labelledby="csv-export-title">
              <div className="argos-data-management__panel-heading">
                <div>
                  <p className="eyebrow">Fleet Data Distribution</p>
                  <h3 id="csv-export-title">CSV Export</h3>
                  <p>
                    Select the fleet population and optional filters to create an
                    organization-scoped CSV file.
                  </p>
                </div>
                <span className="argos-data-management__phase">Operational</span>
              </div>

              <div className="argos-data-management__export-summary">
                <div>
                  <span>Available Assets</span>
                  <strong>{assets.length}</strong>
                </div>
                <div>
                  <span>Matching Export</span>
                  <strong>{exportRows.length}</strong>
                </div>
                <div>
                  <span>File Format</span>
                  <strong>CSV</strong>
                </div>
              </div>

              <fieldset className="argos-data-management__export-scopes">
                <legend>Export population</legend>
                <div className="argos-data-management__export-scope-grid">
                  {EXPORT_SCOPES.map((scope) => (
                    <label
                      key={scope.id}
                      className={`argos-data-management__export-scope${
                        exportScope === scope.id ? " is-selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="argos-export-scope"
                        value={scope.id}
                        checked={exportScope === scope.id}
                        onChange={(event) => {
                          setExportScope(event.target.value);
                          setExportStatus("");
                        }}
                      />
                      <span>
                        <strong>{scope.label}</strong>
                        <small>{scope.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <section
                className="argos-data-management__export-filters"
                aria-labelledby="export-filters-title"
              >
                <div className="argos-data-management__export-filters-heading">
                  <div>
                    <Filter size={18} aria-hidden="true" />
                    <h4 id="export-filters-title">Optional Filters</h4>
                  </div>
                  <button type="button" className="secondary" onClick={resetExportFilters}>
                    Reset Filters
                  </button>
                </div>

                <div className="argos-data-management__export-filter-grid">
                  <label>
                    <span>Department</span>
                    <select
                      value={departmentFilter}
                      onChange={(event) => {
                        setDepartmentFilter(event.target.value);
                        setExportStatus("");
                      }}
                    >
                      <option value="all">All departments</option>
                      {departments.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Status</span>
                    <select
                      value={statusFilter}
                      onChange={(event) => {
                        setStatusFilter(event.target.value);
                        setExportStatus("");
                      }}
                    >
                      <option value="all">All statuses</option>
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <div className="argos-data-management__export-action">
                <div>
                  <strong>
                    {exportRows.length} asset{exportRows.length === 1 ? "" : "s"} ready
                  </strong>
                  <span>
                    The download includes fleet identity, operational status, assignment,
                    and return-to-service fields.
                  </span>
                </div>
                <button type="button" onClick={handleExport} disabled={!exportRows.length}>
                  <Download size={18} aria-hidden="true" />
                  Export CSV
                </button>
              </div>

              {exportStatus && (
                <div
                  className={`argos-data-management__result ${
                    exportRows.length ? "is-success" : "is-neutral"
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {exportRows.length ? (
                    <CheckCircle2 size={19} aria-hidden="true" />
                  ) : (
                    <AlertTriangle size={19} aria-hidden="true" />
                  )}
                  <div>
                    <strong>Export Status</strong>
                    <p>{exportStatus}</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeTab === "history" && (
            <PlaceholderPanel
              eyebrow="Import Accountability"
              title="Import History"
              description="Organization-scoped import records and outcomes will be implemented during Sprint 001AD.5."
              phase="Sprint 001AD.5"
              icon={FileClock}
            />
          )}

          {activeTab === "archived" && (
            <PlaceholderPanel
              eyebrow="Fleet Record Retention"
              title="Archived Assets"
              description="Archived asset review and restoration workflows will be implemented during Sprint 001AD.6."
              phase="Sprint 001AD.6"
              icon={Archive}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function PlaceholderPanel({ eyebrow, title, description, phase, icon: Icon }) {
  return (
    <section className="argos-data-management__panel argos-data-management__placeholder">
      <span className="argos-data-management__placeholder-icon" aria-hidden="true">
        <Icon size={34} strokeWidth={1.7} />
      </span>
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="argos-data-management__phase">{phase}</span>
    </section>
  );
}
