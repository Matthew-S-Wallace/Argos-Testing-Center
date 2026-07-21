// ARGOS Command Center v1.9 - Operational Alerts Panel Integration
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  Flag,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  PackageCheck,
  PackageSearch,
  Plus,
  ShieldCheck,
  TimerReset,
  Upload,
  UserX,
  UsersRound,
  Wrench,
} from "lucide-react";
import {
  ARGOSExecutiveButton,
  ARGOSExecutiveEmptyState,
  ARGOSExecutiveKPICard,
  ARGOSExecutivePageHeader,
  ARGOSExecutivePanel,
} from "../Shared/ExecutiveUI";
import "./ARGOS_Command_Center_Component.css";

const PIPELINE_STATUSES = [
  { status: "Waiting Parts", label: "Waiting Parts", tone: "green", Icon: PackageSearch },
  { status: "Awaiting Approval", label: "Awaiting Approval", tone: "blue", Icon: BadgeCheck },
  { status: "In Shop", label: "In Shop", tone: "amber", Icon: Wrench },
  { status: "At 3rd Party Shop", label: "Third Party", tone: "purple", Icon: Building2 },
  { status: "Awaiting QC", label: "Awaiting QC", tone: "teal", Icon: ShieldCheck },
  { status: "Ready for Pickup", label: "Ready Pickup", tone: "green", Icon: PackageCheck },
];

const ACTIVITY_ICONS = {
  green: CheckCircle2,
  blue: Activity,
  amber: Wrench,
};

function sameLocalDay(value, comparisonDate = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === comparisonDate.getFullYear() &&
    date.getMonth() === comparisonDate.getMonth() &&
    date.getDate() === comparisonDate.getDate()
  );
}

function timeAgo(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}


export default function CommandCenter({
  availability,
  readyAssets,
  unavailableAssets,
  totalAssets,
  waitingParts,
  criticalAssets,
  activeBoardAssets,
  assets = [],
  completedRepairRecords = [],
  statusHistoryEvents = [],
  technicianAnalytics,
  organizationName,
  selectedAsset,
  importStatus,
  csvInputRef,
  onAddAsset,
  onDownloadCSVTemplate,
  onImportCSV,
  onSelectCSV,
  onSelectAsset,
  getStatusClass,
  calculateDaysDown,
  formatRTS,
}) {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const dashboardData = useMemo(() => {
    const statusCount = (status) => activeBoardAssets.filter((asset) => asset.status === status).length;
    const noTechnician = activeBoardAssets.filter((asset) => {
      const technician = String(asset.technician || "").trim().toLowerCase();
      return !technician || technician === "unassigned";
    }).length;
    const missingRts = activeBoardAssets.filter((asset) => {
      const type = String(asset.rtsType || "").trim();
      return !type || type === "TBD" || type === "No RTS Established";
    }).length;
    const downOverThirty = activeBoardAssets.filter(
      (asset) => calculateDaysDown(asset.downSince, asset.status) > 30
    ).length;
    const warrantyOpportunities = activeBoardAssets.filter((asset) => {
      const status = String(asset.warrantyStatus || "").toLowerCase();
      return status && !["unknown", "not applicable", "none", "no"].includes(status);
    }).length;
    const todayCompleted = completedRepairRecords.filter((record) =>
      sameLocalDay(
        record.completedDate || record.completedDisplayDate || record.repairCompletedAt || record.statusEndedAt,
        currentTime
      )
    );
    const averageDaysDown = activeBoardAssets.length
      ? (
          activeBoardAssets.reduce(
            (sum, asset) => sum + calculateDaysDown(asset.downSince, asset.status),
            0
          ) / activeBoardAssets.length
        ).toFixed(1)
      : "0.0";
    const averageRepairDuration = completedRepairRecords.length
      ? (
          completedRepairRecords.reduce(
            (sum, record) => sum + Number(record.daysDownDisplay ?? record.finalDaysDown ?? 0),
            0
          ) / completedRepairRecords.length
        ).toFixed(1)
      : "0.0";
    const openWorkOrders = activeBoardAssets.filter((asset) =>
      String(asset.workOrderNumber || "").trim()
    ).length;

    const activity = [
      ...statusHistoryEvents.map((event) => ({
        id: `status-${event.id || event.unit}-${event.recordedAt || event.statusEndedAt}`,
        unit: event.unit || "Asset",
        description: event.newStatus === "Ready" ? "Returned to Ready" : `Entered ${event.newStatus || "a new status"}`,
        occurredAt: event.recordedAt || event.statusEndedAt,
        tone: event.newStatus === "Ready" ? "green" : "blue",
      })),
      ...completedRepairRecords.map((record) => ({
        id: `repair-${record.recordId || record.id || record.unit}-${record.completedDisplayDate || record.completedDate}`,
        unit: record.unit || "Asset",
        description: "Repair Completed",
        occurredAt: record.completedDisplayDate || record.completedDate || record.repairCompletedAt || record.statusEndedAt,
        tone: "amber",
      })),
    ]
      .filter((item) => item.occurredAt)
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
      .slice(0, 5);

    const technicianRows = (technicianAnalytics?.rows || [])
      .filter((row) => row.technicianKey !== "unassigned")
      .sort((a, b) => b.activeUnits - a.activeUnits)
      .slice(0, 4)
      .map((row) => ({
        ...row,
        waitingParts: activeBoardAssets.filter(
          (asset) =>
            String(asset.technician || "").trim().toLowerCase() ===
              String(row.technician || "").trim().toLowerCase() &&
            asset.status === "Waiting Parts"
        ).length,
        completedToday: todayCompleted.filter(
          (record) =>
            String(record.technician || "").trim().toLowerCase() ===
            String(row.technician || "").trim().toLowerCase()
        ).length,
      }));

    return {
      statusCount,
      noTechnician,
      missingRts,
      downOverThirty,
      warrantyOpportunities,
      todayCompleted: todayCompleted.length,
      averageDaysDown,
      averageRepairDuration,
      openWorkOrders,
      activity,
      technicianRows,
    };
  }, [activeBoardAssets, completedRepairRecords, currentTime, statusHistoryEvents, technicianAnalytics, calculateDaysDown]);

  const dateLabel = currentTime.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = currentTime.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="argos-command-center">
      <ARGOSExecutivePageHeader
        eyebrow="Operational Awareness"
        title="ARGOS Fleet Command Center"
        subtitle={organizationName || "Fleet Services"}
        actions={
          <>
            <ARGOSExecutiveButton variant="dark" icon={BriefcaseBusiness}>
              Workspace
            </ARGOSExecutiveButton>
            <div
              className="argos-command-clock"
              aria-label={`Current time ${timeLabel}, ${dateLabel}`}
            >
              <strong>
                <Clock3 size={16} strokeWidth={2.2} /> {timeLabel}
              </strong>
              <span>{dateLabel}</span>
            </div>
          </>
        }
      />

      <section className="argos-command-kpi-grid" aria-label="Fleet readiness metrics">
        <ARGOSExecutiveKPICard tone="green" icon={Gauge} label="Fleet Readiness" value={`${availability}%`} detail={`${readyAssets} ready of ${totalAssets}`} />
        <ARGOSExecutiveKPICard tone="blue" icon={CheckCircle2} label="Ready" value={readyAssets} detail="Available for service" />
        <ARGOSExecutiveKPICard tone="amber" icon={Wrench} label="Unavailable" value={unavailableAssets} detail={`${waitingParts} waiting parts`} />
        <ARGOSExecutiveKPICard tone="red" icon={AlertTriangle} label="Critical" value={criticalAssets} detail={criticalAssets ? "Immediate attention" : "No critical units"} />
      </section>

      <section className="argos-command-upper-grid">
        <ARGOSExecutivePanel
          title="Fleet Status Pipeline"
          icon={LayoutDashboard}
          meta={`${unavailableAssets} active`}
          className="argos-command-panel--pipeline"
        >
          <div className="argos-command-pipeline">
            {PIPELINE_STATUSES.map((item, index) => {
              const { Icon } = item;
              return (
                <div className="argos-command-pipeline__step-wrap" key={item.status}>
                  <button
                    type="button"
                    className={`argos-command-pipeline__step argos-command-tone--${item.tone}`}
                    onClick={() => {
                      const firstAsset = activeBoardAssets.find((asset) => asset.status === item.status);
                      if (firstAsset) onSelectAsset(firstAsset);
                    }}
                  >
                    <span className="argos-command-pipeline__icon" aria-hidden="true"><Icon size={21} strokeWidth={2.2} /></span>
                    <span>{item.label}</span>
                    <strong>{dashboardData.statusCount(item.status)}</strong>
                  </button>
                  {index < PIPELINE_STATUSES.length - 1 && <span className="argos-command-pipeline__arrow"><ArrowRight size={18} strokeWidth={2.1} /></span>}
                </div>
              );
            })}
          </div>
        </ARGOSExecutivePanel>

        <ARGOSExecutivePanel
          title="Operational Alerts"
          icon={AlertTriangle}
          meta="Live"
          tone="alert"
        >
          <div className="argos-command-alert-list">
            {[
              [Flag, "High Priority Repairs", criticalAssets, "red"],
              [TimerReset, "Units Down > 30 Days", dashboardData.downOverThirty, "amber"],
              [BadgeCheck, "Warranty Opportunities", dashboardData.warrantyOpportunities, "amber"],
              [UserX, "No Technician Assigned", dashboardData.noTechnician, "blue"],
              [CalendarClock, "Missing RTS Dates", dashboardData.missingRts, "blue"],
              [
                CheckCircle2,
                "Awaiting Approval",
                dashboardData.statusCount("Awaiting Approval"),
                "teal",
              ],
            ].map(([Icon, label, value, tone]) => (
              <div className="argos-command-alert" key={label}>
                <span
                  className={`argos-command-alert__icon argos-command-alert__icon--${tone}`}
                >
                  <Icon size={15} strokeWidth={2.2} />
                </span>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </ARGOSExecutivePanel>
      </section>

      <section className="argos-command-lower-grid">
        <ARGOSExecutivePanel
          title="Technician Operations"
          icon={UsersRound}
          meta={`${technicianAnalytics?.activeTechnicians || 0} active`}
        >
          {dashboardData.technicianRows.length ? (
            <div className="argos-command-technicians">
              {dashboardData.technicianRows.map((row) => {
                const capacity = Math.min(
                  100,
                  Math.round(
                    (row.activeUnits / Math.max(1, unavailableAssets)) * 400,
                  ),
                );

                return (
                  <div className="argos-command-technician" key={row.technicianKey}>
                    <strong className="argos-command-technician__name">
                      {row.technician}
                    </strong>
                    <dl>
                      <div><dt>Active Repairs</dt><dd>{row.activeUnits}</dd></div>
                      <div><dt>Waiting Parts</dt><dd>{row.waitingParts}</dd></div>
                      <div><dt>Completed Today</dt><dd>{row.completedToday}</dd></div>
                    </dl>
                    <div className="argos-command-capacity">
                      <span style={{ width: `${capacity}%` }} />
                    </div>
                    <small>{capacity}% workload index</small>
                  </div>
                );
              })}
            </div>
          ) : (
            <ARGOSExecutiveEmptyState
              icon={UsersRound}
              title="No technician workload available"
              description="Technician workload will appear after active repairs are assigned."
            />
          )}
        </ARGOSExecutivePanel>

        <ARGOSExecutivePanel
          title="Recent Activity"
          icon={Activity}
          meta="Latest"
        >
          {dashboardData.activity.length ? (
            <div className="argos-command-activity-list">
              {dashboardData.activity.map((item) => {
                const ActivityIcon = ACTIVITY_ICONS[item.tone] || Activity;

                return (
                  <div className="argos-command-activity" key={item.id}>
                    <span
                      className={`argos-command-activity__marker argos-command-activity__marker--${item.tone}`}
                    >
                      <ActivityIcon size={14} strokeWidth={2.4} />
                    </span>
                    <div>
                      <strong>{item.unit}</strong>
                      <span>{item.description}</span>
                    </div>
                    <time>{timeAgo(item.occurredAt, currentTime)}</time>
                  </div>
                );
              })}
            </div>
          ) : (
            <ARGOSExecutiveEmptyState
              icon={Activity}
              title="No recent activity"
              description="Status changes and completed repairs will appear here."
            />
          )}
        </ARGOSExecutivePanel>

        <ARGOSExecutivePanel
          title="Fleet Health"
          icon={HeartPulse}
          meta="Current"
        >
          <div className="argos-command-health-grid">
            <div>
              <span>Fleet Availability</span>
              <strong>{availability}%</strong>
              <small>Current readiness</small>
            </div>
            <div>
              <span>Avg. Days Down</span>
              <strong>{dashboardData.averageDaysDown}</strong>
              <small>Open repairs</small>
            </div>
            <div>
              <span>Completed Today</span>
              <strong>{dashboardData.todayCompleted}</strong>
              <small>Repair events</small>
            </div>
            <div>
              <span>Avg. Repair Duration</span>
              <strong>
                {dashboardData.averageRepairDuration}
                <em> days</em>
              </strong>
              <small>Historical average</small>
            </div>
            <div>
              <span>Warranty Repairs</span>
              <strong>{dashboardData.warrantyOpportunities}</strong>
              <small>Open opportunities</small>
            </div>
            <div>
              <span>Open Work Orders</span>
              <strong>{dashboardData.openWorkOrders}</strong>
              <small>With WO number</small>
            </div>
          </div>
        </ARGOSExecutivePanel>
      </section>

      <section className="status-board argos-command-status-board">
        <div className="status-board-header">
          <div>
            <p className="eyebrow argos-command-status-eyebrow"><ClipboardList size={13} strokeWidth={2.3} /> Live Status Board</p>
            <h3>Assets Requiring Visibility</h3>
          </div>
          <div className="argos-command-board-actions">
            <button type="button" onClick={onAddAsset}><Plus size={15} strokeWidth={2.2} /> Add Asset</button>{" "}
            <button type="button" onClick={onDownloadCSVTemplate}><Download size={15} strokeWidth={2.2} /> Download CSV Template</button>{" "}
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={onImportCSV} style={{ display: "none" }} />
            <button type="button" onClick={onSelectCSV}><Upload size={15} strokeWidth={2.2} /> Import CSV</button>{" "}
          </div>
        </div>

        {importStatus && <p className="eyebrow">{importStatus}</p>}

        <div className="argos-command-table-scroll">
          <table>
            <thead>
              <tr><th>Unit</th><th>Department</th><th>Asset</th><th>Status</th><th>Reason</th><th>Priority</th><th>Days Down</th><th>Technician</th><th>RTS</th><th>Details</th></tr>
            </thead>
            <tbody>
              {activeBoardAssets.length === 0 ? (
                <tr><td colSpan="10">No assets currently require visibility. Ready assets are not shown on the Command Center.</td></tr>
              ) : (
                activeBoardAssets.map((asset) => (
                  <tr key={asset.unit} onClick={() => onSelectAsset(asset)} className={selectedAsset?.unit === asset.unit ? "selected-row" : ""}>
                    <td className="unit">{asset.unit}</td><td>{asset.department}</td><td>{asset.asset}</td>
                    <td><span className={`status-pill ${getStatusClass(asset.status)}`}>{asset.status}</span></td>
                    <td>{asset.reason}</td><td className={String(asset.priority || "").toLowerCase()}>{asset.priority}</td>
                    <td>{calculateDaysDown(asset.downSince, asset.status)}</td><td>{asset.technician}</td><td>{formatRTS(asset)}</td><td>{asset.details}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
