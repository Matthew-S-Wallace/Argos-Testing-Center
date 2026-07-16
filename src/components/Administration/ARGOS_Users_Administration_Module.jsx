import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { updateArgosUserProfile } from "../../utils/ARGOS_Identity_Service";
import "./ARGOS_Users_Administration_Module.css";

const ARGOS_ROLE_OPTIONS = [
  { value: "admin", label: "Administrator" },
  { value: "manager", label: "Manager" },
  { value: "user", label: "User" },
  { value: "technician", label: "Technician" },
];

function normalizeRoleValue(role) {
  const normalizedRole = String(role || "").trim().toLowerCase();

  if (normalizedRole === "administrator") return "admin";
  if (["admin", "manager", "user", "technician"].includes(normalizedRole)) {
    return normalizedRole;
  }

  return "user";
}

const DEMO_USERS = [
  {
    id: "demo-admin",
    fullName: "Demo Administrator",
    email: "demo@argos.local",
    role: "Administrator",
    roleValue: "admin",
    departmentId: "",
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
    roleValue: "manager",
    departmentId: "demo-public-works",
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
    roleValue: "technician",
    departmentId: "",
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
  const [departments, setDepartments] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [editDraft, setEditDraft] = useState(null);
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (isDemoMode) {
      setUsers(DEMO_USERS);
      setDepartments([
        { id: "demo-public-works", department_name: "Public Works" },
        { id: "demo-police", department_name: "Police" },
        { id: "demo-fire", department_name: "Fire" },
      ]);
      setCurrentUser({ id: "demo-admin", role: "admin", is_active: true });
      setSelectedUserId("demo-admin");
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
        .select("id, organization_id, full_name, role, is_active")
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

      const [
        { data: organizationProfiles, error: organizationProfilesError },
        { data: organizationDepartments, error: organizationDepartmentsError },
      ] = await Promise.all([
        supabase
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
          .order("full_name", { ascending: true }),
        supabase
          .from("departments")
          .select("id, department_name")
          .eq("organization_id", currentProfile.organization_id)
          .eq("is_active", true)
          .order("department_name", { ascending: true }),
      ]);

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

      if (organizationDepartmentsError) {
        console.error(
          "ARGOS organization departments lookup failed:",
          organizationDepartmentsError
        );
      }

      const normalizedUsers = (organizationProfiles || []).map((profile) => ({
        id: profile.id,
        fullName: profile.full_name || "Unnamed User",
        email:
          profile.id === authenticatedUser.id
            ? authenticatedUser.email || "Not available"
            : "Protected by Supabase Auth",
        role: formatRole(profile.role),
        roleValue: normalizeRoleValue(profile.role),
        departmentId: profile.department_id || "",
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

      setCurrentUser({
        id: currentProfile.id,
        role: normalizeRoleValue(currentProfile.role),
        is_active: currentProfile.is_active !== false,
      });
      setUsers(normalizedUsers);
      setDepartments(organizationDepartments || []);
      setSelectedUserId((existingSelection) =>
        normalizedUsers.some((user) => user.id === existingSelection)
          ? existingSelection
          : normalizedUsers[0]?.id || ""
      );
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

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const currentUserIsAdministrator = currentUser?.role === "admin";
  const canEditSelectedUser =
    !isDemoMode && currentUserIsAdministrator && Boolean(selectedUser);

  function beginEditSelectedUser() {
    if (!selectedUser || !canEditSelectedUser) return;

    setEditDraft({
      full_name: selectedUser.fullName,
      role: selectedUser.roleValue,
      department_id: selectedUser.departmentId,
      job_title:
        selectedUser.jobTitle === "Not configured" ? "" : selectedUser.jobTitle,
      phone: selectedUser.phone === "Not configured" ? "" : selectedUser.phone,
    });
    setActionMessage("");
    setErrorMessage("");
  }

  function updateEditDraft(field, value) {
    setEditDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  }

  async function saveEditedUser(event) {
    event.preventDefault();

    if (!selectedUser || !editDraft) return;

    setIsSaving(true);
    setActionMessage("");
    setErrorMessage("");

    try {
      await updateArgosUserProfile(selectedUser.id, editDraft);
      setActionMessage("User profile updated successfully.");
      setEditDraft(null);

      const updatedDepartment =
        departments.find(
          (department) => department.id === editDraft.department_id
        )?.department_name || "Not assigned";

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === selectedUser.id
            ? {
                ...user,
                fullName: editDraft.full_name.trim(),
                role: formatRole(editDraft.role),
                roleValue: normalizeRoleValue(editDraft.role),
                departmentId: editDraft.department_id || "",
                department: updatedDepartment,
                jobTitle: editDraft.job_title.trim() || "Not configured",
                phone: editDraft.phone.trim() || "Not configured",
              }
            : user
        )
      );
    } catch (error) {
      setErrorMessage(
        error?.message || "ARGOS could not update this user profile."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="argos-users-content">
      <div className="argos-users-heading">
        <div>
          <p className="eyebrow">Identity &amp; Access Management</p>
          <h4>Organization Users</h4>
          <p>
            Review and update organization-scoped user identity, role, department
            assignment, job title, and contact information through the controlled
            ARGOS administrator security boundary.
          </p>
        </div>

        <span className="argos-users-mode">Controlled Editing</span>
      </div>

      <div className="argos-users-actions" aria-label="User management actions">
        <button type="button" disabled>
          Invite User
        </button>
        <button
          type="button"
          onClick={beginEditSelectedUser}
          disabled={!canEditSelectedUser || Boolean(editDraft)}
        >
          Edit Selected User
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
          <strong>{currentUserIsAdministrator ? "Administrator" : "Read Only"}</strong>
        </div>
      </div>

      {actionMessage ? (
        <div className="argos-users-message success">{actionMessage}</div>
      ) : null}

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
                <th>Select</th>
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
                <tr
                  key={user.id}
                  className={selectedUserId === user.id ? "selected" : ""}
                  onClick={() => {
                    if (!editDraft) setSelectedUserId(user.id);
                  }}
                >
                  <td>
                    <input
                      type="radio"
                      name="argos-selected-user"
                      checked={selectedUserId === user.id}
                      onChange={() => setSelectedUserId(user.id)}
                      disabled={Boolean(editDraft)}
                      aria-label={`Select ${user.fullName}`}
                    />
                  </td>
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

      {editDraft && selectedUser ? (
        <form className="argos-users-editor" onSubmit={saveEditedUser}>
          <div className="argos-users-editor-heading">
            <div>
              <p className="eyebrow">Controlled User Edit</p>
              <h5>{selectedUser.fullName}</h5>
            </div>
            <span>Administrator Only</span>
          </div>

          <div className="argos-users-editor-grid">
            <label>
              <span>Full Name</span>
              <input
                type="text"
                value={editDraft.full_name}
                onChange={(event) =>
                  updateEditDraft("full_name", event.target.value)
                }
                maxLength={160}
                required
              />
            </label>

            <label>
              <span>Role</span>
              <select
                value={editDraft.role}
                onChange={(event) =>
                  updateEditDraft("role", event.target.value)
                }
                disabled={selectedUser.id === currentUser?.id}
              >
                {ARGOS_ROLE_OPTIONS.map((roleOption) => (
                  <option key={roleOption.value} value={roleOption.value}>
                    {roleOption.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Department</span>
              <select
                value={editDraft.department_id}
                onChange={(event) =>
                  updateEditDraft("department_id", event.target.value)
                }
              >
                <option value="">Not assigned</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.department_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Job Title</span>
              <input
                type="text"
                value={editDraft.job_title}
                onChange={(event) =>
                  updateEditDraft("job_title", event.target.value)
                }
                maxLength={120}
              />
            </label>

            <label>
              <span>Phone</span>
              <input
                type="tel"
                value={editDraft.phone}
                onChange={(event) =>
                  updateEditDraft("phone", event.target.value)
                }
                maxLength={40}
              />
            </label>
          </div>

          {selectedUser.id === currentUser?.id ? (
            <div className="argos-users-editor-note">
              Your own administrator role cannot be changed.
            </div>
          ) : null}

          <div className="argos-users-editor-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setEditDraft(null)}
            >
              Cancel
            </button>
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save User"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="argos-users-foundation-note">
        <strong>Sprint 001N.3 controlled editing active</strong>
        <span>
          ARGOS now routes profile edits through the authenticated, tenant-scoped
          administrator RPC. Organization ownership and protected account fields remain
          outside the browser editing surface. Invitations and suspension remain disabled
          until their dedicated controls are installed and verified.
        </span>
      </div>
    </div>
  );
}
