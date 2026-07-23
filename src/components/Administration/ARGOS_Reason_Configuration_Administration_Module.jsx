import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { canManageStatusConfiguration } from "../../utils/ARGOS_Permission_Resolver";
import "./ARGOS_Reason_Configuration_Administration_Module.css";

const DEMO_STATUSES = [
  { id: "demo-status-ready", status_name: "Ready", status_code: "READY", is_active: true },
  { id: "demo-status-down", status_name: "Down", status_code: "DOWN", is_active: true },
  { id: "demo-status-shop", status_name: "In Shop", status_code: "IN_SHOP", is_active: true },
  { id: "demo-status-parts", status_name: "Waiting Parts", status_code: "WAITING_PARTS", is_active: true },
];

const DEMO_REASONS = [
  ["Scheduled Maintenance", "SCHEDULED_MAINT", "demo-status-shop", true, true, true],
  ["Mechanical Failure", "MECHANICAL_FAILURE", "demo-status-down", true, true, true],
  ["Waiting for Parts", "WAITING_FOR_PARTS", "demo-status-parts", false, true, true],
  ["Administrative Hold", "ADMIN_HOLD", "demo-status-down", false, true, false],
].map(
  (
    [
      reason_name,
      reason_code,
      status_id,
      requires_technician,
      requires_notes,
      mobile_visible,
    ],
    index
  ) => ({
    id: `demo-reason-${index}`,
    reason_name,
    reason_code,
    status_id,
    requires_technician,
    requires_notes,
    mobile_visible,
    is_active: true,
  })
);

const EMPTY = {
  reason_name: "",
  reason_code: "",
  status_id: "",
  requires_technician: false,
  requires_notes: false,
  mobile_visible: true,
};

const FIELDS =
  "id, organization_id, reason_name, reason_code, status_id, requires_technician, requires_notes, mobile_visible, is_active, created_at, updated_at";

const STATUS_FIELDS = "id, status_name, status_code, is_active";

const sortRows = (rows) =>
  [...rows].sort((a, b) => a.reason_name.localeCompare(b.reason_name));

export default function ARGOSReasonConfigurationAdministrationModule({
  isDemoMode,
}) {
  const [rows, setRows] = useState(isDemoMode ? DEMO_REASONS : []);
  const [statuses, setStatuses] = useState(isDemoMode ? DEMO_STATUSES : []);
  const [organizationId, setOrganizationId] = useState(null);
  const [role, setRole] = useState(isDemoMode ? "admin" : "");
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const isAdmin = canManageStatusConfiguration({
    role,
    is_active: true,
  });

  const active = useMemo(
    () => rows.filter((row) => row.is_active),
    [rows]
  );

  const statusMap = useMemo(
    () =>
      statuses.reduce((map, status) => {
        map[status.id] = status;
        return map;
      }, {}),
    [statuses]
  );

  useEffect(() => {
    let mounted = true;

    if (isDemoMode) {
      setRows(DEMO_REASONS);
      setStatuses(DEMO_STATUSES);
      setRole("admin");
      setLoading(false);
      return undefined;
    }

    async function load() {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (authError || !user) {
        setError("ARGOS could not verify the signed-in user.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id, role")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (profileError || !profile?.organization_id) {
        setError("ARGOS could not resolve the current organization.");
        setLoading(false);
        return;
      }

      setOrganizationId(profile.organization_id);
      setRole(profile.role || "");

      const [
        { data: reasonRows, error: reasonError },
        { data: statusRows, error: statusError },
      ] = await Promise.all([
        supabase
          .from("reason_configurations")
          .select(FIELDS)
          .eq("organization_id", profile.organization_id)
          .order("reason_name"),
        supabase
          .from("status_configurations")
          .select(STATUS_FIELDS)
          .eq("organization_id", profile.organization_id)
          .order("display_order")
          .order("status_name"),
      ]);

      if (!mounted) return;

      if (reasonError) {
        console.error(reasonError);
        setError(
          "ARGOS could not load Reason Configuration. Confirm the Sprint 001Z migration completed."
        );
        setLoading(false);
        return;
      }

      if (statusError) {
        console.error(statusError);
        setError(
          "ARGOS could not load the Status Configuration required for Reason mapping."
        );
        setLoading(false);
        return;
      }

      setRows(sortRows(reasonRows || []));
      setStatuses(statusRows || []);
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, [isDemoMode]);

  const change = (setter, key, value) =>
    setter((current) => ({ ...current, [key]: value }));

  const clean = (value) => ({
    reason_name: value.reason_name.trim(),
    reason_code: value.reason_code.trim().toUpperCase(),
    status_id: value.status_id || null,
    requires_technician: Boolean(value.requires_technician),
    requires_notes: Boolean(value.requires_notes),
    mobile_visible: Boolean(value.mobile_visible),
  });

  const validate = (value) =>
    !value.reason_name
      ? "Reason name is required."
      : !value.reason_code
        ? "Reason code is required."
        : !value.status_id
          ? "A mapped status is required."
          : "";

  const begin = (row) => {
    setEditingId(row.id);
    setEdit({ ...row });
    setMessage("");
  };

  const cancel = () => {
    setEditingId(null);
    setEdit(EMPTY);
  };

  async function createReason(event) {
    event.preventDefault();

    const payload = clean(form);
    const problem = validate(payload);

    if (problem) {
      setMessage(problem);
      return;
    }

    if (!isAdmin) {
      setMessage("Only an ARGOS administrator can create reasons.");
      return;
    }

    if (isDemoMode) {
      setRows((current) =>
        sortRows([
          ...current,
          {
            ...payload,
            id: `demo-reason-${Date.now()}`,
            is_active: true,
          },
        ])
      );
      setForm(EMPTY);
      setShowAdd(false);
      setMessage("Demo reason created.");
      return;
    }

    setSaving(true);

    const { data, error: createError } = await supabase
      .from("reason_configurations")
      .insert({
        organization_id: organizationId,
        ...payload,
      })
      .select(FIELDS)
      .single();

    if (createError) {
      setMessage(
        createError.code === "23505"
          ? "That reason name or code already exists for this organization."
          : "ARGOS could not create the reason."
      );
      setSaving(false);
      return;
    }

    setRows((current) => sortRows([...current, data]));
    setForm(EMPTY);
    setShowAdd(false);
    setMessage("Reason created.");
    setSaving(false);
  }

  async function saveReason(row) {
    const payload = clean(edit);
    const problem = validate(payload);

    if (problem) {
      setMessage(problem);
      return;
    }

    if (!isAdmin) {
      setMessage("Only an ARGOS administrator can update reasons.");
      return;
    }

    if (isDemoMode) {
      setRows((current) =>
        sortRows(
          current.map((item) =>
            item.id === row.id ? { ...item, ...payload } : item
          )
        )
      );
      cancel();
      setMessage("Demo reason updated.");
      return;
    }

    setSaving(true);

    const { data, error: updateError } = await supabase
      .from("reason_configurations")
      .update(payload)
      .eq("id", row.id)
      .eq("organization_id", organizationId)
      .select(FIELDS)
      .single();

    if (updateError) {
      setMessage(
        updateError.code === "23505"
          ? "That reason name or code already exists for this organization."
          : "ARGOS could not update the reason."
      );
      setSaving(false);
      return;
    }

    setRows((current) =>
      sortRows(current.map((item) => (item.id === data.id ? data : item)))
    );
    cancel();
    setMessage("Reason updated.");
    setSaving(false);
  }

  async function disableReason(row) {
    if (!isAdmin) {
      setMessage("Only an ARGOS administrator can disable reasons.");
      return;
    }

    if (
      !window.confirm(
        `Disable ${row.reason_name}? Existing records will remain unchanged.`
      )
    ) {
      return;
    }

    if (isDemoMode) {
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, is_active: false } : item
        )
      );
      setMessage("Demo reason disabled.");
      return;
    }

    const { data, error: disableError } = await supabase
      .from("reason_configurations")
      .update({ is_active: false })
      .eq("id", row.id)
      .eq("organization_id", organizationId)
      .select(FIELDS)
      .single();

    if (disableError) {
      setMessage("ARGOS could not disable the reason.");
      return;
    }

    setRows((current) =>
      current.map((item) => (item.id === data.id ? data : item))
    );
    setMessage("Reason disabled.");
  }

  const field = (
    source,
    setter,
    key,
    type = "text",
    disabled = false
  ) => (
    <input
      type={type}
      value={type === "checkbox" ? undefined : source[key] ?? ""}
      checked={type === "checkbox" ? Boolean(source[key]) : undefined}
      disabled={disabled}
      onChange={(event) =>
        change(
          setter,
          key,
          type === "checkbox" ? event.target.checked : event.target.value
        )
      }
    />
  );

  const statusField = (source, setter) => (
    <select
      value={source.status_id || ""}
      onChange={(event) =>
        change(setter, "status_id", event.target.value)
      }
    >
      <option value="">Select status</option>
      {statuses
        .filter((status) => status.is_active || status.id === source.status_id)
        .map((status) => (
          <option key={status.id} value={status.id}>
            {status.status_name}
          </option>
        ))}
    </select>
  );

  return (
    <div className="argos-reason-config-content">
      <div className="argos-reason-config-heading">
        <div>
          <p className="eyebrow">Operational Workflow</p>
          <h4>Reason Configuration</h4>
          <p>
            Maintain organization-scoped operational reasons, map each reason
            to a configured status, and control technician, notes, and mobile
            workflow requirements.
          </p>
        </div>
        <span className="argos-reason-config-mode">
          {isAdmin ? "Administrator" : "Read Only"}
        </span>
      </div>

      <div className="argos-reason-config-actions">
        <button
          type="button"
          disabled={!isAdmin}
          onClick={() => {
            setShowAdd((value) => !value);
            setMessage("");
          }}
        >
          {showAdd ? "Cancel Add" : "Add Reason"}
        </button>
      </div>

      {showAdd && (
        <form
          className="argos-reason-config-form"
          onSubmit={createReason}
        >
          <label>
            Reason Name
            {field(form, setForm, "reason_name")}
          </label>
          <label>
            Reason Code
            {field(form, setForm, "reason_code")}
          </label>
          <label>
            Status
            {statusField(form, setForm)}
          </label>
          <label className="argos-reason-config-check">
            {field(
              form,
              setForm,
              "requires_technician",
              "checkbox"
            )}
            Requires Technician
          </label>
          <label className="argos-reason-config-check">
            {field(form, setForm, "requires_notes", "checkbox")}
            Requires Notes
          </label>
          <label className="argos-reason-config-check">
            {field(form, setForm, "mobile_visible", "checkbox")}
            Mobile Visible
          </label>
          <button disabled={saving}>
            {saving ? "Saving…" : "Create Reason"}
          </button>
        </form>
      )}

      {message && (
        <div className="argos-reason-config-action-message">
          {message}
        </div>
      )}

      <div className="argos-reason-config-summary">
        <div>
          <span>Total Reasons</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Active Reasons</span>
          <strong>{active.length}</strong>
        </div>
        <div>
          <span>Mobile Visible</span>
          <strong>
            {active.filter((row) => row.mobile_visible).length}
          </strong>
        </div>
      </div>

      {loading ? (
        <div className="argos-reason-config-state">
          Loading Reason Configuration…
        </div>
      ) : error ? (
        <div className="argos-reason-config-state error">{error}</div>
      ) : (
        <div className="argos-reason-config-table-wrap">
          <table className="argos-reason-config-table">
            <thead>
              <tr>
                <th>Reason</th>
                <th>Code</th>
                <th>Status</th>
                <th>Technician</th>
                <th>Notes</th>
                <th>Mobile</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const editing = editingId === row.id;
                const mappedStatus = statusMap[row.status_id];

                return (
                  <tr key={row.id}>
                    <td className="argos-reason-config-name">
                      {editing
                        ? field(edit, setEdit, "reason_name")
                        : row.reason_name}
                    </td>
                    <td>
                      {editing
                        ? field(edit, setEdit, "reason_code")
                        : row.reason_code}
                    </td>
                    <td>
                      {editing
                        ? statusField(edit, setEdit)
                        : mappedStatus?.status_name || "Not mapped"}
                    </td>
                    <td>
                      {editing
                        ? field(
                            edit,
                            setEdit,
                            "requires_technician",
                            "checkbox"
                          )
                        : row.requires_technician
                          ? "Required"
                          : "Not required"}
                    </td>
                    <td>
                      {editing
                        ? field(
                            edit,
                            setEdit,
                            "requires_notes",
                            "checkbox"
                          )
                        : row.requires_notes
                          ? "Required"
                          : "Not required"}
                    </td>
                    <td>
                      {editing
                        ? field(
                            edit,
                            setEdit,
                            "mobile_visible",
                            "checkbox"
                          )
                        : row.mobile_visible
                          ? "Visible"
                          : "Hidden"}
                    </td>
                    <td>
                      <span
                        className={`argos-reason-config-status ${
                          row.is_active ? "active" : "inactive"
                        }`}
                      >
                        {row.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="argos-reason-config-row-actions">
                        {editing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveReason(row)}
                              disabled={saving}
                            >
                              Save
                            </button>
                            <button type="button" onClick={cancel}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => begin(row)}
                            >
                              Edit
                            </button>
                            <button
                              className="disable"
                              type="button"
                              disabled={
                                !isAdmin || !row.is_active
                              }
                              onClick={() => disableReason(row)}
                            >
                              {row.is_active ? "Disable" : "Disabled"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="argos-reason-config-foundation-note">
        <strong>Sprint 001Z boundary</strong>
        <span>
          Reason Configuration remains organization scoped and uses the
          existing centralized Administration permission model. Each reason is
          mapped to a configured status without altering operational workflow
          architecture.
        </span>
      </div>
    </div>
  );
}
