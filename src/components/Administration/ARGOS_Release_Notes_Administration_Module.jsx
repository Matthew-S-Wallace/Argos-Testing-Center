import "./ARGOS_Release_Notes_Administration_Module.css";

const RELEASE_CAPABILITIES = [
  "Executive Command Center",
  "My Fleet asset management",
  "Fleet status and availability workflows",
  "Repair History and repair completion",
  "Technician assignment and analytics",
  "Daily Summary and operational reporting",
  "CSV import, export, and import history",
  "Archived asset lifecycle management",
  "Administration and configuration controls",
  "Identity and access management",
  "Organization-scoped data isolation",
  "Enterprise Audit Log",
  "VIN scanning and vehicle intake",
  "APWA and VMRS framework integration",
];

const RELEASE_HISTORY = [
  {
    version: "1.0",
    date: "Pending",
    status: "Release Candidate",
    notes: "Initial production release of the ARGOS Fleet Operational Readiness Platform.",
  },
];

export default function ARGOSReleaseNotesAdministrationModule() {
  return (
    <div className="argos-release-notes-content">
      <header className="argos-release-notes-heading">
        <div>
          <p className="eyebrow">Production Lifecycle</p>
          <h4>Release Notes</h4>
          <p>
            Review the official ARGOS release history, including production
            capabilities, operational improvements, maintenance updates, and
            future version changes.
          </p>
        </div>
        <span className="argos-release-notes-read-only">Read Only</span>
      </header>

      <section className="argos-release-notes-current" aria-labelledby="argos-current-release">
        <div className="argos-release-notes-current-header">
          <div>
            <p className="argos-release-notes-version-label">Current Version</p>
            <h5 id="argos-current-release">ARGOS™ Version 1.0</h5>
            <p>
              The initial production release of the ARGOS Fleet Operational
              Readiness Platform.
            </p>
          </div>
          <div className="argos-release-notes-status">
            <span>Release Status</span>
            <strong>Production Release Candidate</strong>
            <small>Production release pending</small>
          </div>
        </div>

        <div className="argos-release-notes-summary">
          <div>
            <span>Release Track</span>
            <strong>Version 1.0</strong>
          </div>
          <div>
            <span>Current Phase</span>
            <strong>System Completion</strong>
          </div>
          <div>
            <span>Next Phase</span>
            <strong>Mobile Experience Polish</strong>
          </div>
        </div>
      </section>

      <section className="argos-release-notes-section">
        <div className="argos-release-notes-section-heading">
          <div>
            <p className="eyebrow">Initial Production Scope</p>
            <h5>Version 1.0 Capabilities</h5>
          </div>
          <span>{RELEASE_CAPABILITIES.length} capabilities</span>
        </div>

        <div className="argos-release-notes-capabilities">
          {RELEASE_CAPABILITIES.map((capability) => (
            <div key={capability}>
              <span aria-hidden="true">✓</span>
              <strong>{capability}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="argos-release-notes-section">
        <div className="argos-release-notes-section-heading">
          <div>
            <p className="eyebrow">Version History</p>
            <h5>Production Releases</h5>
          </div>
        </div>

        <div className="argos-release-notes-table-wrap">
          <table className="argos-release-notes-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Release Date</th>
                <th>Status</th>
                <th>Release Summary</th>
              </tr>
            </thead>
            <tbody>
              {RELEASE_HISTORY.map((release) => (
                <tr key={release.version}>
                  <td>
                    <strong>Version {release.version}</strong>
                  </td>
                  <td>{release.date}</td>
                  <td>
                    <span className="argos-release-notes-status-pill">
                      {release.status}
                    </span>
                  </td>
                  <td>{release.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="argos-release-notes-guidance">
        <div aria-hidden="true">i</div>
        <p>
          <strong>Permanent production history</strong>
          <span>
            Future ARGOS releases will document new capabilities, operational
            enhancements, maintenance corrections, security improvements, and
            other material production changes.
          </span>
        </p>
      </aside>
    </div>
  );
}
