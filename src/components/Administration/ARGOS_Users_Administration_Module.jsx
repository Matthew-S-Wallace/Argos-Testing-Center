import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./ARGOS_Users_Administration_Module.css";

const DEMO_USERS = [
  {
    id: "demo-admin",
    fullName: "Demo Administrator",
    email: "demo@argos.local",
    role: "Administrator",
    department: "Fleet Administration",
    jobTitle: "System Administrator",
    phone: "Not configured",
    status: "Active",
    lastLogin: "Demo session",
    createdDate: "Jul 10, 2026",
  },
  {
    id: "demo-manager",
    fullName: "Operations Manager",
    email: "Not available",
    role: "Manager",
    department: "Public Works",
    jobTitle: "Fleet Operations Manager",
    phone: "Not configured",
    status: "Active",
    lastLogin: "Not yet recorded",
    createdDate: "Jul 10, 2026",
  },
  {
    id: "demo-technician",
    fullName: "Fleet Technician",
    email: "Not available",
    role: "Technician",
    department: "Fleet Maintenance",
    jobTitle: "Automotive Technician",
    phone: "Not configured",
    status: "Active",
    lastLogin: "Not yet recorded",
    createdDate: "Jul 10, 2026",
  },
];

function formatRole(role) {
  if (!role) return "Not assigned";

  const normalizedRole = String(role).trim().toLowerCase();

  const roleLabels = {
    admin: "Administrator",
    administrator: "Administrator",
    manager: "Manager",
    user: "User",
    technician: "Technician",
    demo: "Demo",
  };

  return (
    roleLabels[normalizedRole] ||
    String(role)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

function formatDateTime(value, fallback = "Not yet recorded") {
  if (!value) return fallback;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value, fallback = "Not available") {
  if (!value) return fallback;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function UsersState({ children, error = false }) {
  return (
    <div className={`argos-users-state${error ? " error" : ""}`}>
      {children}
    </div>
  );
}

export default function ARGOSUsersAdministrationModule({ isDemoMode }) {
  const [users, setUsers] = useState(isDemoMode ? DEMO_USERS : []);
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (isDemoMode) {
      setUsers(DEMO_USERS);
      setIsLoading(false);
      setErrorMessage("");
      return undefined;
    }

    async function loadOrganizationUsers() {
      setIsLoading(true);
      setErrorMessage("");

      const {
        data: { user: authenticatedUser },
        error: authenticationError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (authenticationError || !authenticatedUser) {
        setUsers([]);
        setErrorMessage("ARGOS could not verify the signed-in user.");
        setIsLoading(false);
        return;
      }

      const { data: currentProfile, error: currentProfileError } = await supabase
        .from("profiles")
        .select("id, organization_id")
        .eq("id", authenticatedUser.id)
        .single();

      if (!isMounted) return;

      if (currentProfileError || !currentProfile?.organization_id) {
        console.error("ARGOS current user profile lookup failed:", currentProfileError);
        setUsers([]);
        setErrorMessage("ARGOS could not resolve the current organization.");
        setIsLoading(false);
        return;
      }

      const { data: organizationProfiles, error: organizationProfilesError } = await supabase
        .from("profiles")
        .select(
          `
            id,
            full_name,
            role,
            is_active,
            department_id,
            job_title,
            phone,
            last_login,
            created_at,
            departments (
              department_name
            )
          `
        )
        .eq("organization_id", currentProfile.organization_id)
        .order("full_name", { ascending: true });

      if (!isMounted) return;

      if (organizationProfilesError) {
        console.error(
          "ARGOS organization users lookup failed:",
          organizationProfilesError
        );
        setUsers([]);
        setErrorMessage(
          "ARGOS could not load organization users through the current security policy."
        );
        setIsLoading(false);
        return;
      }

      const normalizedUsers = (organizationProfiles || []).map((profile) => ({
        id: profile.id,
        fullName: profile.full_name || "Unnamed User",
        email:
          profile.id === authenticatedUser.id
            ? authenticatedUser.email || "Not available"
            : "Protected by Supabase Auth",
        role: formatRole(profile.role),
        department: profile.departments?.department_name || "Not assigned",
        jobTitle: profile.job_title || "Not configured",
        phone: profile.phone || "Not configured",
        status: profile.is_active === false ? "Suspended" : "Active",
        lastLogin:
          profile.id === authenticatedUser.id && !profile.last_login
            ? "Current session"
            : formatDateTime(profile.last_login),
        createdDate: formatDate(profile.created_at),
      }));

      setUsers(normalizedUsers);
      setIsLoading(false);
    }

    loadOrganizationUsers();

    return () => {
      isMounted = false;
    };
  }, [isDemoMode]);

  const activeUserCount = useMemo(
    () => users.filter((user) => user.status === "Active").length,
    [users]
  );

  const suspendedUserCount = useMemo(
    () => users.filter((user) => user.status === "Suspended").length,
    [users]
  );

  return (
    <div className="argos-users-content">
      <div className="argos-users-heading">
        <div>
          <p className="eyebrow">Identity &amp; Access Management</p>
          <h4>Organization Users</h4>
          <p>
            Review organization-scoped user identity, role, department assignment,
            account status, and account activity. Administrative changes remain locked
            until the Sprint 001N permission and update policies are verified.
          </p>
        </div>

        <span className="argos-users-mode">IAM Foundation</span>
      </div>

      <div className="argos-users-actions" aria-label="Planned user management actions">
        <button type="button" disabled>
          Invite User
        </button>
        <button type="button" disabled>
          Edit User
        </button>
        <button type="button" disabled>
          Suspend / Restore
        </button>
      </div>

      <div className="argos-users-summary">
        <div>
          <span>Visible Users</span>
          <strong>{users.length}</strong>
        </div>
        <div>
          <span>Active Accounts</span>
          <strong>{activeUserCount}</strong>
        </div>
        <div>
          <span>Suspended Accounts</span>
          <strong>{suspendedUserCount}</strong>
        </div>
        <div>
          <span>Management Status</span>
          <strong>Read Only</strong>
        </div>
      </div>

      {isLoading ? (
        <UsersState>Loading organization users…</UsersState>
      ) : errorMessage ? (
        <UsersState error>{errorMessage}</UsersState>
      ) : users.length === 0 ? (
        <UsersState>No user profiles are currently visible for this organization.</UsersState>
      ) : (
        <div className="argos-users-table-wrap">
          <table className="argos-users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Job Title</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="argos-users-name">{user.fullName}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.department}</td>
                  <td>{user.jobTitle}</td>
                  <td>{user.phone}</td>
                  <td>
                    <span
                      className={`argos-users-status ${
                        user.status === "Suspended" ? "suspended" : "active"
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td>{user.lastLogin}</td>
                  <td>{user.createdDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="argos-users-foundation-note">
        <strong>Sprint 001N.1 identity data active</strong>
        <span>
          ARGOS now reads the expanded profile model, including department assignment,
          job title, phone, account status, last login, and created date. Invitations,
          role changes, department changes, suspension, restoration, and authentication
          enforcement remain disabled until the associated administrator-only policies
          are installed and tested.
        </span>
      </div>
    </div>
  );
}
