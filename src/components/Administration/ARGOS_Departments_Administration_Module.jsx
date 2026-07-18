import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { canManageDepartments } from "../../utils/ARGOS_Permission_Resolver";
import "./ARGOS_Departments_Administration_Module.css";

const DEMO_DEPARTMENTS = [
  { id: "demo-police", department_name: "Police", department_code: "POL", is_active: true },
  { id: "demo-fire", department_name: "Fire", department_code: "FIRE", is_active: true },
  {
    id: "demo-public-works",
    department_name: "Public Works",
    department_code: "PW",
    is_active: true,
  },
  { id: "demo-parks", department_name: "Parks", department_code: "PARKS", is_active: true },
  {
    id: "demo-solid-waste",
    department_name: "Solid Waste",
    department_code: "SW",
    is_active: true,
  },
];

const DEMO_ASSET_COUNTS = {
  Police: 3,
  Fire: 2,
  "Public Works": 3,
  Parks: 2,
  "Solid Waste": 2,
};

function normalizeDepartmentName(value) {
  return String(value || "").trim().toLowerCase();
}

function DepartmentsState({ children, error = false }) {
  return (
    <div className={`argos-departments-state${error ? " error" : ""}`}>
      {children}
    </div>
  );
}

export default function ARGOSDepartmentsAdministrationModule({ isDemoMode }) {
  const [departments, setDepartments] = useState(isDemoMode ? DEMO_DEPARTMENTS : []);
  const [assetCounts, setAssetCounts] = useState(isDemoMode ? DEMO_ASSET_COUNTS : {});
  const [organizationId, setOrganizationId] = useState(null);
  const [currentRole, setCurrentRole] = useState(isDemoMode ? "admin" : "");
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [errorMessage, setErrorMessage] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [departmentName, setDepartmentName] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(null);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [editDepartmentName, setEditDepartmentName] = useState("");
  const [editDepartmentCode, setEditDepartmentCode] = useState("");

  const isAdministrator = canManageDepartments({
    role: currentRole,
    is_active: true,
  });

  const selectedDepartment = useMemo(
    () => departments.find((department) => department.id === selectedDepartmentId) || null,
    [departments, selectedDepartmentId]
  );

  const activeDepartments = useMemo(
    () => departments.filter((department) => department.is_active),
    [departments]
  );

  useEffect(() => {
    let isMounted = true;

    if (isDemoMode) {
      setDepartments(DEMO_DEPARTMENTS);
      setAssetCounts(DEMO_ASSET_COUNTS);
      setCurrentRole("admin");
      setIsLoading(false);
      setErrorMessage("");
      return undefined;
    }

    async function loadDepartments() {
      setIsLoading(true);
      setErrorMessage("");

      const {
        data: { user: authenticatedUser },
        error: authenticationError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (authenticationError || !authenticatedUser) {
        setErrorMessage("ARGOS could not verify the signed-in user.");
        setIsLoading(false);
        return;
      }

      const { data: currentProfile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id, role")
        .eq("id", authenticatedUser.id)
        .single();

      if (!isMounted) return;

      if (profileError || !currentProfile?.organization_id) {
        console.error("ARGOS department organization lookup failed:", profileError);
        setErrorMessage("ARGOS could not resolve the current organization.");
        setIsLoading(false);
        return;
      }

      const resolvedOrganizationId = currentProfile.organization_id;
      setOrganizationId(resolvedOrganizationId);
      setCurrentRole(currentProfile.role || "");

      const [
        { data: departmentRows, error: departmentsError },
        { data: assetRows, error: assetsError },
      ] = await Promise.all([
        supabase
          .from("departments")
          .select("id, organization_id, department_name, department_code, is_active, created_at, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .order("department_name", { ascending: true }),
        supabase
          .from("assets")
          .select("department")
          .eq("organization_id", resolvedOrganizationId),
      ]);

      if (!isMounted) return;

      if (departmentsError) {
        console.error("ARGOS departments load failed:", departmentsError);
        setErrorMessage(
          "ARGOS could not load departments. Confirm the Sprint 001F database migration was completed."
        );
        setIsLoading(false);
        return;
      }

      if (assetsError) {
        console.error("ARGOS department asset counts load failed:", assetsError);
      }

      const counts = (assetRows || []).reduce((currentCounts, asset) => {
        const matchingDepartment = (departmentRows || []).find(
          (department) =>
            normalizeDepartmentName(department.department_name) ===
            normalizeDepartmentName(asset.department)
        );

        if (matchingDepartment) {
          currentCounts[matchingDepartment.id] =
            (currentCounts[matchingDepartment.id] || 0) + 1;
        }

        return currentCounts;
      }, {});

      setDepartments(departmentRows || []);
      setAssetCounts(counts);
      setIsLoading(false);
    }

    loadDepartments();

    return () => {
      isMounted = false;
    };
  }, [isDemoMode]);

  async function handleAddDepartment(event) {
    event.preventDefault();

    const cleanedName = departmentName.trim();
    const cleanedCode = departmentCode.trim().toUpperCase();

    if (!cleanedName) {
      setActionMessage("Department name is required.");
      return;
    }

    if (!isAdministrator) {
      setActionMessage("Only an ARGOS administrator can create departments.");
      return;
    }

    if (isDemoMode) {
      const demoDepartment = {
        id: `demo-${Date.now()}`,
        department_name: cleanedName,
        department_code: cleanedCode || null,
        is_active: true,
      };

      setDepartments((currentDepartments) =>
        [...currentDepartments, demoDepartment].sort((first, second) =>
          first.department_name.localeCompare(second.department_name)
        )
      );
      setDepartmentName("");
      setDepartmentCode("");
      setShowAddForm(false);
      setActionMessage("Demo department added.");
      return;
    }

    if (!organizationId) {
      setActionMessage("ARGOS could not resolve the current organization.");
      return;
    }

    setIsSaving(true);
    setActionMessage("");

    const { data, error } = await supabase
      .from("departments")
      .insert({
        organization_id: organizationId,
        department_name: cleanedName,
        department_code: cleanedCode || null,
      })
      .select("id, organization_id, department_name, department_code, is_active, created_at, updated_at")
      .single();

    if (error) {
      console.error("ARGOS department creation failed:", error);
      setActionMessage(
        error.code === "23505"
          ? "That department name or code already exists for this organization."
          : "ARGOS could not create the department."
      );
      setIsSaving(false);
      return;
    }

    setDepartments((currentDepartments) =>
      [...currentDepartments, data].sort((first, second) =>
        first.department_name.localeCompare(second.department_name)
      )
    );
    setDepartmentName("");
    setDepartmentCode("");
    setShowAddForm(false);
    setActionMessage("Department created.");
    setIsSaving(false);
  }

  function beginEditDepartment(department) {
    if (!isAdministrator) {
      setActionMessage("Only an ARGOS administrator can edit departments.");
      return;
    }

    setSelectedDepartmentId(department.id);
    setEditingDepartment(department);
    setEditDepartmentName(department.department_name || "");
    setEditDepartmentCode(department.department_code || "");
    setShowAddForm(false);
    setActionMessage("");
  }

  function cancelEditDepartment() {
    setEditingDepartment(null);
    setEditDepartmentName("");
    setEditDepartmentCode("");
    setActionMessage("");
  }

  async function handleEditDepartment(event) {
    event.preventDefault();

    if (!editingDepartment) return;

    const cleanedName = editDepartmentName.trim();
    const cleanedCode = editDepartmentCode.trim().toUpperCase();

    if (!cleanedName) {
      setActionMessage("Department name is required.");
      return;
    }

    if (!isAdministrator) {
      setActionMessage("Only an ARGOS administrator can edit departments.");
      return;
    }

    if (isDemoMode) {
      setDepartments((currentDepartments) =>
        currentDepartments
          .map((department) =>
            department.id === editingDepartment.id
              ? {
                  ...department,
                  department_name: cleanedName,
                  department_code: cleanedCode || null,
                }
              : department
          )
          .sort((first, second) =>
            first.department_name.localeCompare(second.department_name)
          )
      );
      cancelEditDepartment();
      setActionMessage("Demo department updated.");
      return;
    }

    if (!organizationId) {
      setActionMessage("ARGOS could not resolve the current organization.");
      return;
    }

    setIsSaving(true);
    setActionMessage("");

    const { data, error } = await supabase
      .from("departments")
      .update({
        department_name: cleanedName,
        department_code: cleanedCode || null,
      })
      .eq("id", editingDepartment.id)
      .eq("organization_id", organizationId)
      .select("id, organization_id, department_name, department_code, is_active, created_at, updated_at")
      .single();

    if (error) {
      console.error("ARGOS department update failed:", error);
      setActionMessage(
        error.code === "23505"
          ? "That department name or code already exists for this organization."
          : "ARGOS could not update the department."
      );
      setIsSaving(false);
      return;
    }

    setDepartments((currentDepartments) =>
      currentDepartments
        .map((department) =>
          department.id === data.id ? data : department
        )
        .sort((first, second) =>
          first.department_name.localeCompare(second.department_name)
        )
    );
    setEditingDepartment(null);
    setEditDepartmentName("");
    setEditDepartmentCode("");
    setActionMessage("Department updated.");
    setIsSaving(false);
  }

  async function handleDisableDepartment(department) {
    if (!isAdministrator) {
      setActionMessage("Only an ARGOS administrator can disable departments.");
      return;
    }

    const shouldDisable = window.confirm(
      `Disable ${department.department_name}? Existing asset records will not be changed.`
    );

    if (!shouldDisable) return;

    if (isDemoMode) {
      setDepartments((currentDepartments) =>
        currentDepartments.map((currentDepartment) =>
          currentDepartment.id === department.id
            ? { ...currentDepartment, is_active: false }
            : currentDepartment
        )
      );
      setActionMessage("Demo department disabled.");
      return;
    }

    const { data, error } = await supabase
      .from("departments")
      .update({ is_active: false })
      .eq("id", department.id)
      .eq("organization_id", organizationId)
      .select("id, organization_id, department_name, department_code, is_active, created_at, updated_at")
      .single();

    if (error) {
      console.error("ARGOS department disable failed:", error);
      setActionMessage("ARGOS could not disable the department.");
      return;
    }

    setDepartments((currentDepartments) =>
      currentDepartments.map((currentDepartment) =>
        currentDepartment.id === data.id ? data : currentDepartment
      )
    );
    setActionMessage("Department disabled.");
  }

  return (
    <div className="argos-departments-content">
      <div className="argos-departments-heading">
        <div>
          <p className="eyebrow">Organization Structure</p>
          <h4>Fleet Departments</h4>
          <p>
            Maintain the departments that own or operate fleet assets, such as Police,
            Fire, Public Works, Parks, Transit, and Utilities.
          </p>
        </div>

        <span className="argos-departments-mode">
          {isAdministrator ? "Administrator" : "Read Only"}
        </span>
      </div>

      <div className="argos-departments-actions">
        <button
          type="button"
          onClick={() => {
            setShowAddForm((currentValue) => !currentValue);
            setActionMessage("");
          }}
          disabled={!isAdministrator}
        >
          {showAddForm ? "Cancel Add" : "Add Department"}
        </button>
        <button
          type="button"
          disabled={!isAdministrator || !selectedDepartment}
          onClick={() => {
            if (editingDepartment) {
              cancelEditDepartment();
              return;
            }

            beginEditDepartment(selectedDepartment);
          }}
        >
          {editingDepartment ? "Cancel Edit" : "Edit Department"}
        </button>
      </div>

      {!editingDepartment && departments.length > 0 && (
        <div className="argos-departments-action-message">
          {selectedDepartment
            ? `Selected: ${selectedDepartment.department_name}`
            : "Select a department row to enable Edit Department."}
        </div>
      )}

      {editingDepartment && (
        <form className="argos-departments-add-form" onSubmit={handleEditDepartment}>
          <label>
            Department Name
            <input
              type="text"
              value={editDepartmentName}
              onChange={(event) => setEditDepartmentName(event.target.value)}
              placeholder="Example: Public Works"
              maxLength={120}
              autoFocus
            />
          </label>

          <label>
            Department Code
            <input
              type="text"
              value={editDepartmentCode}
              onChange={(event) => setEditDepartmentCode(event.target.value)}
              placeholder="Example: PW"
              maxLength={20}
            />
          </label>

          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save Department"}
          </button>

          <button type="button" onClick={cancelEditDepartment} disabled={isSaving}>
            Cancel
          </button>
        </form>
      )}

      {showAddForm && (
        <form className="argos-departments-add-form" onSubmit={handleAddDepartment}>
          <label>
            Department Name
            <input
              type="text"
              value={departmentName}
              onChange={(event) => setDepartmentName(event.target.value)}
              placeholder="Example: Public Works"
              maxLength={120}
              autoFocus
            />
          </label>

          <label>
            Department Code
            <input
              type="text"
              value={departmentCode}
              onChange={(event) => setDepartmentCode(event.target.value)}
              placeholder="Example: PW"
              maxLength={20}
            />
          </label>

          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Create Department"}
          </button>
        </form>
      )}

      {actionMessage && (
        <div className="argos-departments-action-message">{actionMessage}</div>
      )}

      <div className="argos-departments-summary">
        <div>
          <span>Total Departments</span>
          <strong>{departments.length}</strong>
        </div>
        <div>
          <span>Active Departments</span>
          <strong>{activeDepartments.length}</strong>
        </div>
      </div>

      {isLoading ? (
        <DepartmentsState>Loading departments…</DepartmentsState>
      ) : errorMessage ? (
        <DepartmentsState error>{errorMessage}</DepartmentsState>
      ) : departments.length === 0 ? (
        <DepartmentsState>
          No departments have been configured for this organization.
        </DepartmentsState>
      ) : (
        <div className="argos-departments-table-wrap">
          <table className="argos-departments-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Code</th>
                <th>Asset Count</th>
                <th>Status</th>
                <th aria-label="Department status action">Action</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => (
                <tr
                  key={department.id}
                  onClick={() => {
                    if (editingDepartment) return;
                    setSelectedDepartmentId(department.id);
                    setActionMessage("");
                  }}
                  aria-selected={selectedDepartmentId === department.id}
                  style={{
                    cursor: editingDepartment ? "default" : "pointer",
                    background:
                      selectedDepartmentId === department.id
                        ? "rgba(25, 78, 121, 0.08)"
                        : undefined,
                    outline:
                      selectedDepartmentId === department.id
                        ? "2px solid rgba(25, 78, 121, 0.22)"
                        : undefined,
                    outlineOffset: "-2px",
                  }}
                >
                  <td className="argos-departments-name">
                    {department.department_name}
                  </td>
                  <td>{department.department_code || "Not configured"}</td>
                  <td>
                    {isDemoMode
                      ? assetCounts[department.department_name] || 0
                      : assetCounts[department.id] || 0}
                  </td>
                  <td>
                    <span
                      className={`argos-departments-status ${
                        department.is_active ? "active" : "inactive"
                      }`}
                    >
                      {department.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="argos-departments-row-action"
                      type="button"
                      disabled={!isAdministrator || !department.is_active}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDisableDepartment(department);
                      }}
                    >
                      {department.is_active ? "Disable" : "Disabled"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="argos-departments-foundation-note">
        <strong>Sprint 001F boundary</strong>
        <span>
          Departments are organization-scoped production records. Department names and
          codes can now be edited by Administrators. Asset counts remain matched against
          the existing asset department text; renaming a department does not rewrite
          historical asset records. Reactivation and department-ID migration remain
          outside this sprint.
        </span>
      </div>
    </div>
  );
}
