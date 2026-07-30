import { useEffect, useState } from "react";
import ARGOSOperationsNavigation from "./ARGOS_Operations_Navigation_Blue_Shield_Reference_001U";
import ARGOSLogo from "../../assets/Argos_Logo_Official.png";
import "./ARGOS_Application_Shell.css";

function ARGOSApplicationShell({
  activeView,
  availability,
  assignedToMeAssets,
  criticalAssets,
  fieldCurrentTime,
  fieldQueueMode,
  getFieldGreeting,
  hasAdministrationAccess,
  isDemoMode,
  onNavigate,
  onOpenDailySummary,
  onOpenFieldView,
  onOpenVinScanner,
  onReturnFieldHome,
  onSignOut,
  organizationName,
  profile,
  readyForPickupAssets,
  session,
  showFieldHome,
  unitsAwaitingMeAssets,
  userName,
  userRole,
  versionLabel = "Version 1.0",
  waitingParts,
  awaitingQcAssets,
  children,
}) {
  const [isMobileExperience, setIsMobileExperience] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 760px)").matches : false
  );

  useEffect(() => {
    const mobileMediaQuery = window.matchMedia("(max-width: 760px)");

    const handleViewportChange = (event) => {
      setIsMobileExperience(event.matches);
    };

    setIsMobileExperience(mobileMediaQuery.matches);
    mobileMediaQuery.addEventListener("change", handleViewportChange);

    return () => {
      mobileMediaQuery.removeEventListener("change", handleViewportChange);
    };
  }, []);

  return (
    <main className={`argos-shell ${showFieldHome ? "argos-field-home-active" : "argos-field-workspace-active"}${!showFieldHome && activeView === "command" ? " argos-command-center-mobile" : ""}`}>
      <section className="argos-field-home" aria-label="ARGOS Field mobile workspace">
        <header className="argos-field-hero">
          <img
            src={ARGOSLogo}
            alt="ARGOS Fleet Operations Platform"
            className="argos-field-logo"
          />
          <p className="argos-field-mobile-label">Mobile Operations</p>
        </header>

        <section className="argos-field-status-row" aria-label="ARGOS Field status">
          <p className="argos-field-greeting">
            {getFieldGreeting(fieldCurrentTime)}, {profile?.full_name?.split(" ")?.[0] || "Operator"}.
          </p>
          <div className="argos-field-availability" aria-label={`${availability}% fleet availability`}>
            <span>Availability</span>
            <strong>{availability}%</strong>
          </div>
        </section>

        {isDemoMode && <p className="argos-field-demo-badge">Demo environment · fictional fleet data</p>}

        <section className="argos-field-priority-strip" aria-label="Technician work metrics">
          <article><span>Assigned to Me</span><strong>{assignedToMeAssets.length}</strong></article>
          <article className="critical"><span>Critical</span><strong>{criticalAssets}</strong></article>
          <article><span>Waiting Parts</span><strong>{waitingParts}</strong></article>
          <article><span>Awaiting QC</span><strong>{awaitingQcAssets.length}</strong></article>
          <article><span>Ready Pickup</span><strong>{readyForPickupAssets.length}</strong></article>
        </section>

        <section className="argos-field-primary-workflow" aria-label="Primary technician action">
          <button className="argos-field-scan-button" type="button" onClick={onOpenVinScanner}>
            <span className="argos-field-scan-icon">▣</span>
            <span><strong>Scan VIN</strong><small>Identify a vehicle and open its record</small></span>
            <b>›</b>
          </button>
        </section>

        <div className="argos-field-actions">
          <button className="argos-field-action argos-field-action-emphasis" type="button" onClick={() => onOpenFieldView("fleet", { resetFleet: true, fieldQueueMode: "assigned" })}>
            <span className="argos-field-action-icon">✓</span>
            <span><strong>My Assigned Work</strong><small>{assignedToMeAssets.length} vehicles currently assigned to your technician record</small></span>
            <b>›</b>
          </button>
          <button className="argos-field-action" type="button" onClick={() => onOpenFieldView("fleet", { resetFleet: true, fieldQueueMode: "awaiting" })}>
            <span className="argos-field-action-icon">!</span>
            <span><strong>Units Awaiting Me</strong><small>{unitsAwaitingMeAssets.length} assigned units require action</small></span>
            <b>›</b>
          </button>
          <button className="argos-field-action" type="button" onClick={() => onOpenFieldView("fleet", { resetFleet: true })}>
            <span className="argos-field-action-icon">⌕</span>
            <span><strong>Find Vehicle</strong><small>Search the complete fleet by unit number</small></span>
            <b>›</b>
          </button>
        </div>

        <footer className="argos-field-footer">
          <div><span>Signed in as</span><strong>{profile?.full_name || session?.user?.email || "ARGOS Demo Visitor"}</strong></div>
          <button type="button" onClick={onSignOut}>{isDemoMode ? "Exit Demo" : "Log Out"}</button>
        </footer>
      </section>

      <header className="argos-field-workspace-header">
        <button type="button" onClick={onReturnFieldHome} aria-label="Return to ARGOS Field home">‹</button>
        <div>
          <strong>ARGOS Field</strong>
          <span>{activeView === "fleet" && fieldQueueMode === "assigned" ? "My Assigned Work" : activeView === "fleet" && fieldQueueMode === "awaiting" ? "Units Awaiting Me" : activeView === "fleet" ? "Find Vehicle" : "Vehicle Record"}</span>
        </div>
        <button type="button" onClick={onOpenVinScanner} aria-label="Scan VIN">▣</button>
      </header>

      {!isMobileExperience && (
        <ARGOSOperationsNavigation
          activeView={activeView}
          onNavigate={onNavigate}
          onOpenDailySummary={onOpenDailySummary}
          onSignOut={onSignOut}
          hasAdministrationAccess={hasAdministrationAccess}
          isDemoMode={isDemoMode}
          organizationName={organizationName}
          userName={userName}
          userRole={userRole}
          versionLabel={versionLabel}
        />
      )}

      <section className="dashboard">{children}</section>
    </main>
  );
}

export default ARGOSApplicationShell;
