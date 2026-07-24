import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  Download,
  FileClock,
  FileUp,
  Filter,
  Eye,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { exportCSVReportFile } from "../../services/ARGOS_CSV_Data_Management_Service";
import {
  loadAssetLifecycleHistory,
  restoreOperationalAsset,
  summarizeAssetLifecycle,
} from "../../services/ARGOS_Asset_Lifecycle_Service";
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
  organizationId = "",
  canManageAssets = false,
  onAssetRestored,
  isDemoMode = false,
}) {
  const [activeTab, setActiveTab] = useState("import");
  const [exportScope, setExportScope] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exportStatus, setExportStatus] = useState("");
  const [archivedAssets, setArchivedAssets] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [archiveStatus, setArchiveStatus] = useState("");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveLifecycleFilter, setArchiveLifecycleFilter] = useState("archived");
  const [selectedArchivedAsset, setSelectedArchivedAsset] = useState(null);
  const [restoringArchiveId, setRestoringArchiveId] = useState("");

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

  const loadArchivedAssets = async () => {
    if (!organizationId || isDemoMode) {
      setArchivedAssets([]);
      setArchiveError("");
      return;
    }

    setArchiveLoading(true);
    setArchiveError("");

    try {
      const records = await loadAssetLifecycleHistory(organizationId);
      setArchivedAssets(records);
    } catch (error) {
      console.error("ARGOS archived assets load failed:", error);
      setArchiveError(error?.message || "ARGOS could not load archived assets.");
    } finally {
      setArchiveLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "archived") {
      loadArchivedAssets();
    }
  }, [activeTab, organizationId, isDemoMode]);

  const archiveSummary = useMemo(
    () => summarizeAssetLifecycle(archivedAssets),
    [archivedAssets]
  );

  const filteredArchivedAssets = useMemo(() => {
    const searchValue = normalizeText(archiveSearch);

    return archivedAssets.filter((record) => {
      const lifecycleMatches =
        archiveLifecycleFilter === "all" ||
        (archiveLifecycleFilter === "archived" && !record.restoredAt) ||
        (archiveLifecycleFilter === "restored" && Boolean(record.restoredAt));

      if (!lifecycleMatches) return false;
      if (!searchValue) return true;

      return [
        record.unit,
        record.vin,
        record.asset,
        record.department,
        record.archiveReason,
      ].some((value) => normalizeText(value).includes(searchValue));
    });
  }, [archivedAssets, archiveLifecycleFilter, archiveSearch]);

  const handleRestoreArchivedAsset = async (record) => {
    if (!record || record.restoredAt || restoringArchiveId) return;

    if (isDemoMode) {
      setArchiveStatus("Asset restoration is disabled in the public demo.");
      return;
    }

    if (!canManageAssets) {
      setArchiveStatus("Administrator or Manager access is required to restore assets.");
      return;
    }

    const shouldRestore = window.confirm(
      `Restore Unit ${record.unit}?\n\nThe asset will return to the active fleet. ARGOS will preserve this archive event in lifecycle history.`
    );

    if (!shouldRestore) return;

    setRestoringArchiveId(record.id);
    setArchiveStatus("");

    try {
      const restoredAsset = await restoreOperationalAsset(record.id);
      onAssetRestored?.(restoredAsset);
      await loadArchivedAssets();
      setSelectedArchivedAsset(null);
      setArchiveStatus(`Unit ${record.unit} was restored successfully.`);
    } catch (error) {
      console.error("ARGOS asset restore failed:", error);
      setArchiveStatus(error?.message || "ARGOS could not restore this asset.");
    } finally {
      setRestoringArchiveId("");
    }
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
          <strong>Sprint 001AF</strong>
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
            <section
              className="argos-data-management__panel"
              aria-labelledby="csv-import-history-title"
            >
              <div className="argos-data-management__panel-heading">
                <div>
                  <p className="eyebrow">Import Accountability</p>
                  <h3 id="csv-import-history-title">Import History</h3>
                  <p>
                    Review organization-scoped CSV import activity, outcomes, users, and
                    rejected-row records.
                  </p>
                </div>
                <span className="argos-data-management__phase">Operational</span>
              </div>

              <div className="argos-data-management__history-toolbar">
                <div>
                  <strong>{csvImport?.importHistory?.length || 0} recorded imports</strong>
                  <span>Up to the 250 most recent imports are displayed.</span>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={csvImport?.loadImportHistory}
                  disabled={csvImport?.importHistoryLoading}
                >
                  <RefreshCw
                    size={17}
                    className={
                      csvImport?.importHistoryLoading
                        ? "argos-data-management__spinner"
                        : undefined
                    }
                    aria-hidden="true"
                  />
                  {csvImport?.importHistoryLoading ? "Refreshing…" : "Refresh History"}
                </button>
              </div>

              {csvImport?.importHistoryError && (
                <div className="argos-data-management__result is-error" role="alert">
                  <AlertTriangle size={19} aria-hidden="true" />
                  <div>
                    <strong>Import History Unavailable</strong>
                    <p>{csvImport.importHistoryError}</p>
                  </div>
                </div>
              )}

              {!csvImport?.importHistoryLoading &&
                !csvImport?.importHistoryError &&
                !(csvImport?.importHistory || []).length && (
                  <div className="argos-data-management__history-empty">
                    <FileClock size={34} strokeWidth={1.7} aria-hidden="true" />
                    <h4>No import history yet</h4>
                    <p>
                      Successful CSV imports completed after Sprint 001AF will appear here.
                    </p>
                  </div>
                )}

              {(csvImport?.importHistory || []).length > 0 && (
                <div className="argos-data-management__table-scroll argos-data-management__history-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Date &amp; Time</th>
                        <th>File</th>
                        <th>Imported By</th>
                        <th>Total</th>
                        <th>Imported</th>
                        <th>Rejected</th>
                        <th>Duplicates</th>
                        <th>Outcome</th>
                        <th>Rejected Report</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvImport.importHistory.map((record) => (
                        <tr key={record.id}>
                          <td>
                            {record.createdAt
                              ? new Intl.DateTimeFormat("en-US", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(new Date(record.createdAt))
                              : "—"}
                          </td>
                          <td className="argos-data-management__history-file">
                            {record.fileName}
                          </td>
                          <td>{record.importedByName || "Unknown User"}</td>
                          <td>{record.totalRows}</td>
                          <td>{record.importedRows}</td>
                          <td>{record.rejectedRows}</td>
                          <td>{record.duplicateRows}</td>
                          <td>
                            <span
                              className={`argos-data-management__history-outcome ${
                                record.rejectedRows > 0
                                  ? "has-rejections"
                                  : "is-complete"
                              }`}
                            >
                              {record.rejectedRows > 0
                                ? "Completed with Rejections"
                                : "Completed"}
                            </span>
                          </td>
                          <td>
                            {record.rejectedRows > 0 ? (
                              <button
                                type="button"
                                className="secondary argos-data-management__history-download"
                                onClick={() =>
                                  csvImport?.downloadHistoryRejectedRows(record)
                                }
                              >
                                <Download size={15} aria-hidden="true" />
                                Download
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === "archived" && (
            <section
              className="argos-data-management__panel"
              aria-labelledby="archived-assets-title"
            >
              <div className="argos-data-management__panel-heading">
                <div>
                  <p className="eyebrow">Fleet Record Retention</p>
                  <h3 id="archived-assets-title">Archived Assets</h3>
                  <p>
                    Review the permanent asset lifecycle ledger and restore eligible assets
                    to the active fleet.
                  </p>
                </div>
                <span className="argos-data-management__phase">Operational</span>
              </div>

              {isDemoMode && (
                <div className="argos-data-management__notice" role="status">
                  Archived asset records and restoration are unavailable in the public demo.
                </div>
              )}

              <div className="argos-data-management__archive-summary" aria-label="Asset lifecycle summary">
                <article><span>Currently Archived</span><strong>{archiveSummary.currentlyArchived}</strong></article>
                <article><span>Restored Events</span><strong>{archiveSummary.restoredEvents}</strong></article>
                <article><span>Total Lifecycle Events</span><strong>{archiveSummary.totalEvents}</strong></article>
              </div>

              <div className="argos-data-management__archive-toolbar">
                <label className="argos-data-management__archive-search">
                  <span className="sr-only">Search archived assets</span>
                  <Search size={17} aria-hidden="true" />
                  <input
                    type="search"
                    value={archiveSearch}
                    onChange={(event) => setArchiveSearch(event.target.value)}
                    placeholder="Search unit, VIN, asset, department, or reason"
                  />
                </label>

                <label>
                  <span>Lifecycle</span>
                  <select
                    value={archiveLifecycleFilter}
                    onChange={(event) => setArchiveLifecycleFilter(event.target.value)}
                  >
                    <option value="archived">Currently Archived</option>
                    <option value="restored">Restored History</option>
                    <option value="all">All Events</option>
                  </select>
                </label>

                <button
                  type="button"
                  className="secondary"
                  onClick={loadArchivedAssets}
                  disabled={archiveLoading || isDemoMode}
                >
                  <RefreshCw
                    size={17}
                    className={archiveLoading ? "argos-data-management__spinner" : undefined}
                    aria-hidden="true"
                  />
                  {archiveLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              {archiveError && (
                <div className="argos-data-management__result is-error" role="alert">
                  <AlertTriangle size={19} aria-hidden="true" />
                  <div><strong>Archived Assets Unavailable</strong><p>{archiveError}</p></div>
                </div>
              )}

              {archiveStatus && (
                <div className="argos-data-management__result is-neutral" role="status" aria-live="polite">
                  <CheckCircle2 size={19} aria-hidden="true" />
                  <div><strong>Asset Lifecycle</strong><p>{archiveStatus}</p></div>
                </div>
              )}

              {!archiveLoading && !archiveError && !filteredArchivedAssets.length && (
                <div className="argos-data-management__history-empty">
                  <Archive size={34} strokeWidth={1.7} aria-hidden="true" />
                  <h4>No matching lifecycle records</h4>
                  <p>Archived assets will appear here after they are removed from the active fleet.</p>
                </div>
              )}

              {filteredArchivedAssets.length > 0 && (
                <div className="argos-data-management__table-scroll argos-data-management__archive-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Unit</th><th>Asset</th><th>Department</th><th>Archived</th>
                        <th>Reason</th><th>Lifecycle</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredArchivedAssets.map((record) => (
                        <tr key={record.id}>
                          <td className="argos-data-management__history-file">{record.unit || "—"}</td>
                          <td>{record.asset || "—"}</td>
                          <td>{record.department || "—"}</td>
                          <td>{formatLifecycleDate(record.archivedAt)}</td>
                          <td>{record.archiveReason || "—"}</td>
                          <td>
                            <span className={`argos-data-management__lifecycle-badge ${record.restoredAt ? "is-restored" : "is-archived"}`}>
                              {record.restoredAt ? "Restored" : "Archived"}
                            </span>
                          </td>
                          <td>
                            <div className="argos-data-management__archive-actions">
                              <button type="button" className="secondary" onClick={() => setSelectedArchivedAsset(record)}>
                                <Eye size={15} aria-hidden="true" /> View
                              </button>
                              {!record.restoredAt && canManageAssets && !isDemoMode && (
                                <button
                                  type="button"
                                  onClick={() => handleRestoreArchivedAsset(record)}
                                  disabled={restoringArchiveId === record.id}
                                >
                                  <RotateCcw size={15} aria-hidden="true" />
                                  {restoringArchiveId === record.id ? "Restoring…" : "Restore"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {selectedArchivedAsset && (
        <div className="argos-data-management__archive-overlay" role="presentation" onMouseDown={() => setSelectedArchivedAsset(null)}>
          <section
            className="argos-data-management__archive-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archived-asset-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">Asset Lifecycle Record</p>
                <h3 id="archived-asset-detail-title">Unit {selectedArchivedAsset.unit || "—"}</h3>
              </div>
              <button type="button" className="secondary" onClick={() => setSelectedArchivedAsset(null)} aria-label="Close archive details">
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <div className="argos-data-management__archive-detail-grid">
              <div><span>VIN</span><strong>{selectedArchivedAsset.vin || "—"}</strong></div>
              <div><span>Asset</span><strong>{selectedArchivedAsset.asset || "—"}</strong></div>
              <div><span>Department</span><strong>{selectedArchivedAsset.department || "—"}</strong></div>
              <div><span>Lifecycle Status</span><strong>{selectedArchivedAsset.restoredAt ? "Restored" : "Archived"}</strong></div>
              <div><span>Archived At</span><strong>{formatLifecycleDate(selectedArchivedAsset.archivedAt)}</strong></div>
              <div><span>Archived By</span><strong>{selectedArchivedAsset.archivedBy || "Recorded User"}</strong></div>
              <div className="is-wide"><span>Archive Reason</span><strong>{selectedArchivedAsset.archiveReason || "—"}</strong></div>
              {selectedArchivedAsset.restoredAt && (
                <>
                  <div><span>Restored At</span><strong>{formatLifecycleDate(selectedArchivedAsset.restoredAt)}</strong></div>
                  <div><span>Restored By</span><strong>{selectedArchivedAsset.restoredBy || "Recorded User"}</strong></div>
                </>
              )}
            </div>

            <footer>
              <button type="button" className="secondary" onClick={() => setSelectedArchivedAsset(null)}>Close</button>
              {!selectedArchivedAsset.restoredAt && canManageAssets && !isDemoMode && (
                <button
                  type="button"
                  onClick={() => handleRestoreArchivedAsset(selectedArchivedAsset)}
                  disabled={restoringArchiveId === selectedArchivedAsset.id}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  {restoringArchiveId === selectedArchivedAsset.id ? "Restoring…" : "Restore Asset"}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function formatLifecycleDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
