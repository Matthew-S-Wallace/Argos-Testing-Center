import { useMemo, useState } from "react";
import useARGOSAuditLog from "../../hooks/useARGOSAuditLog";
import "./ARGOS_Audit_Log_Administration_Module.css";

function formatLabel(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDetails(details) {
  if (!details || typeof details !== "object" || Object.keys(details).length === 0) {
    return "No additional event details were recorded.";
  }
  return JSON.stringify(details, null, 2);
}

function MetricCard({ label, value, description }) {
  return (
    <article className="audit-log-metric-card">
      <span>{label}</span>
      <strong>{Number(value || 0).toLocaleString("en-US")}</strong>
      <p>{description}</p>
    </article>
  );
}

function AuditEventDetail({ event, onClose }) {
  if (!event) return null;

  const identity = event.userName || event.userEmail || "System Event";
  const target = event.entityName || event.entityId || "Organization";

  return (
    <div className="audit-log-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="audit-log-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-log-detail-title"
        onMouseDown={(eventObject) => eventObject.stopPropagation()}
      >
        <div className="audit-log-detail-header">
          <div>
            <p className="eyebrow">System Administration</p>
            <h4 id="audit-log-detail-title">Audit Event</h4>
            <p>{event.summary || formatLabel(event.action) || "Recorded ARGOS activity"}</p>
          </div>
          <button className="audit-log-close-button" type="button" onClick={onClose} aria-label="Close audit event details">
            ×
          </button>
        </div>

        <div className="audit-log-detail-grid">
          <div><span>Date and Time</span><strong>{formatDateTime(event.createdAt)}</strong></div>
          <div><span>User</span><strong>{identity}</strong></div>
          <div><span>User Role</span><strong>{formatLabel(event.userRole) || "Not recorded"}</strong></div>
          <div><span>Category</span><strong>{formatLabel(event.category) || "Not recorded"}</strong></div>
          <div><span>Action</span><strong>{formatLabel(event.action) || "Not recorded"}</strong></div>
          <div><span>Outcome</span><strong>{formatLabel(event.outcome) || "Not recorded"}</strong></div>
          <div><span>Severity</span><strong>{formatLabel(event.severity) || "Not recorded"}</strong></div>
          <div><span>Target</span><strong>{target}</strong></div>
          <div><span>Entity Type</span><strong>{formatLabel(event.entityType) || "Not recorded"}</strong></div>
          <div><span>Source</span><strong>{formatLabel(event.source) || "Web"}</strong></div>
        </div>

        <section className="audit-log-detail-section">
          <span>Event Details</span>
          <pre>{formatDetails(event.details)}</pre>
        </section>

        <section className="audit-log-detail-identifiers">
          <div><span>Event ID</span><code>{event.id || "Not recorded"}</code></div>
          <div><span>Request ID</span><code>{event.requestId || "Not recorded"}</code></div>
          <div><span>Entity ID</span><code>{event.entityId || "Not recorded"}</code></div>
        </section>
      </aside>
    </div>
  );
}

export default function ARGOSAuditLogAdministrationModule({ organizationId, isDemoMode = false }) {
  const [selectedEvent, setSelectedEvent] = useState(null);

  const {
    events,
    summary,
    filterOptions,
    filters,
    hasActiveFilters,
    pagination,
    isLoading,
    isRefreshing,
    errorMessage,
    setFilter,
    resetFilters,
    refresh,
    setPage,
    nextPage,
    previousPage,
  } = useARGOSAuditLog({
    organizationId,
    enabled: !isDemoMode && Boolean(organizationId),
    pageSize: 25,
  });

  const visibleUserOptions = useMemo(() => filterOptions.users || [], [filterOptions.users]);

  if (isDemoMode) {
    return (
      <section className="audit-log-module">
        <div className="audit-log-heading">
          <div>
            <p className="eyebrow">System Administration</p>
            <h4>Audit Log</h4>
            <p>Review significant organization activity, administrative changes, and operational events.</p>
          </div>
        </div>
        <div className="audit-log-state-card">
          <strong>Audit history is unavailable in Demo Mode</strong>
          <span>Production audit events are organization-scoped and are not displayed in the public demonstration environment.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="audit-log-module">
      <div className="audit-log-heading">
        <div>
          <p className="eyebrow">System Administration</p>
          <h4>Audit Log</h4>
          <p>Review significant organization activity, administrative changes, and operational events.</p>
        </div>
        <button type="button" className="audit-log-refresh-button" onClick={() => refresh()} disabled={isRefreshing || isLoading}>
          {isRefreshing ? "Refreshing…" : "Refresh Log"}
        </button>
      </div>

      <div className="audit-log-metrics-grid">
        <MetricCard label="Total Events" value={summary.totalEvents} description="All recorded organization activity" />
        <MetricCard label="Today's Events" value={summary.todayEvents} description="Activity recorded since midnight" />
        <MetricCard label="Failed or Denied" value={summary.failedEvents} description="Events requiring administrative attention" />
        <MetricCard label="Critical Events" value={summary.criticalEvents} description="Highest-severity recorded activity" />
      </div>

      <div className="audit-log-toolbar">
        <label className="audit-log-search-field">
          <span>Search</span>
          <input
            type="search"
            value={filters.search}
            onChange={(event) => setFilter("search", event.target.value)}
            placeholder="Search user, event, target, or summary"
          />
        </label>

        <label>
          <span>Category</span>
          <select value={filters.category} onChange={(event) => setFilter("category", event.target.value)}>
            <option value="">All Categories</option>
            {(filterOptions.categories || []).map((category) => (
              <option key={category} value={category}>{formatLabel(category)}</option>
            ))}
          </select>
        </label>

        <label>
          <span>User</span>
          <select value={filters.userId} onChange={(event) => setFilter("userId", event.target.value)}>
            <option value="">All Users</option>
            {visibleUserOptions.map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Outcome</span>
          <select value={filters.outcome} onChange={(event) => setFilter("outcome", event.target.value)}>
            <option value="">All Outcomes</option>
            {(filterOptions.outcomes || []).map((outcome) => (
              <option key={outcome} value={outcome}>{formatLabel(outcome)}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Start Date</span>
          <input type="date" value={filters.startDate} onChange={(event) => setFilter("startDate", event.target.value)} />
        </label>

        <label>
          <span>End Date</span>
          <input type="date" value={filters.endDate} onChange={(event) => setFilter("endDate", event.target.value)} />
        </label>

        {hasActiveFilters && (
          <button type="button" className="audit-log-clear-button" onClick={resetFilters}>Clear Filters</button>
        )}
      </div>

      {errorMessage ? (
        <div className="audit-log-state-card error">
          <strong>Audit Log could not be loaded</strong>
          <span>{errorMessage}</span>
        </div>
      ) : isLoading ? (
        <div className="audit-log-state-card">
          <strong>Loading organization audit activity…</strong>
          <span>ARGOS is retrieving the latest system events.</span>
        </div>
      ) : events.length === 0 ? (
        <div className="audit-log-state-card">
          <strong>No audit activity has been recorded</strong>
          <span>{hasActiveFilters ? "No events match the selected filters." : "The first production workflow integration will create the initial organization event."}</span>
        </div>
      ) : (
        <>
          <div className="audit-log-table-wrap">
            <table className="audit-log-table">
              <thead>
                <tr>
                  <th>Date and Time</th>
                  <th>User</th>
                  <th>Event</th>
                  <th>Category</th>
                  <th>Target</th>
                  <th>Outcome</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} tabIndex="0" onClick={() => setSelectedEvent(event)} onKeyDown={(keyboardEvent) => {
                    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                      keyboardEvent.preventDefault();
                      setSelectedEvent(event);
                    }
                  }}>
                    <td>{formatDateTime(event.createdAt)}</td>
                    <td><strong>{event.userName || event.userEmail || "System Event"}</strong><small>{event.userEmail || formatLabel(event.userRole)}</small></td>
                    <td><strong>{formatLabel(event.action)}</strong><small>{event.summary || "Recorded ARGOS activity"}</small></td>
                    <td>{formatLabel(event.category)}</td>
                    <td>{event.entityName || event.entityId || "Organization"}</td>
                    <td><span className={`audit-log-pill outcome-${event.outcome || "success"}`}>{formatLabel(event.outcome)}</span></td>
                    <td><span className={`audit-log-pill severity-${event.severity || "information"}`}>{formatLabel(event.severity)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="audit-log-pagination">
            <div>
              Showing page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> · {pagination.totalEvents.toLocaleString("en-US")} events
            </div>
            <div className="audit-log-pagination-controls">
              <button type="button" onClick={previousPage} disabled={!pagination.hasPreviousPage}>Previous</button>
              <label>
                <span className="sr-only">Page number</span>
                <select value={pagination.page} onChange={(event) => setPage(event.target.value)}>
                  {Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((pageNumber) => (
                    <option key={pageNumber} value={pageNumber}>Page {pageNumber}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={nextPage} disabled={!pagination.hasNextPage}>Next</button>
            </div>
          </div>
        </>
      )}

      <AuditEventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </section>
  );
}
