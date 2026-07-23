import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import {
  ARGOS_ROLES,
  ARGOS_ROLE_OPTIONS,
  normalizeArgosRole,
} from "../../utils/ARGOS_Roles";
import "./ARGOS_Roles_Administration_Module.css";

const ROLE_GOVERNANCE = Object.freeze({
  [ARGOS_ROLES.ADMINISTRATOR]: {
    description:
      "Full organization administration authority, including identity, configuration, and protected account operations.",
    scope: "Organization-wide",
    accessLevel: "Full Control",
  },
  [ARGOS_ROLES.MANAGER]: {
    description:
      "Operational management authority with controlled access to users, technicians, and permitted administration workspaces.",
    scope: "Operational management",
    accessLevel: "Limited Administration",
  },
  [ARGOS_ROLES.USER]: {
    description:
      "Standard authenticated access for approved ARGOS operational workflows without administration authority.",
    scope: "Assigned workflows",
    accessLevel: "Standard Access",
  },
  [ARGOS_ROLES.TECHNICIAN]: {
    description:
      "Maintenance-focused access for technician workflows without organization administration authority.",
    scope: "Maintenance operations",
    accessLevel: "Technician Access",
  },
});

const PERMISSION_ROWS = Object.freeze([
  {
    label: "View Administration",
    description: "Open the ARGOS Administration workspace.",
    roles: [ARGOS_ROLES.ADMINISTRATOR, ARGOS_ROLES.MANAGER],
  },
  {
    label: "View Users",
    description: "Review organization-scoped user records.",
    roles: [ARGOS_ROLES.ADMINISTRATOR, ARGOS_ROLES.MANAGER],
  },
  {
    label: "Invite Users",
    description: "Send secure organization user invitations.",
    roles: [ARGOS_ROLES.ADMINISTRATOR],
  },
  {
    label: "Change User Roles",
    description: "Assign a different protected ARGOS system role.",
    roles: [ARGOS_ROLES.ADMINISTRATOR],
  },
  {
    label: "Suspend or Restore Users",
    description: "Control account status subject to administrator safeguards.",
    roles: [ARGOS_ROLES.ADMINISTRATOR],
  },
  {
    label: "Manage Departments",
    description: "Create and maintain organization departments.",
    roles: [ARGOS_ROLES.ADMINISTRATOR],
  },
  {
    label: "Manage Technicians",
    description: "Maintain technician records and operational assignments.",
    roles: [ARGOS_ROLES.ADMINISTRATOR, ARGOS_ROLES.MANAGER],
  },
  {
    label: "Manage Asset Types",
    description: "Maintain controlled fleet asset classifications.",
    roles: [ARGOS_ROLES.ADMINISTRATOR],
  },
  {
    label: "Manage Status Configuration",
    description: "Maintain controlled fleet status definitions.",
    roles: [ARGOS_ROLES.ADMINISTRATOR],
  },
]);

const DEMO_ROLE_COUNTS = Object.freeze({
  [ARGOS_ROLES.ADMINISTRATOR]: 1,
  [ARGOS_ROLES.MANAGER]: 1,
  [ARGOS_ROLES.USER]: 0,
  [ARGOS_ROLES.TECHNICIAN]: 1,
});

function RolesState({ children, error = false }) {
  return (
    <div className={`argos-roles-state${error ? " error" : ""}`}>
      {children}
    </div>
  );
}

export default function ARGOSRolesAdministrationModule({ isDemoMode }) {
  const [roleCounts, setRoleCounts] = useState(
    isDemoMode ? DEMO_ROLE_COUNTS : {},
  );
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (isDemoMode) {
      setRoleCounts(DEMO_ROLE_COUNTS);
      setIsLoading(false);
      setErrorMessage("");
      return undefined;
    }

    async function loadRoleCounts() {
      setIsLoading(true);
      setErrorMessage("");

      const {
        data: { user: authenticatedUser },
        error: authenticationError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (authenticationError || !authenticatedUser) {
        setRoleCounts({});
        setErrorMessage("ARGOS could not verify the signed-in user.");
        setIsLoading(false);
        return;
      }

      const { data: currentProfile, error: currentProfileError } =
        await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", authenticatedUser.id)
          .single();

      if (!isMounted) return;

      if (currentProfileError || !currentProfile?.organization_id) {
        console.error(
          "ARGOS role organization lookup failed:",
          currentProfileError,
        );
        setRoleCounts({});
        setErrorMessage("ARGOS could not resolve the current organization.");
        setIsLoading(false);
        return;
      }

      const { data: organizationProfiles, error: profilesError } =
        await supabase
          .from("profiles")
          .select("role")
          .eq("organization_id", currentProfile.organization_id);

      if (!isMounted) return;

      if (profilesError) {
        console.error("ARGOS role count lookup failed:", profilesError);
        setRoleCounts({});
        setErrorMessage(
          "ARGOS could not load organization role assignments through the current security policy.",
        );
        setIsLoading(false);
        return;
      }

      const nextRoleCounts = ARGOS_ROLE_OPTIONS.reduce(
        (counts, roleOption) => ({ ...counts, [roleOption.value]: 0 }),
        {},
      );

      (organizationProfiles || []).forEach((profile) => {
        const normalizedRole = normalizeArgosRole(profile.role);
        if (normalizedRole) {
          nextRoleCounts[normalizedRole] =
            (nextRoleCounts[normalizedRole] || 0) + 1;
        }
      });

      setRoleCounts(nextRoleCounts);
      setIsLoading(false);
    }

    loadRoleCounts();

    return () => {
      isMounted = false;
    };
  }, [isDemoMode]);

  const totalAssignments = useMemo(
    () =>
      Object.values(roleCounts).reduce(
        (total, count) => total + Number(count || 0),
        0,
      ),
    [roleCounts],
  );


  return (
    <div className="argos-roles-content">
      <div className="argos-roles-heading">
        <div>
          <h4>Roles</h4>
          <p>
            Review organization role assignments and the administration capabilities available to each ARGOS role.
          </p>
        </div>
        <span className="argos-roles-mode">Read-Only Governance</span>
      </div>

      <div className="argos-roles-summary">
        <div>
          <span>System Roles</span>
          <strong>{ARGOS_ROLE_OPTIONS.length}</strong>
        </div>
        <div>
          <span>Assigned Users</span>
          <strong>{isLoading ? "—" : totalAssignments}</strong>
        </div>
        <div>
          <span>Custom Roles</span>
          <strong>0</strong>
        </div>
        <div>
          <span>Governance Status</span>
          <strong>Protected</strong>
        </div>
      </div>

      {isLoading ? (
        <RolesState>Loading organization role assignments…</RolesState>
      ) : errorMessage ? (
        <RolesState error>{errorMessage}</RolesState>
      ) : null}


      <section className="argos-roles-overview" aria-label="ARGOS role assignment overview">
        <div className="argos-roles-section-heading">
          <div>
            <h5>Role Assignment Overview</h5>
            <p>Current system roles and organization assignments.</p>
          </div>
          <span>{ARGOS_ROLE_OPTIONS.length} System Roles</span>
        </div>

        <div className="argos-roles-overview-table-wrap">
          <table className="argos-roles-overview-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Access Level</th>
                <th>Operational Scope</th>
                <th>Assigned Users</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ARGOS_ROLE_OPTIONS.map((roleOption) => {
                const governance = ROLE_GOVERNANCE[roleOption.value];

                return (
                  <tr key={roleOption.value}>
                    <td>
                      <strong>{roleOption.label}</strong>
                      <span>{governance.description}</span>
                    </td>
                    <td>{governance.accessLevel}</td>
                    <td>{governance.scope}</td>
                    <td>
                      <b>{roleCounts[roleOption.value] || 0}</b>
                    </td>
                    <td>
                      <span className="argos-role-status">System</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="argos-roles-permissions">
        <div className="argos-roles-section-heading">
          <div>
            <h5>Administration Permission Matrix</h5>
            <p>Read-only visibility into the capabilities assigned to each system role.</p>
          </div>
          <span>Read Only</span>
        </div>

        <div className="argos-roles-table-wrap">
          <table className="argos-roles-table">
            <thead>
              <tr>
                <th>Capability</th>
                {ARGOS_ROLE_OPTIONS.map((roleOption) => (
                  <th key={roleOption.value}>{roleOption.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_ROWS.map((permission) => (
                <tr key={permission.label}>
                  <td>
                    <strong>{permission.label}</strong>
                    <span>{permission.description}</span>
                  </td>
                  {ARGOS_ROLE_OPTIONS.map((roleOption) => {
                    const permitted = permission.roles.includes(roleOption.value);
                    return (
                      <td key={roleOption.value}>
                        <span
                          className={`argos-role-permission ${
                            permitted ? "allowed" : "restricted"
                          }`}
                          aria-label={permitted ? "Allowed" : "Restricted"}
                        >
                          {permitted ? "Allowed" : "Restricted"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="argos-roles-foundation-note">
        <strong>Role assignments are managed through Organization Users</strong>
        <span>
          System role definitions are read-only in Version 1.0. Existing administrator protections remain active.
        </span>
      </div>
    </div>
  );
}
