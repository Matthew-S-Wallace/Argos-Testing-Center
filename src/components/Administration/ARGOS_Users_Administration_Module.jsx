import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./ARGOS_Users_Administration_Module.css";

const DEMO_USERS = [
  {
    id: "demo-admin",
    fullName: "Demo Administrator",
    email: "demo@argos.local",
    role: "Administrator",
    department: "Fleet Administration",
    status: "Active",
    lastLogin: "Demo session",
  },
  {
    id: "demo-manager",
    fullName: "Operations Manager",
    email: "Not available",
    role: "Manager",
    department: "Not yet tracked",
    status: "Active",
    lastLogin: "Not yet tracked",
  },
  {
    id: "demo-technician",
    fullName: "Fleet Technician",
    email: "Not available",
    role: "Technician",
    department: "Not yet tracked",
    status: "Active",
    lastLogin: "Not yet tracked",
  },
];

function formatRole(role) {
  if (!role) return "Not assigned";

  return String(role)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
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
        .select("id, full_name, role, created_at")
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
            : "Not available",
        role: formatRole(profile.role),
        department: "Not yet tracked",
        status: "Active",
        lastLogin:
          profile.id === authenticatedUser.id ? "Current session" : "Not yet tracked",
      }));

      setUsers(normalizedUsers);
      setIsLoading(false);
    }

    loadOrganizationUsers();

    return () => {
      isMounted = false;
    };
  }, [isDemoMode]);

  return (
    <div className="argos-users-content">
      <div className="argos-users-heading">
        <div>
          <p className="eyebrow">Organization Access</p>
          <h4>Organization Users</h4>
          <p>
            Review user profiles currently visible to this organization. User-management
            actions remain disabled until role-based security is implemented.
          </p>
        </div>

        <span className="argos-users-mode">Read Only</span>
      </div>

      <div className="argos-users-actions" aria-label="Future user management actions">
        <button type="button" disabled>
          Invite User
        </button>
        <button type="button" disabled>
          Disable User
        </button>
        <button type="button" disabled>
          Reset Password
        </button>
      </div>

      <div className="argos-users-summary">
        <div>
          <span>Visible Users</span>
          <strong>{users.length}</strong>
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
                <th>Status</th>
                <th>Last Login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="argos-users-name">{user.fullName}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.department}</td>
                  <td>
                    <span className="argos-users-status">{user.status}</span>
                  </td>
                  <td>{user.lastLogin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="argos-users-foundation-note">
        <strong>Sprint 001E boundary</strong>
        <span>
          Department, account status, and last-login fields are not yet stored in the
          current ARGOS profile model. No invitations, role edits, password actions,
          profile writes, or RLS changes are included in this sprint.
        </span>
      </div>
    </div>
  );
}
