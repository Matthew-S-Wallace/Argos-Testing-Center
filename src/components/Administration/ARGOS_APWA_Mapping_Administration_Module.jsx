import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./ARGOS_APWA_Mapping_Administration_Module.css";

const EMPTY_RULE = {
  rule_name: "",
  department_id: "",
  asset_type_id: "",
  recommended_apwa_code_id: "",
  priority: 100,
  notes: "",
};

const DEMO_DEPARTMENTS = [
  { id: "demo-police", department_name: "Police", is_active: true },
  { id: "demo-public-works", department_name: "Public Works", is_active: true },
  { id: "demo-solid-waste", department_name: "Solid Waste", is_active: true },
];

const DEMO_ASSET_TYPES = [
  { id: "demo-suv", asset_type_name: "SUV", is_active: true },
  { id: "demo-pickup", asset_type_name: "Pickup Truck", is_active: true },
  { id: "demo-refuse", asset_type_name: "Refuse Vehicle", is_active: true },
];

const DEMO_APWA_CODES = [
  { id: "demo-apwa-1", code: "0100", description: "Passenger Vehicles", category: "Vehicles", is_active: true },
  { id: "demo-apwa-2", code: "0200", description: "Light Trucks", category: "Vehicles", is_active: true },
  { id: "demo-apwa-3", code: "0500", description: "Refuse Collection Equipment", category: "Solid Waste", is_active: true },
];

const DEMO_RULES = [
  {
    id: "demo-rule-1",
    organization_id: "demo-organization",
    department_id: "demo-police",
    asset_type_id: "demo-suv",
    recommended_apwa_code_id: "demo-apwa-1",
    rule_name: "Police SUV",
    notes: "Exact department and asset-type recommendation.",
    priority: 10,
    is_active: true,
  },
  {
    id: "demo-rule-2",
    organization_id: "demo-organization",
    department_id: null,
    asset_type_id: "demo-pickup",
    recommended_apwa_code_id: "demo-apwa-2",
    rule_name: "Pickup Truck Default",
    notes: "Applies to pickup trucks across departments.",
    priority: 50,
    is_active: true,
  },
];

function sortRules(rows) {
  return [...rows].sort(
    (first, second) =>
      Number(first.priority) - Number(second.priority) ||
      String(first.rule_name || "").localeCompare(String(second.rule_name || ""))
  );
}

function roleCanManage(role) {
  return ["admin", "manager"].includes(String(role || "").trim().toLowerCase());
}

function APWAState({ children, error = false }) {
  return <div className={`argos-apwa-state${error ? " error" : ""}`}>{children}</div>;
}

export default function ARGOSAPWAMappingAdministrationModule({ isDemoMode }) {
  const [rules, setRules] = useState(isDemoMode ? DEMO_RULES : []);
  const [departments, setDepartments] = useState(isDemoMode ? DEMO_DEPARTMENTS : []);
  const [assetTypes, setAssetTypes] = useState(isDemoMode ? DEMO_ASSET_TYPES : []);
  const [apwaCodes, setApwaCodes] = useState(isDemoMode ? DEMO_APWA_CODES : []);
  const [organizationId, setOrganizationId] = useState(isDemoMode ? "demo-organization" : null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentRole, setCurrentRole] = useState(isDemoMode ? "admin" : "");
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_RULE);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_RULE);

  const canManage = isDemoMode || roleCanManage(currentRole);

  const departmentById = useMemo(
    () => Object.fromEntries(departments.map((department) => [department.id, department])),
    [departments]
  );
  const assetTypeById = useMemo(
    () => Object.fromEntries(assetTypes.map((assetType) => [assetType.id, assetType])),
    [assetTypes]
  );
  const apwaCodeById = useMemo(
    () => Object.fromEntries(apwaCodes.map((code) => [code.id, code])),
    [apwaCodes]
  );
  const activeRules = useMemo(() => rules.filter((rule) => rule.is_active), [rules]);
  const exactRules = useMemo(
    () => activeRules.filter((rule) => rule.department_id && rule.asset_type_id),
    [activeRules]
  );

  useEffect(() => {
    let isMounted = true;

    if (isDemoMode) {
      setRules(DEMO_RULES);
      setDepartments(DEMO_DEPARTMENTS);
      setAssetTypes(DEMO_ASSET_TYPES);
      setApwaCodes(DEMO_APWA_CODES);
      setOrganizationId("demo-organization");
      setCurrentRole("admin");
      setIsLoading(false);
      return undefined;
    }

    async function loadAPWAMapping() {
      setIsLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: authenticationError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;
      if (authenticationError || !user) {
        setErrorMessage("ARGOS could not verify the signed-in user.");
        setIsLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id, role")
        .eq("id", user.id)
        .single();

      if (!isMounted) return;
      if (profileError || !profile?.organization_id) {
        console.error("ARGOS APWA organization lookup failed:", profileError);
        setErrorMessage("ARGOS could not resolve the current organization.");
        setIsLoading(false);
        return;
      }

      const resolvedOrganizationId = profile.organization_id;
      setOrganizationId(resolvedOrganizationId);
      setCurrentUserId(user.id);
      setCurrentRole(profile.role || "");

      const [rulesResult, departmentsResult, assetTypesResult, codesResult] = await Promise.all([
        supabase
          .from("apwa_mapping_rules")
          .select(
            "id, organization_id, department_id, asset_type_id, recommended_apwa_code_id, rule_name, notes, priority, is_active, created_by, updated_by, created_at, updated_at"
          )
          .eq("organization_id", resolvedOrganizationId)
          .order("priority", { ascending: true })
          .order("rule_name", { ascending: true }),
        supabase
          .from("departments")
          .select("id, department_name, department_code, is_active")
          .eq("organization_id", resolvedOrganizationId)
          .order("department_name", { ascending: true }),
        supabase
          .from("asset_types")
          .select("id, asset_type_name, asset_type_code, is_active")
          .eq("organization_id", resolvedOrganizationId)
          .order("asset_type_name", { ascending: true }),
        supabase
          .from("apwa_codes")
          .select("id, code, description, category, subcategory, is_active")
          .eq("is_active", true)
          .order("code", { ascending: true }),
      ]);

      if (!isMounted) return;

      const loadError =
        rulesResult.error || departmentsResult.error || assetTypesResult.error || codesResult.error;

      if (loadError) {
        console.error("ARGOS APWA Mapping load failed:", loadError);
        setErrorMessage(
          "ARGOS could not load APWA Mapping. Confirm the Sprint 001W migration and APWA catalog import are complete."
        );
        setIsLoading(false);
        return;
      }

      setRules(sortRules(rulesResult.data || []));
      setDepartments(departmentsResult.data || []);
      setAssetTypes(assetTypesResult.data || []);
      setApwaCodes(codesResult.data || []);
      setIsLoading(false);
    }

    loadAPWAMapping();
    return () => {
      isMounted = false;
    };
  }, [isDemoMode]);

  function updateForm(setter, field, value) {
    setter((current) => ({ ...current, [field]: value }));
  }

  function cleanRule(value) {
    return {
      rule_name: value.rule_name.trim() || null,
      department_id: value.department_id || null,
      asset_type_id: value.asset_type_id || null,
      recommended_apwa_code_id: value.recommended_apwa_code_id || null,
      priority: Math.max(0, Number(value.priority) || 0),
      notes: value.notes.trim() || null,
    };
  }

  function validateRule(value) {
    if (!value.department_id && !value.asset_type_id) {
      return "Select a Department, an Asset Type, or both.";
    }
    if (!value.recommended_apwa_code_id) {
      return "Select a recommended APWA code.";
    }
    return "";
  }

  function resetAddForm() {
    setForm(EMPTY_RULE);
    setShowAddForm(false);
  }

  function beginEdit(rule) {
    if (!canManage) {
      setActionMessage("Only an ARGOS administrator or manager can edit APWA mapping rules.");
      return;
    }
    setEditingRuleId(rule.id);
    setEditForm({
      rule_name: rule.rule_name || "",
      department_id: rule.department_id || "",
      asset_type_id: rule.asset_type_id || "",
      recommended_apwa_code_id: rule.recommended_apwa_code_id || "",
      priority: rule.priority ?? 100,
      notes: rule.notes || "",
    });
    setShowAddForm(false);
    setActionMessage("");
  }

  function cancelEdit() {
    setEditingRuleId(null);
    setEditForm(EMPTY_RULE);
  }

  async function createRule(event) {
    event.preventDefault();
    const payload = cleanRule(form);
    const validationMessage = validateRule(payload);

    if (validationMessage) {
      setActionMessage(validationMessage);
      return;
    }
    if (!canManage) {
      setActionMessage("Only an ARGOS administrator or manager can create APWA mapping rules.");
      return;
    }
    if (!organizationId) {
      setActionMessage("ARGOS could not resolve the current organization.");
      return;
    }

    if (isDemoMode) {
      setRules((current) =>
        sortRules([
          ...current,
          {
            id: `demo-rule-${Date.now()}`,
            organization_id: organizationId,
            ...payload,
            is_active: true,
          },
        ])
      );
      resetAddForm();
      setActionMessage("Demo APWA mapping rule created.");
      return;
    }

    setIsSaving(true);
    setActionMessage("");
    const { data, error } = await supabase
      .from("apwa_mapping_rules")
      .insert({
        organization_id: organizationId,
        ...payload,
        created_by: currentUserId,
        updated_by: currentUserId,
      })
      .select(
        "id, organization_id, department_id, asset_type_id, recommended_apwa_code_id, rule_name, notes, priority, is_active, created_by, updated_by, created_at, updated_at"
      )
      .single();

    if (error) {
      console.error("ARGOS APWA mapping creation failed:", error);
      setActionMessage(
        error.code === "23505"
          ? "A mapping rule already exists for that Department and Asset Type combination."
          : "ARGOS could not create the APWA mapping rule."
      );
      setIsSaving(false);
      return;
    }

    setRules((current) => sortRules([...current, data]));
    resetAddForm();
    setActionMessage("APWA mapping rule created.");
    setIsSaving(false);
  }

  async function saveRule(rule) {
    const payload = cleanRule(editForm);
    const validationMessage = validateRule(payload);

    if (validationMessage) {
      setActionMessage(validationMessage);
      return;
    }
    if (!canManage) {
      setActionMessage("Only an ARGOS administrator or manager can edit APWA mapping rules.");
      return;
    }

    if (isDemoMode) {
      setRules((current) =>
        sortRules(current.map((item) => (item.id === rule.id ? { ...item, ...payload } : item)))
      );
      cancelEdit();
      setActionMessage("Demo APWA mapping rule updated.");
      return;
    }

    setIsSaving(true);
    setActionMessage("");
    const { data, error } = await supabase
      .from("apwa_mapping_rules")
      .update({ ...payload, updated_by: currentUserId })
      .eq("id", rule.id)
      .eq("organization_id", organizationId)
      .select(
        "id, organization_id, department_id, asset_type_id, recommended_apwa_code_id, rule_name, notes, priority, is_active, created_by, updated_by, created_at, updated_at"
      )
      .single();

    if (error) {
      console.error("ARGOS APWA mapping update failed:", error);
      setActionMessage(
        error.code === "23505"
          ? "A mapping rule already exists for that Department and Asset Type combination."
          : "ARGOS could not update the APWA mapping rule."
      );
      setIsSaving(false);
      return;
    }

    setRules((current) => sortRules(current.map((item) => (item.id === data.id ? data : item))));
    cancelEdit();
    setActionMessage("APWA mapping rule updated.");
    setIsSaving(false);
  }

  async function disableRule(rule) {
    if (!canManage) {
      setActionMessage("Only an ARGOS administrator or manager can disable APWA mapping rules.");
      return;
    }
    if (!window.confirm(`Disable ${rule.rule_name || "this APWA mapping rule"}?`)) return;

    if (isDemoMode) {
      setRules((current) =>
        current.map((item) => (item.id === rule.id ? { ...item, is_active: false } : item))
      );
      setActionMessage("Demo APWA mapping rule disabled.");
      return;
    }

    const { data, error } = await supabase
      .from("apwa_mapping_rules")
      .update({ is_active: false, updated_by: currentUserId })
      .eq("id", rule.id)
      .eq("organization_id", organizationId)
      .select(
        "id, organization_id, department_id, asset_type_id, recommended_apwa_code_id, rule_name, notes, priority, is_active, created_by, updated_by, created_at, updated_at"
      )
      .single();

    if (error) {
      console.error("ARGOS APWA mapping disable failed:", error);
      setActionMessage("ARGOS could not disable the APWA mapping rule.");
      return;
    }

    setRules((current) => current.map((item) => (item.id === data.id ? data : item)));
    setActionMessage("APWA mapping rule disabled.");
  }

  function getMatchType(rule) {
    if (rule.department_id && rule.asset_type_id) return "Exact Match";
    if (rule.asset_type_id) return "Asset Type";
    return "Department";
  }

  function renderRuleFields(source, setter, compact = false) {
    return (
      <>
        <label>
          Rule Name
          <input
            type="text"
            value={source.rule_name}
            maxLength={120}
            placeholder="Example: Police SUV"
            onChange={(event) => updateForm(setter, "rule_name", event.target.value)}
          />
        </label>
        <label>
          Department
          <select
            value={source.department_id}
            onChange={(event) => updateForm(setter, "department_id", event.target.value)}
          >
            <option value="">Any Department</option>
            {departments
              .filter((department) => department.is_active || department.id === source.department_id)
              .map((department) => (
                <option key={department.id} value={department.id}>
                  {department.department_name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Asset Type
          <select
            value={source.asset_type_id}
            onChange={(event) => updateForm(setter, "asset_type_id", event.target.value)}
          >
            <option value="">Any Asset Type</option>
            {assetTypes
              .filter((assetType) => assetType.is_active || assetType.id === source.asset_type_id)
              .map((assetType) => (
                <option key={assetType.id} value={assetType.id}>
                  {assetType.asset_type_name}
                </option>
              ))}
          </select>
        </label>
        <label className={compact ? "argos-apwa-code-field compact" : "argos-apwa-code-field"}>
          Recommended APWA Code
          <select
            value={source.recommended_apwa_code_id}
            onChange={(event) =>
              updateForm(setter, "recommended_apwa_code_id", event.target.value)
            }
          >
            <option value="">Select APWA Code</option>
            {apwaCodes.map((code) => (
              <option key={code.id} value={code.id}>
                {code.code} — {code.description}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <input
            type="number"
            min="0"
            value={source.priority}
            onChange={(event) => updateForm(setter, "priority", event.target.value)}
          />
        </label>
        <label className="argos-apwa-notes-field">
          Notes
          <input
            type="text"
            value={source.notes}
            maxLength={500}
            placeholder="Optional implementation note"
            onChange={(event) => updateForm(setter, "notes", event.target.value)}
          />
        </label>
      </>
    );
  }

  return (
    <div className="argos-apwa-content">
      <div className="argos-apwa-heading">
        <div>
          <p className="eyebrow">Fleet Classification Intelligence</p>
          <h4>APWA Mapping</h4>
          <p>
            Configure organization-specific rules that recommend APWA equipment codes from a
            Department, an Asset Type, or an exact combination of both.
          </p>
        </div>
        <span className="argos-apwa-mode">{canManage ? "Manager Access" : "Read Only"}</span>
      </div>

      <div className="argos-apwa-actions">
        <button
          type="button"
          disabled={!canManage || apwaCodes.length === 0}
          onClick={() => {
            setShowAddForm((current) => !current);
            setEditingRuleId(null);
            setActionMessage("");
          }}
        >
          {showAddForm ? "Cancel Add" : "Add Mapping Rule"}
        </button>
      </div>

      {showAddForm && (
        <form className="argos-apwa-form" onSubmit={createRule}>
          {renderRuleFields(form, setForm)}
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Create Rule"}
          </button>
        </form>
      )}

      {actionMessage && <div className="argos-apwa-action-message">{actionMessage}</div>}

      <div className="argos-apwa-summary">
        <div><span>Total Rules</span><strong>{rules.length}</strong></div>
        <div><span>Active Rules</span><strong>{activeRules.length}</strong></div>
        <div><span>Exact Matches</span><strong>{exactRules.length}</strong></div>
        <div><span>APWA Codes</span><strong>{apwaCodes.length}</strong></div>
      </div>

      {!isLoading && !errorMessage && apwaCodes.length === 0 && (
        <div className="argos-apwa-catalog-warning">
          <strong>APWA catalog required</strong>
          <span>
            The mapping workspace is live, but no active APWA codes are available yet. Import the
            approved APWA catalog before creating mapping rules.
          </span>
        </div>
      )}

      {isLoading ? (
        <APWAState>Loading APWA Mapping…</APWAState>
      ) : errorMessage ? (
        <APWAState error>{errorMessage}</APWAState>
      ) : rules.length === 0 ? (
        <APWAState>No APWA mapping rules have been configured for this organization.</APWAState>
      ) : (
        <div className="argos-apwa-table-wrap">
          <table className="argos-apwa-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Department</th>
                <th>Asset Type</th>
                <th>APWA Recommendation</th>
                <th>Match</th>
                <th>Priority</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const isEditing = editingRuleId === rule.id;
                const code = apwaCodeById[rule.recommended_apwa_code_id];
                return (
                  <tr key={rule.id}>
                    {isEditing ? (
                      <td colSpan="7">
                        <div className="argos-apwa-inline-form">
                          {renderRuleFields(editForm, setEditForm, true)}
                        </div>
                      </td>
                    ) : (
                      <>
                        <td>
                          <strong className="argos-apwa-rule-name">
                            {rule.rule_name || "Unnamed Mapping Rule"}
                          </strong>
                          {rule.notes && <small>{rule.notes}</small>}
                        </td>
                        <td>{departmentById[rule.department_id]?.department_name || "Any Department"}</td>
                        <td>{assetTypeById[rule.asset_type_id]?.asset_type_name || "Any Asset Type"}</td>
                        <td>
                          <strong className="argos-apwa-code">{code?.code || "Unavailable"}</strong>
                          <small>{code?.description || "APWA catalog record unavailable"}</small>
                        </td>
                        <td><span className="argos-apwa-match">{getMatchType(rule)}</span></td>
                        <td>{rule.priority}</td>
                        <td>
                          <span className={`argos-apwa-status ${rule.is_active ? "active" : "inactive"}`}>
                            {rule.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </>
                    )}
                    <td>
                      <div className="argos-apwa-row-actions">
                        {isEditing ? (
                          <>
                            <button type="button" onClick={() => saveRule(rule)} disabled={isSaving}>Save</button>
                            <button type="button" onClick={cancelEdit} disabled={isSaving}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => beginEdit(rule)} disabled={!canManage || !rule.is_active}>Edit</button>
                            <button className="disable" type="button" onClick={() => disableRule(rule)} disabled={!canManage || !rule.is_active}>
                              {rule.is_active ? "Disable" : "Disabled"}
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

      <div className="argos-apwa-foundation-note">
        <strong>Sprint 001W operational boundary</strong>
        <span>
          APWA Mapping manages recommendation rules only. The APWA reference catalog remains
          migration- or service-role-managed, and asset assignment will be connected during the
          next operational integration phase.
        </span>
      </div>
    </div>
  );
}
