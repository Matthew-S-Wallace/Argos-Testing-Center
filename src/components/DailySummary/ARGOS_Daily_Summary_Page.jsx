import "./ARGOS_Daily_Summary_Page.css";

function getStatusClass(status) {
  return String(status || "Ready")
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("/", "");
}

export default function ARGOSDailySummaryPage({
  dailySummary,
  technicianDailySummary,
  hasAdministrationAccess,
  signedInTechnicianName,
  currentTime,
  onOpenQueue,
  onOpenAsset,
}) {
  return (
    <div className="argos-daily-summary-page">
      <section className="argos-daily-summary-view" aria-label="Daily Fleet Summary">
        <header className="argos-daily-summary-header">
          <div className="argos-daily-summary-heading">
            <p className="eyebrow">ARGOS Awareness Engine</p>
            <h2>Daily Summary</h2>
            <p>Fleet Readiness, Technician Workloads, and Operational Risks</p>
          </div>

          <div className="argos-daily-summary-date">
            <span>Operational brief</span>
            <strong>
              {currentTime.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </strong>
          </div>
        </header>

        <section
          className="argos-daily-summary-kpis"
          aria-label="Fleet readiness key performance indicators"
        >
          <article className="argos-daily-summary-availability">
            <span>Fleet availability</span>
            <strong>{dailySummary.availability}%</strong>
          </article>
          <article>
            <span>Units Unavailable</span>
            <strong>{dailySummary.unavailableAssets.length}</strong>
          </article>
          <article>
            <span>Critical Units Down</span>
            <strong>{dailySummary.criticalUnavailableAssets.length}</strong>
          </article>
          <article>
            <span>Units Awaiting Parts</span>
            <strong>{dailySummary.waitingPartsAssets.length}</strong>
          </article>
          <article>
            <span>Units Aged Past 7 Days</span>
            <strong>{dailySummary.agedAssets.length}</strong>
          </article>
        </section>

        <section className="argos-daily-summary-section">
          <div className="argos-daily-summary-section-heading">
            <div>
              <h3>
                {hasAdministrationAccess
                  ? "Fleet Operations Overview"
                  : signedInTechnicianName !== "Unassigned"
                    ? signedInTechnicianName
                    : "Current Operator"}
              </h3>
            </div>
            <span className="argos-daily-summary-active-badge">
              {technicianDailySummary.activeAssignedAssets.length} active
            </span>
          </div>

          <div className="argos-technician-summary-metrics argos-daily-summary-work-metrics">
            <article>
              <span>Assigned to Technicians</span>
              <strong>{technicianDailySummary.activeAssignedAssets.length}</strong>
            </article>
            <article>
              <span>Updated Today</span>
              <strong>{technicianDailySummary.updatedUnits.length}</strong>
            </article>
            <article>
              <span>Awaiting QC</span>
              <strong>{technicianDailySummary.awaitingQcAssets.length}</strong>
            </article>
            <article>
              <span>Ready Pickup</span>
              <strong>{technicianDailySummary.readyForPickupAssets.length}</strong>
            </article>
            <article>
              <span>Waiting Parts</span>
              <strong>{technicianDailySummary.waitingPartsAssets.length}</strong>
            </article>
            <article className="critical">
              <span>Critical</span>
              <strong>{technicianDailySummary.criticalAssets.length}</strong>
            </article>
          </div>

          <div className="argos-technician-summary-grid argos-daily-summary-work-grid">
            <div className="argos-technician-work-list">
              <div className="argos-technician-list-heading">
                <div>
                  <p className="eyebrow">Current Work</p>
                  <h4>
                    {hasAdministrationAccess
                      ? "Units Requiring Action"
                      : "Assigned Units Requiring Action"}
                  </h4>
                </div>
                <button type="button" onClick={onOpenQueue}>
                  Open Queue
                </button>
              </div>

              {technicianDailySummary.activeAssignedAssets.length === 0 ? (
                <p className="argos-technician-empty-state">
                  {hasAdministrationAccess
                    ? "No active assigned units currently require action."
                    : "No active units are currently assigned to you."}
                </p>
              ) : (
                technicianDailySummary.activeAssignedAssets.map((asset) => (
                  <button
                    className="argos-technician-work-item"
                    key={`daily-work-${asset.unit}`}
                    type="button"
                    onClick={() => onOpenAsset(asset)}
                  >
                    <span>
                      <strong>{asset.unit}</strong>
                      <small>{asset.asset}</small>
                    </span>
                    <span>
                      <b className={`status-pill ${getStatusClass(asset.status)}`}>
                        {asset.status}
                      </b>
                      <small>{asset.details}</small>
                    </span>
                    <i aria-hidden="true">›</i>
                  </button>
                ))
              )}
            </div>

            <div className="argos-technician-activity-list">
              <div className="argos-technician-list-heading">
                <div>
                  <p className="eyebrow">Activity Log</p>
                  <h4>Updates Recorded Today</h4>
                </div>
                <strong>
                  {technicianDailySummary.todayStatusEvents.length +
                    technicianDailySummary.todayCompletedRepairs.length}
                </strong>
              </div>

              {technicianDailySummary.todayStatusEvents.length === 0 &&
              technicianDailySummary.todayCompletedRepairs.length === 0 ? (
                <p className="argos-technician-empty-state">
                  {hasAdministrationAccess
                    ? "No organization activity has been recorded today."
                    : "No technician activity has been recorded today."}
                </p>
              ) : (
                <>
                  {technicianDailySummary.todayStatusEvents
                    .slice(0, 6)
                    .map((event) => (
                      <article key={`daily-event-${event.id}`}>
                        <span>{event.unit}</span>
                        <strong>
                          {event.previousStatus} → {event.newStatus}
                        </strong>
                        <small>
                          {new Date(
                            event.recordedAt || event.statusEndedAt,
                          ).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </small>
                      </article>
                    ))}

                  {technicianDailySummary.todayCompletedRepairs
                    .slice(0, 4)
                    .map((record) => (
                      <article key={`daily-completed-${record.recordId}`}>
                        <span>{record.unit}</span>
                        <strong>Repair completed</strong>
                        <small>
                          {record.details ||
                            record.reason ||
                            "Returned to service"}
                        </small>
                      </article>
                    ))}
                </>
              )}
            </div>
          </div>
        </section>

        <section className="argos-daily-summary-section">
          <div className="argos-daily-summary-section-heading">
            <div>
              <h3>Units Requiring Attention</h3>
            </div>
          </div>

          <div className="argos-daily-summary-insight-grid">
            <article
              className={
                dailySummary.criticalUnavailableAssets.length > 0
                  ? "risk"
                  : "stable"
              }
            >
              <span>Highest Risk</span>
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
            </article>

            <article>
              <span>Longest Down</span>
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
            </article>

            <article>
              <span>Parts Constraint</span>
              <strong>
                {dailySummary.waitingPartsAssets.length} unit
                {dailySummary.waitingPartsAssets.length === 1 ? "" : "s"} waiting
                parts
              </strong>
              <p>
                {dailySummary.waitingPartsAssets.length > 0
                  ? dailySummary.waitingPartsAssets
                      .map((asset) => `${asset.unit} · ${asset.details}`)
                      .join(", ")
                  : "No parts-delay assets are currently flagged."}
              </p>
            </article>

            <article>
              <span>RTS Gaps</span>
              <strong>
                {dailySummary.tbdAssets.length} TBD ·{" "}
                {dailySummary.noRtsAssets.length} no RTS
              </strong>
              <p>
                Return-to-service uncertainty remains visible for assets without
                firm dates.
              </p>
            </article>

            <article>
              <span>Aging Threshold</span>
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
            </article>

            <article>
              <span>Department Watch</span>
              <strong>
                {dailySummary.departmentWatch || "No department watch items"}
              </strong>
              <p>
                Departments listed have unavailable assets requiring management
                visibility.
              </p>
            </article>
          </div>
        </section>
      </section>
    </div>
  );
}
