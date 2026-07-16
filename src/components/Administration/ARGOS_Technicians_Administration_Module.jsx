import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./ARGOS_Technicians_Administration_Module.css";

const SELECT_FIELDS = "id, organization_id, technician_name, employee_number, email, phone, is_active, created_at, updated_at";
const DEMO_TECHNICIANS = [
  { id: "demo-1", technician_name: "M. Carter", employee_number: "T-101", email: "", phone: "", is_active: true },
  { id: "demo-2", technician_name: "J. Reynolds", employee_number: "T-102", email: "", phone: "", is_active: true },
  { id: "demo-3", technician_name: "S. Mitchell", employee_number: "T-103", email: "", phone: "", is_active: true },
];

function sortRows(rows) {
  return [...rows].sort((a, b) => a.technician_name.localeCompare(b.technician_name));
}

export default function ARGOSTechniciansAdministrationModule({ isDemoMode }) {
  const [technicians, setTechnicians] = useState(isDemoMode ? DEMO_TECHNICIANS : []);
  const [assetCounts, setAssetCounts] = useState({});
  const [organizationId, setOrganizationId] = useState(null);
  const [currentRole, setCurrentRole] = useState(isDemoMode ? "admin" : "");
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ technician_name: "", employee_number: "", email: "", phone: "" });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const canManage = ["admin", "administrator", "manager"].includes(String(currentRole || "").toLowerCase());
  const activeCount = useMemo(() => technicians.filter((row) => row.is_active).length, [technicians]);

  useEffect(() => {
    let mounted = true;
    if (isDemoMode) {
      setTechnicians(DEMO_TECHNICIANS);
      setCurrentRole("admin");
      setIsLoading(false);
      return undefined;
    }

    async function load() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!mounted) return;
      if (authError || !user) {
        setErrorMessage("ARGOS could not verify the signed-in user.");
        setIsLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id, role")
        .eq("id", user.id)
        .single();

      if (!mounted) return;
      if (profileError || !profile?.organization_id) {
        setErrorMessage("ARGOS could not resolve the current organization.");
        setIsLoading(false);
        return;
      }

      setOrganizationId(profile.organization_id);
      setCurrentRole(profile.role || "");

      const [{ data: rows, error }, { data: assets }] = await Promise.all([
        supabase.from("technicians").select(SELECT_FIELDS).eq("organization_id", profile.organization_id).order("technician_name"),
        supabase.from("assets").select("technician_id").eq("organization_id", profile.organization_id),
      ]);

      if (!mounted) return;
      if (error) {
        console.error(error);
        setErrorMessage("ARGOS could not load technicians. Confirm the Sprint 001M migration completed.");
        setIsLoading(false);
        return;
      }

      const counts = (assets || []).reduce((result, asset) => {
        if (asset.technician_id) result[asset.technician_id] = (result[asset.technician_id] || 0) + 1;
        return result;
      }, {});

      setTechnicians(rows || []);
      setAssetCounts(counts);
      setIsLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, [isDemoMode]);

  function clean(record) {
    return {
      technician_name: String(record.technician_name || "").trim(),
      employee_number: String(record.employee_number || "").trim().toUpperCase() || null,
      email: String(record.email || "").trim().toLowerCase() || null,
      phone: String(record.phone || "").trim() || null,
    };
  }

  async function createTechnician(event) {
    event.preventDefault();
    const payload = clean(draft);
    if (!payload.technician_name) return setActionMessage("Technician name is required.");
    if (!canManage) return setActionMessage("Only an administrator or manager can create technicians.");

    if (isDemoMode) {
      setTechnicians((current) => sortRows([...current, { ...payload, id: `demo-${Date.now()}`, is_active: true }]));
      setDraft({ technician_name: "", employee_number: "", email: "", phone: "" });
      setShowAdd(false);
      return setActionMessage("Demo technician created.");
    }

    setIsSaving(true);
    const { data, error } = await supabase
      .from("technicians")
      .insert({ organization_id: organizationId, ...payload })
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      setActionMessage(error.code === "23505" ? "That technician name or employee number already exists." : "ARGOS could not create the technician.");
      setIsSaving(false);
      return;
    }

    setTechnicians((current) => sortRows([...current, data]));
    setDraft({ technician_name: "", employee_number: "", email: "", phone: "" });
    setShowAdd(false);
    setActionMessage("Technician created.");
    setIsSaving(false);
  }

  async function saveTechnician(row) {
    const payload = clean(editDraft);
    if (!payload.technician_name) return setActionMessage("Technician name is required.");
    if (!canManage) return setActionMessage("Only an administrator or manager can edit technicians.");

    if (isDemoMode) {
      setTechnicians((current) => sortRows(current.map((item) => item.id === row.id ? { ...item, ...payload } : item)));
      setEditingId(null);
      return setActionMessage("Demo technician updated.");
    }

    setIsSaving(true);
    const { data, error } = await supabase
      .from("technicians")
      .update(payload)
      .eq("id", row.id)
      .eq("organization_id", organizationId)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      setActionMessage(error.code === "23505" ? "That technician name or employee number already exists." : "ARGOS could not update the technician.");
      setIsSaving(false);
      return;
    }

    setTechnicians((current) => sortRows(current.map((item) => item.id === data.id ? data : item)));
    setEditingId(null);
    setActionMessage("Technician updated.");
    setIsSaving(false);
  }

  async function disableTechnician(row) {
    if (!canManage) return setActionMessage("Only an administrator or manager can disable technicians.");
    const count = assetCounts[row.id] || 0;
    if (!window.confirm(`Disable ${row.technician_name}? ${count} existing assignment${count === 1 ? "" : "s"} will remain visible.`)) return;

    if (isDemoMode) {
      setTechnicians((current) => current.map((item) => item.id === row.id ? { ...item, is_active: false } : item));
      return setActionMessage("Demo technician disabled.");
    }

    const { data, error } = await supabase
      .from("technicians")
      .update({ is_active: false })
      .eq("id", row.id)
      .eq("organization_id", organizationId)
      .select(SELECT_FIELDS)
      .single();

    if (error) return setActionMessage("ARGOS could not disable the technician.");
    setTechnicians((current) => current.map((item) => item.id === data.id ? data : item));
    setActionMessage("Technician disabled.");
  }

  function input(record, setter, field, type = "text") {
    return <input type={type} value={record[field] || ""} onChange={(event) => setter((current) => ({ ...current, [field]: event.target.value }))} />;
  }

  return (
    <div className="argos-technicians-content">
      <div className="argos-technicians-heading">
        <div>
          <p className="eyebrow">Organization Workforce</p>
          <h4>Technicians</h4>
          <p>Maintain controlled technician records used for asset assignment and workload analytics.</p>
        </div>
        <span className="argos-technicians-mode">{canManage ? "Admin / Manager" : "Read Only"}</span>
      </div>

      <div className="argos-technicians-actions">
        <button type="button" disabled={!canManage} onClick={() => setShowAdd((value) => !value)}>{showAdd ? "Cancel Add" : "Add Technician"}</button>
      </div>

      {showAdd && (
        <form className="argos-technicians-form" onSubmit={createTechnician}>
          <label>Technician Name{input(draft, setDraft, "technician_name")}</label>
          <label>Employee Number{input(draft, setDraft, "employee_number")}</label>
          <label>Email{input(draft, setDraft, "email", "email")}</label>
          <label>Phone{input(draft, setDraft, "phone")}</label>
          <button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Create Technician"}</button>
        </form>
      )}

      {actionMessage && <div className="argos-technicians-action-message">{actionMessage}</div>}

      <div className="argos-technicians-summary">
        <div><span>Total Technicians</span><strong>{technicians.length}</strong></div>
        <div><span>Active Technicians</span><strong>{activeCount}</strong></div>
      </div>

      {isLoading ? <div className="argos-technicians-state">Loading technicians…</div> :
       errorMessage ? <div className="argos-technicians-state error">{errorMessage}</div> :
       technicians.length === 0 ? <div className="argos-technicians-state">No technicians have been configured.</div> :
       <div className="argos-technicians-table-wrap">
         <table className="argos-technicians-table">
           <thead><tr><th>Name</th><th>Employee #</th><th>Email</th><th>Phone</th><th>Assignments</th><th>Status</th><th>Actions</th></tr></thead>
           <tbody>
             {technicians.map((row) => {
               const editing = editingId === row.id;
               return (
                 <tr key={row.id}>
                   <td>{editing ? input(editDraft, setEditDraft, "technician_name") : row.technician_name}</td>
                   <td>{editing ? input(editDraft, setEditDraft, "employee_number") : row.employee_number || "—"}</td>
                   <td>{editing ? input(editDraft, setEditDraft, "email") : row.email || "—"}</td>
                   <td>{editing ? input(editDraft, setEditDraft, "phone") : row.phone || "—"}</td>
                   <td>{assetCounts[row.id] || 0}</td>
                   <td><span className={`argos-technicians-status ${row.is_active ? "active" : "inactive"}`}>{row.is_active ? "Active" : "Inactive"}</span></td>
                   <td><div className="argos-technicians-row-actions">
                     {editing ? <>
                       <button type="button" onClick={() => saveTechnician(row)} disabled={isSaving}>Save</button>
                       <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                     </> : <>
                       <button type="button" disabled={!canManage} onClick={() => { setEditingId(row.id); setEditDraft({ ...row }); setActionMessage(""); }}>Edit</button>
                       <button className="disable" type="button" disabled={!canManage || !row.is_active} onClick={() => disableTechnician(row)}>Disable</button>
                     </>}
                   </div></td>
                 </tr>
               );
             })}
           </tbody>
         </table>
       </div>}

      <div className="argos-technicians-foundation-note">
        <strong>Sprint 001M boundary</strong>
        <span>Technicians are organization-scoped controlled records. Administrators and managers may maintain them. Historical technician text remains intact while active asset assignments use technician IDs.</span>
      </div>
    </div>
  );
}
