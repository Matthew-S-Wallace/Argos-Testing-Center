import ARGOSUsersAdministrationModule from "./ARGOS_Users_Administration_Module";
import ARGOSDepartmentsAdministrationModule from "./ARGOS_Departments_Administration_Module";
import "./ARGOS_VMRS_Configuration_Administration_Module.css";
import ARGOSStatusConfigurationAdministrationModule from "./ARGOS_Status_Configuration_Administration_Module";
import ARGOSTechniciansAdministrationModule from "./ARGOS_Technicians_Administration_Module";
import ARGOSAPWAMappingAdministrationModule from "./ARGOS_APWA_Mapping_Administration_Module";
import ARGOSVMRSConfigurationAdministrationModule from "./ARGOS_VMRS_Configuration_Administration_Module";
import {
  canViewAdministration,
  canViewAdministrationSection,
} from "../../utils/ARGOS_Permission_Resolver";

const ADMINISTRATION_GROUPS = [
  {
    label: "Organization",
    items: ["Organization Profile", "Users", "Roles", "Departments", "Technicians"],
  },
  {
    label: "Fleet Configuration",
    items: [
      "Asset Types",
      "Status Configuration",
      "Reason Configuration",
      "APWA Mapping",
      "VMRS Configuration",
    ],
  },
  {
    label: "Data Management",
    items: ["CSV Import", "CSV Export", "Import History", "Archived Assets"],
  },
  {
    label: "System",
    items: ["Audit Log", "Release Notes", "Help & Support"],
  },
];

const ORGANIZATION_PROFILE_FIELDS = [
  ["Organization Name", "name"],
  ["Fleet / Display Name", "fleet_name"],
  ["Primary Contact", "primary_contact_name"],
  ["Contact Email", "contact_email"],
  ["Contact Phone", "contact_phone"],
  ["Address Line 1", "address_line_1"],
  ["Address Line 2", "address_line_2"],
  ["City", "city"],
  ["State", "state"],
  ["ZIP / Postal Code", "postal_code"],
  ["Time Zone", "time_zone"],
];

function OrganizationProfileWorkspace({
  organizationProfile,
  organizationProfileLoading,
  organizationProfileError,
}) {
  return (
    <div className="organization-profile-content">
      <div className="organization-profile-heading">
        <div>
          <p className="eyebrow">Organization Record</p>
          <h4>Agency and Fleet Information</h4>
        </div>
      </div>

      {organizationProfileLoading ? (
        <div className="organization-profile-state">Loading organization profile…</div>
      ) : organizationProfileError ? (
        <div className="organization-profile-state error">{organizationProfileError}</div>
      ) : organizationProfile ? (
        <div className="organization-profile-grid">
          {ORGANIZATION_PROFILE_FIELDS.map(([label, field]) => (
            <div className="organization-profile-field" key={field}>
              <span>{label}</span>
              <strong>{organizationProfile[field] || "Not configured"}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="organization-profile-state">
          No organization profile is available for this account.
        </div>
      )}
    </div>
  );
}

function AdministrationAccessDenied({ message }) {
  return (
    <div className="administration-content-body">
      <div className="administration-placeholder-icon" aria-hidden="true">🔒</div>
      <h4>Access Restricted</h4>
      <p>{message}</p>
      <div className="administration-foundation-note">
        <strong>Role authorization required</strong>
        <span>
          ARGOS prevented this Administration workspace from rendering for the current account.
        </span>
      </div>
    </div>
  );
}

function PlannedAdministrationWorkspace({ section }) {
  return (
    <div className="administration-content-body">
      <div className="administration-placeholder-icon">⚙</div>
      <h4>{section}</h4>
      <p>
        This workspace is reserved for the {section} configuration feature. Its controls,
        Supabase data connection, validation, and permissions will be added during the assigned
        Version 1.0 sprint.
      </p>
      <div className="administration-foundation-note">
        <strong>Administration framework active</strong>
        <span>
          Navigation and content routing are ready. No operational data or existing ARGOS
          functionality has been changed.
        </span>
      </div>
    </div>
  );
}

export default function AdministrationModule({
  activeSection,
  onSelectSection,
  isDemoMode,
  organizationProfile,
  organizationProfileLoading,
  organizationProfileError,
  currentUser,
  userProfile,
  profile,
  user,
}) {
  const authorizationUser = currentUser || userProfile || profile || user || null;
  const canAccessAdministration =
    isDemoMode || canViewAdministration(authorizationUser);
  const canAccessActiveSection = canViewAdministrationSection(
    authorizationUser,
    activeSection,
    isDemoMode
  );

  const isOrganizationProfile = activeSection === "Organization Profile";
  const isUsersSection = activeSection === "Users";
  const isDepartmentsSection = activeSection === "Departments";
  const isAssetTypesSection = activeSection === "Asset Types";
  const isStatusConfigurationSection = activeSection === "Status Configuration";
  const isTechniciansSection = activeSection === "Technicians";
  const isAPWAMappingSection = activeSection === "APWA Mapping";
  const isVMRSConfigurationSection = activeSection === "VMRS Configuration";

  function getSectionLabel(item) {
    if (
      item === "Organization Profile" ||
      item === "Users" ||
      item === "Departments" ||
      item === "Asset Types" ||
      item === "Status Configuration" ||
      item === "Technicians" ||
      item === "APWA Mapping" ||
      item === "VMRS Configuration"
    ) {
      return null;
    }

    return "Planned";
  }

  function getWorkspaceStatus() {
    if (isOrganizationProfile) return "Live Profile";
    if (isUsersSection) return "Live Users";
    if (isDepartmentsSection) return "Live Departments";
    if (isAssetTypesSection) return "Live Asset Types";
    if (isStatusConfigurationSection) return "Live Status Configuration";
    if (isTechniciansSection) return "Live Technicians";
    if (isAPWAMappingSection) return "Live APWA Mapping";
    if (isVMRSConfigurationSection) return "Live VMRS Configuration";
    return "Framework Ready";
  }

  if (!canAccessAdministration) {
    return (
      <AdministrationAccessDenied message="You do not have permission to access ARGOS Administration." />
    );
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">System Administration</p>
          <h2>Administration</h2>
        </div>

        <div className="refresh-box">
          <span>Configuration Areas</span>
          <strong>17</strong>
        </div>
      </header>

      <section className="administration-workspace">
        <aside className="administration-menu" aria-label="Administration sections">
          {ADMINISTRATION_GROUPS.map((group) => (
            <div className="administration-menu-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => (
                <button
                  className={`administration-menu-item ${activeSection === item ? "active" : ""}`}
                  type="button"
                  key={item}
                  onClick={() => onSelectSection(item)}
                >
                  <span>{item}</span>
                  {getSectionLabel(item) && <small>{getSectionLabel(item)}</small>}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <article className="administration-content">
          <div className="administration-content-header">
            <div>
              <p className="eyebrow">Administration Workspace</p>
              <h3>{activeSection}</h3>
            </div>
            <span className="administration-status">{getWorkspaceStatus()}</span>
          </div>

          {!canAccessActiveSection ? (
            <AdministrationAccessDenied message="You do not have permission to access this Administration workspace." />
          ) : isOrganizationProfile ? (
            <OrganizationProfileWorkspace
              organizationProfile={organizationProfile}
              organizationProfileLoading={organizationProfileLoading}
              organizationProfileError={organizationProfileError}
            />
          ) : isUsersSection ? (
            <ARGOSUsersAdministrationModule isDemoMode={isDemoMode} />
          ) : isDepartmentsSection ? (
            <ARGOSDepartmentsAdministrationModule isDemoMode={isDemoMode} />
          ) : isAssetTypesSection ? (
            <ARGOSAssetTypesAdministrationModule isDemoMode={isDemoMode} />
          ) : isStatusConfigurationSection ? (
            <ARGOSStatusConfigurationAdministrationModule isDemoMode={isDemoMode} />
          ) : isTechniciansSection ? (
            <ARGOSTechniciansAdministrationModule isDemoMode={isDemoMode} />
          ) : isAPWAMappingSection ? (
            <ARGOSAPWAMappingAdministrationModule isDemoMode={isDemoMode} />
          ) : isVMRSConfigurationSection ? (
            <ARGOSVMRSConfigurationAdministrationModule isDemoMode={isDemoMode} />
          ) : (
            <PlannedAdministrationWorkspace section={activeSection} />
          )}
        </article>
      </section>
    </>
  );
}
