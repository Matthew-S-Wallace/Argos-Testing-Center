import { useState } from "react";
import {
  Archive,
  Database,
  Download,
  FileClock,
  FileUp,
  Upload,
} from "lucide-react";
import "./ARGOS_Data_Management_Module.css";

const DATA_MANAGEMENT_TABS = [
  { id: "import", label: "CSV Import", icon: FileUp },
  { id: "export", label: "CSV Export", icon: Download },
  { id: "history", label: "Import History", icon: FileClock },
  { id: "archived", label: "Archived Assets", icon: Archive },
];

export default function ARGOSDataManagementModule({
  csvImport,
  isDemoMode = false,
}) {
  const [activeTab, setActiveTab] = useState("import");
  const previewRows = csvImport?.previewAssets || [];
  const rejectedRows = csvImport?.rejectedRows || [];

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
          <strong>Sprint 001AD.2</strong>
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
                      <span className="argos-data-management__filename">{csvImport.selectedFileName}</span>
                    )}
                  </div>
                  <input
                    ref={csvImport?.csvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={csvImport?.prepareCSVPreview}
                    className="argos-data-management__file-input"
                  />
                  <button type="button" onClick={csvImport?.selectCSVFile} disabled={csvImport?.isReading}>
                    {csvImport?.isReading ? "Validating..." : "Select CSV File"}
                  </button>
                </article>
              </div>

              {(previewRows.length > 0 || rejectedRows.length > 0) && (
                <section className="argos-data-management__preview" aria-labelledby="csv-preview-title">
                  <div className="argos-data-management__preview-heading">
                    <div>
                      <p className="eyebrow">Validation Results</p>
                      <h4 id="csv-preview-title">Import Preview</h4>
                    </div>
                    <div className="argos-data-management__counts">
                      <span><strong>{previewRows.length}</strong> Valid</span>
                      <span><strong>{rejectedRows.length}</strong> Rejected</span>
                    </div>
                  </div>

                  {previewRows.length > 0 && (
                    <div className="argos-data-management__table-scroll">
                      <table>
                        <thead>
                          <tr><th>Unit</th><th>VIN</th><th>Department</th><th>Asset</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {previewRows.slice(0, 25).map((asset, index) => (
                            <tr key={`${asset.unit}-${index}`}>
                              <td>{asset.unit}</td><td>{asset.vin || "—"}</td><td>{asset.department}</td><td>{asset.asset}</td><td>{asset.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {previewRows.length > 25 && <p className="argos-data-management__preview-limit">Showing the first 25 valid rows.</p>}
                    </div>
                  )}

                  {rejectedRows.length > 0 && (
                    <div className="argos-data-management__rejections">
                      <strong>Rejected rows</strong>
                      <ul>{rejectedRows.map((message) => <li key={message}>{message}</li>)}</ul>
                    </div>
                  )}

                  <div className="argos-data-management__preview-actions">
                    <button type="button" className="secondary" onClick={() => csvImport?.resetPreview()} disabled={csvImport?.isImporting}>Cancel</button>
                    <button type="button" onClick={csvImport?.confirmImport} disabled={!previewRows.length || csvImport?.isImporting}>
                      {csvImport?.isImporting ? "Importing..." : `Import ${previewRows.length} Asset${previewRows.length === 1 ? "" : "s"}`}
                    </button>
                  </div>
                </section>
              )}

              {csvImport?.importStatus && (
                <div className="argos-data-management__result" role="status" aria-live="polite">
                  <strong>Import Result</strong>
                  <p>{csvImport.importStatus}</p>
                </div>
              )}
            </section>
          )}

          {activeTab === "export" && <PlaceholderPanel eyebrow="Fleet Data Distribution" title="CSV Export" description="Export controls will be implemented during Sprint 001AD.3." phase="Sprint 001AD.3" icon={Download} />}
          {activeTab === "history" && <PlaceholderPanel eyebrow="Import Accountability" title="Import History" description="Organization-scoped import records and outcomes will be implemented during Sprint 001AD.4." phase="Sprint 001AD.4" icon={FileClock} />}
          {activeTab === "archived" && <PlaceholderPanel eyebrow="Fleet Record Retention" title="Archived Assets" description="Archived asset review and restoration workflows will be implemented during Sprint 001AD.4." phase="Sprint 001AD.4" icon={Archive} />}
        </div>
      </div>
    </section>
  );
}

function PlaceholderPanel({ eyebrow, title, description, phase, icon: Icon }) {
  return (
    <section className="argos-data-management__panel argos-data-management__placeholder">
      <span className="argos-data-management__placeholder-icon" aria-hidden="true"><Icon size={34} strokeWidth={1.7} /></span>
      <p className="eyebrow">{eyebrow}</p><h3>{title}</h3><p>{description}</p><span className="argos-data-management__phase">{phase}</span>
    </section>
  );
}
