import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./ARGOS_Status_Configuration_Administration_Module.css";

const DEMO_STATUSES = [
  ["Ready","READY",10,"#146C2E",true,false,false],
  ["Down","DOWN",20,"#A61B1B",false,true,true],
  ["In Shop","IN_SHOP",30,"#245B8A",false,true,true],
  ["At 3rd Party Shop","THIRD_PARTY",40,"#6C4A8B",false,true,true],
  ["Waiting Parts","WAITING_PARTS",50,"#A96300",false,true,true],
  ["Awaiting Approval","AWAITING_APPROVAL",60,"#82550F",false,true,true],
  ["Awaiting QC","AWAITING_QC",70,"#5B4B9A",false,true,true],
  ["Ready for Pickup","READY_PICKUP",80,"#8A6A14",false,true,true],
].map(([status_name,status_code,display_order,status_color,counts_as_available,requires_down_date,allows_reason_mapping],index)=>({
  id:`demo-${index}`,status_name,status_code,display_order,status_color,counts_as_available,
  requires_down_date,allows_reason_mapping,is_system_status:true,is_active:true
}));

const EMPTY={status_name:"",status_code:"",display_order:100,status_color:"#526174",counts_as_available:false,requires_down_date:true,allows_reason_mapping:true};
const FIELDS="id, organization_id, status_name, status_code, display_order, status_color, counts_as_available, requires_down_date, allows_reason_mapping, is_system_status, is_active, created_at, updated_at";
const sortRows=(rows)=>[...rows].sort((a,b)=>Number(a.display_order)-Number(b.display_order)||a.status_name.localeCompare(b.status_name));

export default function ARGOSStatusConfigurationAdministrationModule({isDemoMode}) {
  const [rows,setRows]=useState(isDemoMode?DEMO_STATUSES:[]);
  const [counts,setCounts]=useState({});
  const [organizationId,setOrganizationId]=useState(null);
  const [role,setRole]=useState(isDemoMode?"admin":"");
  const [loading,setLoading]=useState(!isDemoMode);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState(EMPTY);
  const [editingId,setEditingId]=useState(null);
  const [edit,setEdit]=useState(EMPTY);
  const [saving,setSaving]=useState(false);
  const isAdmin=["admin","administrator"].includes(String(role).toLowerCase());
  const active=useMemo(()=>rows.filter((row)=>row.is_active),[rows]);

  useEffect(()=>{
    let mounted=true;
    if(isDemoMode){setRows(DEMO_STATUSES);setRole("admin");setLoading(false);return undefined;}
    async function load(){
      setLoading(true);setError("");
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(!mounted)return;
      if(authError||!user){setError("ARGOS could not verify the signed-in user.");setLoading(false);return;}
      const {data:profile,error:profileError}=await supabase.from("profiles").select("organization_id, role").eq("id",user.id).single();
      if(!mounted)return;
      if(profileError||!profile?.organization_id){setError("ARGOS could not resolve the current organization.");setLoading(false);return;}
      setOrganizationId(profile.organization_id);setRole(profile.role||"");
      const [{data:statusRows,error:statusError},{data:assetRows,error:assetError}]=await Promise.all([
        supabase.from("status_configurations").select(FIELDS).eq("organization_id",profile.organization_id).order("display_order").order("status_name"),
        supabase.from("assets").select("status").eq("organization_id",profile.organization_id),
      ]);
      if(!mounted)return;
      if(statusError){console.error(statusError);setError("ARGOS could not load Status Configuration. Confirm the Sprint 001L migration completed.");setLoading(false);return;}
      if(assetError)console.error(assetError);
      const nextCounts=(assetRows||[]).reduce((acc,row)=>{const key=String(row.status||"").toLowerCase();if(key)acc[key]=(acc[key]||0)+1;return acc;},{});
      setRows(sortRows(statusRows||[]));setCounts(nextCounts);setLoading(false);
    }
    load();return()=>{mounted=false;};
  },[isDemoMode]);

  const change=(setter,key,value)=>setter((current)=>({...current,[key]:value}));
  const clean=(value)=>({...value,status_name:value.status_name.trim(),status_code:value.status_code.trim().toUpperCase(),display_order:Math.max(0,Number(value.display_order)||0)});
  const validate=(value)=>!value.status_name?"Status name is required.":!value.status_code?"Status code is required.":!/^#[0-9A-Fa-f]{6}$/.test(value.status_color)?"Status color must be a six-digit hexadecimal color.":"";
  const begin=(row)=>{setEditingId(row.id);setEdit({...row});setMessage("");};
  const cancel=()=>{setEditingId(null);setEdit(EMPTY);};

  async function createStatus(event){
    event.preventDefault();const payload=clean(form);const problem=validate(payload);if(problem){setMessage(problem);return;}if(!isAdmin){setMessage("Only an ARGOS administrator can create statuses.");return;}
    if(isDemoMode){setRows((current)=>sortRows([...current,{...payload,id:`demo-${Date.now()}`,is_system_status:false,is_active:true}]));setForm(EMPTY);setShowAdd(false);setMessage("Demo status created.");return;}
    setSaving(true);const {data,error:createError}=await supabase.from("status_configurations").insert({organization_id:organizationId,...payload,is_system_status:false}).select(FIELDS).single();
    if(createError){setMessage(createError.code==="23505"?"That status name or code already exists for this organization.":"ARGOS could not create the status.");setSaving(false);return;}
    setRows((current)=>sortRows([...current,data]));setForm(EMPTY);setShowAdd(false);setMessage("Status created.");setSaving(false);
  }

  async function saveStatus(row){
    const payload=clean(edit);const problem=validate(payload);if(problem){setMessage(problem);return;}if(row.is_system_status){payload.status_name=row.status_name;payload.status_code=row.status_code;}
    if(isDemoMode){setRows((current)=>sortRows(current.map((item)=>item.id===row.id?{...item,...payload}:item)));cancel();setMessage("Demo status updated.");return;}
    setSaving(true);const {data,error:updateError}=await supabase.from("status_configurations").update(payload).eq("id",row.id).eq("organization_id",organizationId).select(FIELDS).single();
    if(updateError){setMessage(updateError.code==="23505"?"That status name or code already exists for this organization.":"ARGOS could not update the status.");setSaving(false);return;}
    setRows((current)=>sortRows(current.map((item)=>item.id===data.id?data:item)));cancel();setMessage("Status updated.");setSaving(false);
  }

  async function disableStatus(row){
    if(row.is_system_status){setMessage("Core ARGOS statuses cannot be disabled during Version 1.0.");return;}
    if(!window.confirm(`Disable ${row.status_name}? Existing records will remain unchanged.`))return;
    if(isDemoMode){setRows((current)=>current.map((item)=>item.id===row.id?{...item,is_active:false}:item));setMessage("Demo status disabled.");return;}
    const {data,error:disableError}=await supabase.from("status_configurations").update({is_active:false}).eq("id",row.id).eq("organization_id",organizationId).select(FIELDS).single();
    if(disableError){setMessage("ARGOS could not disable the status.");return;}setRows((current)=>current.map((item)=>item.id===data.id?data:item));setMessage("Status disabled.");
  }

  const field=(source,setter,key,type="text",disabled=false)=><input type={type} value={type==="checkbox"?undefined:source[key]} checked={type==="checkbox"?source[key]:undefined} disabled={disabled} onChange={(event)=>change(setter,key,type==="checkbox"?event.target.checked:event.target.value)} />;

  return <div className="argos-status-config-content">
    <div className="argos-status-config-heading"><div><p className="eyebrow">Operational Workflow</p><h4>Status Configuration</h4><p>Maintain organization-scoped statuses, ordering, colors, availability behavior, down-date requirements, and future Reason mappings.</p></div><span className="argos-status-config-mode">{isAdmin?"Administrator":"Read Only"}</span></div>
    <div className="argos-status-config-actions"><button type="button" disabled={!isAdmin} onClick={()=>{setShowAdd((value)=>!value);setMessage("");}}>{showAdd?"Cancel Add":"Add Status"}</button></div>
    {showAdd&&<form className="argos-status-config-form" onSubmit={createStatus}>
      <label>Status Name{field(form,setForm,"status_name")}</label><label>Status Code{field(form,setForm,"status_code")}</label><label>Display Order{field(form,setForm,"display_order","number")}</label><label>Status Color<div className="argos-status-config-color-field">{field(form,setForm,"status_color","color")}{field(form,setForm,"status_color")}</div></label>
      <label className="argos-status-config-check">{field(form,setForm,"counts_as_available","checkbox")}Counts as Available</label><label className="argos-status-config-check">{field(form,setForm,"requires_down_date","checkbox")}Requires Down Date</label><label className="argos-status-config-check">{field(form,setForm,"allows_reason_mapping","checkbox")}Allow Reason Mapping</label><button disabled={saving}>{saving?"Saving…":"Create Status"}</button>
    </form>}
    {message&&<div className="argos-status-config-action-message">{message}</div>}
    <div className="argos-status-config-summary"><div><span>Total Statuses</span><strong>{rows.length}</strong></div><div><span>Active Statuses</span><strong>{active.length}</strong></div><div><span>Available Statuses</span><strong>{active.filter((row)=>row.counts_as_available).length}</strong></div></div>
    {loading?<div className="argos-status-config-state">Loading Status Configuration…</div>:error?<div className="argos-status-config-state error">{error}</div>:<div className="argos-status-config-table-wrap"><table className="argos-status-config-table"><thead><tr><th>Status</th><th>Code</th><th>Order</th><th>Color</th><th>Available</th><th>Down Date</th><th>Assets</th><th>State</th><th>Actions</th></tr></thead><tbody>{rows.map((row)=>{const editing=editingId===row.id;return <tr key={row.id}><td className="argos-status-config-name">{editing?field(edit,setEdit,"status_name","text",row.is_system_status):row.status_name}</td><td>{editing?field(edit,setEdit,"status_code","text",row.is_system_status):row.status_code}</td><td>{editing?field(edit,setEdit,"display_order","number"):row.display_order}</td><td>{editing?field(edit,setEdit,"status_color","color"):<span className="argos-status-config-swatch" style={{backgroundColor:row.status_color}} />}</td><td>{editing?field(edit,setEdit,"counts_as_available","checkbox"):(row.counts_as_available?"Yes":"No")}</td><td>{editing?field(edit,setEdit,"requires_down_date","checkbox"):(row.requires_down_date?"Required":"Not required")}</td><td>{counts[row.status_name.toLowerCase()]||0}</td><td><span className={`argos-status-config-status ${row.is_active?"active":"inactive"}`}>{row.is_active?"Active":"Inactive"}</span></td><td><div className="argos-status-config-row-actions">{editing?<><button type="button" onClick={()=>saveStatus(row)} disabled={saving}>Save</button><button type="button" onClick={cancel}>Cancel</button></>:<><button type="button" disabled={!isAdmin} onClick={()=>begin(row)}>Edit</button><button className="disable" type="button" disabled={!isAdmin||!row.is_active||row.is_system_status} onClick={()=>disableStatus(row)}>{row.is_active?"Disable":"Disabled"}</button></>}</div></td></tr>;})}</tbody></table></div>}
    <div className="argos-status-config-foundation-note"><strong>Sprint 001L boundary</strong><span>Status choices now load from organization-scoped configuration. Core names and codes remain protected because current assets and history store status text. Allow Reason Mapping prepares Sprint 001M without creating a partial relationship.</span></div>
  </div>;
}
