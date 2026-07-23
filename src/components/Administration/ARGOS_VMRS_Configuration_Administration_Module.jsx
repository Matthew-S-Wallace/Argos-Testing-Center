import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import ARGOSVMRSImportDialog from "./ARGOS_VMRS_Import_Dialog";
import "./ARGOS_VMRS_Configuration_Administration_Module.css";

const CODE_TYPES = [
  "SYSTEM",
  "ASSEMBLY",
  "COMPONENT",
  "REASON",
  "WORK_ACCOMPLISHED",
  "POSITION",
  "OTHER",
];

const DEMO_CODES = [
  {
    id: "demo-system",
    code: "013",
    description: "Brakes",
    code_type: "SYSTEM",
    parent_id: null,
    is_active: true,
  },
  {
    id: "demo-assembly",
    code: "013-001",
    description: "Foundation Brake",
    code_type: "ASSEMBLY",
    parent_id: "demo-system",
    is_active: true,
  },
  {
    id: "demo-component",
    code: "013-001-015",
    description: "Brake Pad / Lining",
    code_type: "COMPONENT",
    parent_id: "demo-assembly",
    is_active: true,
  },
  {
    id: "demo-reason",
    code: "REASON-WORN",
    description: "Worn",
    code_type: "REASON",
    parent_id: null,
    is_active: true,
  },
  {
    id: "demo-work",
    code: "WORK-REPLACE",
    description: "Replace",
    code_type: "WORK_ACCOMPLISHED",
    parent_id: null,
    is_active: true,
  },
];

const DEMO_CONFIGURATION = [
  {
    id: "demo-config-1",
    organization_id: "demo-organization",
    vmrs_code_id: "demo-system",
    display_name: null,
    notes: null,
    display_order: 10,
    is_enabled: true,
    is_required: false,
  },
  {
    id: "demo-config-2",
    organization_id: "demo-organization",
    vmrs_code_id: "demo-assembly",
    display_name: null,
    notes: null,
    display_order: 20,
    is_enabled: true,
    is_required: false,
  },
];

function normalizeType(value) {
  return String(value || "OTHER").trim().toUpperCase();
}

function formatType(value) {
  return normalizeType(value)
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function VMRSState({ children, error = false }) {
  return <div className={`argos-vmrs-state${error ? " error" : ""}`}>{children}</div>;
}

export default function ARGOSVMRSConfigurationAdministrationModule({ isDemoMode }) {
  const [codes, setCodes] = useState(isDemoMode ? DEMO_CODES : []);
  const [configuration, setConfiguration] = useState(
    isDemoMode ? DEMO_CONFIGURATION : [],
  );
  const [importBatches, setImportBatches] = useState([]);
  const [organizationId, setOrganizationId] = useState(
    isDemoMode ? "demo-organization" : null,
  );
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentRole, setCurrentRole] = useState(isDemoMode ? "admin" : "");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [savingCodeId, setSavingCodeId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const canManage =
    isDemoMode || ["admin", "administrator", "manager"].includes(
      String(currentRole || "").trim().toLowerCase(),
    );

  const configurationByCodeId = useMemo(
    () =>
      Object.fromEntries(
        configuration.map((record) => [record.vmrs_code_id, record]),
      ),
    [configuration],
  );

  const enabledCount = useMemo(
    () => configuration.filter((record) => record.is_enabled).length,
    [configuration],
  );

  const activeCatalogCount = useMemo(
    () => codes.filter((code) => code.is_active !== false).length,
    [codes],
  );

  const visibleCodes = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return codes.filter((code) => {
      const configurationRecord = configurationByCodeId[code.id];
      const enabled = Boolean(configurationRecord?.is_enabled);
      const matchesSearch =
        !normalizedSearch ||
        String(code.code || "").toLowerCase().includes(normalizedSearch) ||
        String(code.description || "").toLowerCase().includes(normalizedSearch) ||
        String(configurationRecord?.display_name || "")
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesType =
        typeFilter === "ALL" || normalizeType(code.code_type) === typeFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ENABLED" && enabled) ||
        (statusFilter === "AVAILABLE" && !enabled);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [codes, configurationByCodeId, searchTerm, statusFilter, typeFilter]);

  const latestImport = useMemo(() => {
    if (!importBatches.length) return null;

    return [...importBatches].sort((first, second) => {
      const firstDate = new Date(
        first.completed_at || first.created_at || first.started_at || 0,
      ).getTime();
      const secondDate = new Date(
        second.completed_at || second.created_at || second.started_at || 0,
      ).getTime();
      return secondDate - firstDate;
    })[0];
  }, [importBatches]);

  useEffect(() => {
    let isMounted = true;

    if (isDemoMode) {
      setCodes(DEMO_CODES);
      setConfiguration(DEMO_CONFIGURATION);
      setOrganizationId("demo-organization");
      setCurrentRole("admin");
      setIsLoading(false);
      return undefined;
    }

    async function loadVMRSConfiguration() {
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
        console.error("ARGOS VMRS organization lookup failed:", profileError);
        setErrorMessage("ARGOS could not resolve the current organization.");
        setIsLoading(false);
        return;
      }

      const resolvedOrganizationId = profile.organization_id;
      setOrganizationId(resolvedOrganizationId);
      setCurrentUserId(user.id);
      setCurrentRole(profile.role || "");

      const [codesResult, configurationResult, importResult] = await Promise.all([
        supabase
          .from("vmrs_codes")
          .select("*")
          .eq("organization_id", resolvedOrganizationId)
          .order("code_type", { ascending: true })
          .order("code", { ascending: true }),
        supabase
          .from("vmrs_organization_configuration")
          .select("*")
          .eq("organization_id", resolvedOrganizationId)
          .order("display_order", { ascending: true }),
        supabase
          .from("vmrs_import_batches")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (!isMounted) return;

      const loadError =
        codesResult.error || configurationResult.error || importResult.error;

      if (loadError) {
        console.error("ARGOS VMRS Configuration load failed:", loadError);
        setErrorMessage(
          "ARGOS could not load VMRS Configuration. Confirm the Sprint 001X database foundation is installed.",
        );
        setIsLoading(false);
        return;
      }

      setCodes(codesResult.data || []);
      setConfiguration(configurationResult.data || []);
      setImportBatches(importResult.data || []);
      setIsLoading(false);
    }

    loadVMRSConfiguration();

    return () => {
      isMounted = false;
    };
  }, [isDemoMode]);

  async function toggleCode(code) {
    const existingConfiguration = configurationByCodeId[code.id];
    const willEnable = !existingConfiguration?.is_enabled;

    if (!canManage) {
      setActionMessage(
        "Only an ARGOS administrator or manager can change VMRS configuration.",
      );
      return;
    }

    if (!organizationId) {
      setActionMessage("ARGOS could not resolve the current organization.");
      return;
    }

    if (isDemoMode) {
      setConfiguration((current) => {
        if (existingConfiguration) {
          return current.map((record) =>
            record.vmrs_code_id === code.id
              ? { ...record, is_enabled: willEnable }
              : record,
          );
        }

        return [
          ...current,
          {
            id: `demo-config-${Date.now()}`,
            organization_id: organizationId,
            vmrs_code_id: code.id,
            display_name: null,
            notes: null,
            display_order: current.length * 10 + 10,
            is_enabled: true,
            is_required: false,
          },
        ];
      });
      setActionMessage(
        `${code.code} ${willEnable ? "enabled" : "disabled"} for the demo organization.`,
      );
      return;
    }

    setSavingCodeId(code.id);
    setActionMessage("");

    let result;

    if (existingConfiguration) {
      result = await supabase
        .from("vmrs_organization_configuration")
        .update({
          is_enabled: willEnable,
          updated_by: currentUserId,
        })
        .eq("id", existingConfiguration.id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();
    } else {
      result = await supabase
        .from("vmrs_organization_configuration")
        .insert({
          organization_id: organizationId,
          vmrs_code_id: code.id,
          display_order: configuration.length * 10 + 10,
          is_enabled: true,
          is_required: false,
          created_by: currentUserId,
          updated_by: currentUserId,
        })
        .select("*")
        .single();
    }

    if (result.error) {
      console.error("ARGOS VMRS configuration update failed:", result.error);
      setActionMessage("ARGOS could not update the VMRS configuration.");
      setSavingCodeId(null);
      return;
    }

    setConfiguration((current) => {
      const exists = current.some((record) => record.id === result.data.id);
      return exists
        ? current.map((record) =>
            record.id === result.data.id ? result.data : record,
          )
        : [...current, result.data];
    });
    setActionMessage(
      `${code.code} ${willEnable ? "enabled" : "disabled"} for this organization.`,
    );
    setSavingCodeId(null);
  }

  function getParentLabel(code) {
    if (!code.parent_id) return "Top Level";
    const parent = codes.find((item) => item.id === code.parent_id);
    return parent ? `${parent.code} — ${parent.description}` : "Parent unavailable";
  }

  function formatImportStatus(batch) {
    return String(batch?.status || batch?.import_status || "Recorded")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  return (
    <div className="argos-vmrs-content">
      <div className="argos-vmrs-heading">
        <div>
          <p className="eyebrow">Maintenance Classification Intelligence</p>
          <h4>VMRS Catalog Management</h4>
          <p>
            Import and manage your organization’s licensed VMRS catalog. ARGOS uses the
            organization-supplied reference data to support repair classification and operational
            reporting. VMRS reference data is not distributed with ARGOS.
          </p>
        </div>
        <span className="argos-vmrs-mode">
          {canManage ? "Manager Access" : "Read Only"}
        </span>
      </div>

      <div className="argos-vmrs-summary">
        <div><span>Catalog Codes</span><strong>{codes.length}</strong></div>
        <div><span>Active Catalog</span><strong>{activeCatalogCount}</strong></div>
        <div><span>Codes Enabled</span><strong>{enabledCount}</strong></div>
        <div><span>Import Batches</span><strong>{importBatches.length}</strong></div>
      </div>

      <div className="argos-vmrs-toolbar">
        <label className="argos-vmrs-search">
          <span>Search VMRS Catalog</span>
          <input
            type="search"
            value={searchTerm}
            placeholder="Search code, description, or display name"
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
        <label>
          <span>Code Type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="ALL">All Code Types</option>
            {CODE_TYPES.map((type) => (
              <option key={type} value={type}>{formatType(type)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Organization Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">All Codes</option>
            <option value="ENABLED">Enabled</option>
            <option value="AVAILABLE">Available</option>
          </select>
        </label>
      </div>

      {actionMessage && <div className="argos-vmrs-action-message">{actionMessage}</div>}

      {!isLoading && !errorMessage && codes.length === 0 && (
        <div className="argos-vmrs-catalog-warning">
          <strong>No VMRS Catalog Imported</strong>
          <span>
            This organization has not imported a VMRS catalog. Organizations that maintain a
            licensed VMRS catalog may import their own reference data to enable VMRS repair
            classification and reporting. ARGOS does not distribute VMRS reference data.
          </span>
        </div>
      )}

      <div className="argos-vmrs-import-panel">
        <div>
          <span>Catalog Import Status</span>
          <strong>{latestImport ? formatImportStatus(latestImport) : "No Import Recorded"}</strong>
        </div>
        <p>
          {latestImport
            ? `Latest batch: ${latestImport.original_filename || latestImport.source_name || latestImport.id}`
            : "Import VMRS reference data supplied and licensed by your organization. ARGOS does not include or distribute VMRS catalog content."}
        </p>
        <button
          className="argos-vmrs-import-button"
          type="button"
          disabled={!canManage}
          onClick={() => {
            setActionMessage("");
            setIsImportDialogOpen(true);
          }}
        >
          Import VMRS Catalog
        </button>
      </div>

      {isLoading ? (
        <VMRSState>Loading VMRS Catalog…</VMRSState>
      ) : errorMessage ? (
        <VMRSState error>{errorMessage}</VMRSState>
      ) : codes.length === 0 ? (
        <VMRSState>No organization-supplied VMRS catalog records are currently available.</VMRSState>
      ) : visibleCodes.length === 0 ? (
        <VMRSState>No VMRS codes match the selected search and filters.</VMRSState>
      ) : (
        <div className="argos-vmrs-table-wrap">
          <table className="argos-vmrs-table">
            <thead>
              <tr>
                <th>VMRS Code</th>
                <th>Description</th>
                <th>Type</th>
                <th>Hierarchy</th>
                <th>Catalog</th>
                <th>Organization</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleCodes.map((code) => {
                const organizationConfiguration = configurationByCodeId[code.id];
                const enabled = Boolean(organizationConfiguration?.is_enabled);
                return (
                  <tr key={code.id}>
                    <td><strong className="argos-vmrs-code">{code.code || "Uncoded"}</strong></td>
                    <td>
                      <strong className="argos-vmrs-description">
                        {organizationConfiguration?.display_name || code.description || "No description"}
                      </strong>
                      {organizationConfiguration?.notes && <small>{organizationConfiguration.notes}</small>}
                    </td>
                    <td><span className="argos-vmrs-type">{formatType(code.code_type)}</span></td>
                    <td><small>{getParentLabel(code)}</small></td>
                    <td>
                      <span className={`argos-vmrs-status ${code.is_active !== false ? "active" : "inactive"}`}>
                        {code.is_active !== false ? "Active" : "Retired"}
                      </span>
                    </td>
                    <td>
                      <span className={`argos-vmrs-status ${enabled ? "enabled" : "available"}`}>
                        {enabled ? "Enabled" : "Available"}
                      </span>
                    </td>
                    <td>
                      <button
                        className={enabled ? "argos-vmrs-disable" : ""}
                        type="button"
                        disabled={!canManage || code.is_active === false || savingCodeId === code.id}
                        onClick={() => toggleCode(code)}
                      >
                        {savingCodeId === code.id ? "Saving…" : enabled ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ARGOSVMRSImportDialog
        isOpen={isImportDialogOpen}
        organizationId={organizationId}
        currentUserId={currentUserId}
        onClose={() => setIsImportDialogOpen(false)}
        onValidated={(importRequest) => {
          setIsImportDialogOpen(false);
          setActionMessage(
            `${importRequest.originalFilename} passed initial file validation. CSV row parsing and database staging are the next Sprint 001Y implementation step.`,
          );
        }}
      />

      <div className="argos-vmrs-foundation-note">
        <strong>ARGOS VMRS operating boundary</strong>
        <span>
          ARGOS uses organization-supplied VMRS reference data for standardized repair
          classification and reporting only. ARGOS does not distribute VMRS content or introduce
          work orders, parts, labor costing, preventive maintenance scheduling, or other FMIS
          functions.
        </span>
      </div>
    </div>
  );
}
