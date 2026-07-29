import ARGOSUsersAdministrationModule from "./ARGOS_Users_Administration_Module";
import ARGOSRolesAdministrationModule from "./ARGOS_Roles_Administration_Module";
import ARGOSDepartmentsAdministrationModule from "./ARGOS_Departments_Administration_Module";
import ARGOSAssetTypesAdministrationModule from "./ARGOS_Asset_Types_Administration_Module";
import "./ARGOS_VMRS_Configuration_Administration_Module.css";
import ARGOSStatusConfigurationAdministrationModule from "./ARGOS_Status_Configuration_Administration_Module";
import ARGOSReasonConfigurationAdministrationModule from "./ARGOS_Reason_Configuration_Administration_Module";
import ARGOSTechniciansAdministrationModule from "./ARGOS_Technicians_Administration_Module";
import ARGOSAPWAMappingAdministrationModule from "./ARGOS_APWA_Mapping_Administration_Module";
import ARGOSVMRSConfigurationAdministrationModule from "./ARGOS_VMRS_Configuration_Administration_Module";
import ARGOSArchivedAssetsAdministrationModule from "./ARGOS_Archived_Assets_Administration_Module";
import ARGOSAuditLogAdministrationModule from "./ARGOS_Audit_Log_Administration_Module";
import ARGOSReleaseNotesAdministrationModule from "./ARGOS_Release_Notes_Administration_Module";
import ARGOSDataManagementModule from "../DataManagement/ARGOS_Data_Management_Module";
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

function OrganizationProfileWorkspace({
  organizationProfile,
  organizationProfileLoading,
  organizationProfileError,
}) {
  const organizationName =
    organizationProfile?.name ||
    organizationProfile?.fleet_name ||
    "Organization";

  return (
    <div className="organization-profile-content">
      {organizationProfileLoading ? (
        <div className="organization-profile-state">Loading organization profile…</div>
      ) : organizationProfileError ? (
        <div className="organization-profile-state error">{organizationProfileError}</div>
      ) : organizationProfile ? (
        <div className="organization-profile-heading">
          <div>
            <p className="eyebrow">Organization Administration</p>
            <h4>Organization Profile</h4>
            <p className="organization-profile-description">
              {organizationName}
            </p>
          </div>
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
  csvImport,
  assets = [],
  canManageAssets = false,
  onAssetRestored,
  dataManagementOrganizationId,
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

  const organizationId =
    dataManagementOrganizationId ||
    organizationProfile?.id ||
    organizationProfile?.organization_id ||
    authorizationUser?.organization_id ||
    authorizationUser?.organizationId ||
    null;

  const isOrganizationProfile = activeSection === "Organization Profile";
  const isUsersSection = activeSection === "Users";
  const isRolesSection = activeSection === "Roles";
  const isDepartmentsSection = activeSection === "Departments";
  const isAssetTypesSection = activeSection === "Asset Types";
  const isStatusConfigurationSection = activeSection === "Status Configuration";
  const isReasonConfigurationSection = activeSection === "Reason Configuration";
  const isTechniciansSection = activeSection === "Technicians";
  const isAPWAMappingSection = activeSection === "APWA Mapping";
  const isVMRSConfigurationSection = activeSection === "VMRS Configuration";
  const isCSVImportSection = activeSection === "CSV Import";
  const isCSVExportSection = activeSection === "CSV Export";
  const isImportHistorySection = activeSection === "Import History";
  const isArchivedAssetsSection = activeSection === "Archived Assets";
  const isAuditLogSection = activeSection === "Audit Log";
  const isReleaseNotesSection = activeSection === "Release Notes";
  const isDataManagementSection =
    isCSVImportSection || isCSVExportSection || isImportHistorySection;

  function getSectionDisplayName(item) {
    if (item === "VMRS Configuration") return "VMRS Catalog Management";
    if (item === "Users") return "User Management";
    if (item === "Roles") return "Role Assignment";
    if (item === "Departments") return "Fleet Departments";
    return item;
  }

  function getSectionLabel() {
    return null;
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
                  <span>{getSectionDisplayName(item)}</span>
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
              <h3>{getSectionDisplayName(activeSection)}</h3>
            </div>
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
          ) : isRolesSection ? (
            <ARGOSRolesAdministrationModule isDemoMode={isDemoMode} />
          ) : isDepartmentsSection ? (
            <ARGOSDepartmentsAdministrationModule isDemoMode={isDemoMode} />
          ) : isAssetTypesSection ? (
            <ARGOSAssetTypesAdministrationModule isDemoMode={isDemoMode} />
          ) : isStatusConfigurationSection ? (
            <ARGOSStatusConfigurationAdministrationModule isDemoMode={isDemoMode} />
          ) : isReasonConfigurationSection ? (
            <ARGOSReasonConfigurationAdministrationModule isDemoMode={isDemoMode} />
          ) : isTechniciansSection ? (
            <ARGOSTechniciansAdministrationModule isDemoMode={isDemoMode} />
          ) : isAPWAMappingSection ? (
            <ARGOSAPWAMappingAdministrationModule isDemoMode={isDemoMode} />
          ) : isVMRSConfigurationSection ? (
            <ARGOSVMRSConfigurationAdministrationModule isDemoMode={isDemoMode} />
          ) : isDataManagementSection ? (
            <ARGOSDataManagementModule
              csvImport={csvImport}
              assets={assets}
              organizationId={organizationId}
              canManageAssets={canManageAssets}
              onAssetRestored={onAssetRestored}
              isDemoMode={isDemoMode}
              activeSection={activeSection}
              embeddedInAdministration
            />
          ) : isArchivedAssetsSection ? (
            <ARGOSArchivedAssetsAdministrationModule
              organizationId={organizationId}
              isDemoMode={isDemoMode}
            />
          ) : isAuditLogSection ? (
            <ARGOSAuditLogAdministrationModule
              organizationId={organizationId}
              isDemoMode={isDemoMode}
            />
          ) : isReleaseNotesSection ? (
            <ARGOSReleaseNotesAdministrationModule />
          ) : (
            <PlannedAdministrationWorkspace section={activeSection} />
          )}
        </article>
      </section>
    </>
  );
}
