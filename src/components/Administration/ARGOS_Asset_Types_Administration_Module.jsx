import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { canManageAssetTypes } from "../../utils/ARGOS_Permission_Resolver";
import "./ARGOS_Asset_Types_Administration_Module.css";

const DEMO_ASSET_TYPES = [
  { id: "demo-sedan", asset_type_name: "Sedan", asset_type_code: "SEDAN", is_active: true },
  { id: "demo-suv", asset_type_name: "SUV", asset_type_code: "SUV", is_active: true },
  { id: "demo-pickup", asset_type_name: "Pickup Truck", asset_type_code: "PICKUP", is_active: true },
  { id: "demo-service", asset_type_name: "Service / Utility Truck", asset_type_code: "SERVICE", is_active: true },
  { id: "demo-fire", asset_type_name: "Fire Apparatus", asset_type_code: "FIRE", is_active: true },
  { id: "demo-refuse", asset_type_name: "Refuse Vehicle", asset_type_code: "REFUSE", is_active: true },
  { id: "demo-heavy", asset_type_name: "Heavy Truck", asset_type_code: "HEAVY", is_active: true },
  { id: "demo-grounds", asset_type_name: "Grounds Equipment", asset_type_code: "GROUNDS", is_active: true },
  { id: "demo-other", asset_type_name: "Other", asset_type_code: "OTHER", is_active: true },
];

const DEMO_ASSET_COUNTS = {
  "Pickup Truck": 4,
  SUV: 4,
  "Service / Utility Truck": 2,
  "Fire Apparatus": 1,
  "Refuse Vehicle": 2,
  "Heavy Truck": 1,
  "Grounds Equipment": 1,
};

function AssetTypesState({ children, error = false }) {
  return (
    <div className={`argos-asset-types-state${error ? " error" : ""}`}>
      {children}
    </div>
  );
}

export default function ARGOSAssetTypesAdministrationModule({ isDemoMode }) {
  const [assetTypes, setAssetTypes] = useState(isDemoMode ? DEMO_ASSET_TYPES : []);
  const [assetCounts, setAssetCounts] = useState(isDemoMode ? DEMO_ASSET_COUNTS : {});
  const [organizationId, setOrganizationId] = useState(null);
  const [currentRole, setCurrentRole] = useState(isDemoMode ? "admin" : "");
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [errorMessage, setErrorMessage] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [assetTypeName, setAssetTypeName] = useState("");
  const [assetTypeCode, setAssetTypeCode] = useState("");
  const [editingAssetTypeId, setEditingAssetTypeId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const isAdministrator = canManageAssetTypes({
    role: currentRole,
    is_active: true,
  });

  const activeAssetTypes = useMemo(
    () => assetTypes.filter((assetType) => assetType.is_active),
    [assetTypes]
  );

  useEffect(() => {
    let isMounted = true;

    if (isDemoMode) {
      setAssetTypes(DEMO_ASSET_TYPES);
      setAssetCounts(DEMO_ASSET_COUNTS);
      setCurrentRole("admin");
      setIsLoading(false);
      setErrorMessage("");
      return undefined;
    }

    async function loadAssetTypes() {
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
        console.error("ARGOS asset type organization lookup failed:", profileError);
        setErrorMessage("ARGOS could not resolve the current organization.");
        setIsLoading(false);
        return;
      }

      const resolvedOrganizationId = currentProfile.organization_id;
      setOrganizationId(resolvedOrganizationId);
      setCurrentRole(currentProfile.role || "");

      const [
        { data: assetTypeRows, error: assetTypesError },
        { data: assetRows, error: assetsError },
      ] = await Promise.all([
        supabase
          .from("asset_types")
          .select("id, organization_id, asset_type_name, asset_type_code, is_active, created_at, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .order("asset_type_name", { ascending: true }),
        supabase
          .from("assets")
          .select("asset_type_id")
          .eq("organization_id", resolvedOrganizationId),
      ]);

      if (!isMounted) return;

      if (assetTypesError) {
        console.error("ARGOS asset types load failed:", assetTypesError);
        setErrorMessage(
          "ARGOS could not load asset types. Confirm the Sprint 001K database migration was completed."
        );
        setIsLoading(false);
        return;
      }

      if (assetsError) {
        console.error("ARGOS asset type counts load failed:", assetsError);
      }

      const counts = (assetRows || []).reduce((currentCounts, asset) => {
        if (asset.asset_type_id) {
          currentCounts[asset.asset_type_id] =
            (currentCounts[asset.asset_type_id] || 0) + 1;
        }
        return currentCounts;
      }, {});

      setAssetTypes(assetTypeRows || []);
      setAssetCounts(counts);
      setIsLoading(false);
    }

    loadAssetTypes();

    return () => {
      isMounted = false;
    };
  }, [isDemoMode]);

  function resetAddForm() {
    setAssetTypeName("");
    setAssetTypeCode("");
    setShowAddForm(false);
  }

  function beginEdit(assetType) {
    setEditingAssetTypeId(assetType.id);
    setEditName(assetType.asset_type_name);
    setEditCode(assetType.asset_type_code || "");
    setActionMessage("");
  }

  function cancelEdit() {
    setEditingAssetTypeId(null);
    setEditName("");
    setEditCode("");
  }

  async function handleAddAssetType(event) {
    event.preventDefault();
    const cleanedName = assetTypeName.trim();
    const cleanedCode = assetTypeCode.trim().toUpperCase();

    if (!cleanedName) {
      setActionMessage("Asset Type name is required.");
      return;
    }

    if (!isAdministrator) {
      setActionMessage("Only an ARGOS administrator can create Asset Types.");
      return;
    }

    if (isDemoMode) {
      const demoAssetType = {
        id: `demo-${Date.now()}`,
        asset_type_name: cleanedName,
        asset_type_code: cleanedCode || null,
        is_active: true,
      };
      setAssetTypes((currentAssetTypes) =>
        [...currentAssetTypes, demoAssetType].sort((first, second) =>
          first.asset_type_name.localeCompare(second.asset_type_name)
        )
      );
      resetAddForm();
      setActionMessage("Demo Asset Type added.");
      return;
    }

    if (!organizationId) {
      setActionMessage("ARGOS could not resolve the current organization.");
      return;
    }

    setIsSaving(true);
    setActionMessage("");

    const { data, error } = await supabase
      .from("asset_types")
      .insert({
        organization_id: organizationId,
        asset_type_name: cleanedName,
        asset_type_code: cleanedCode || null,
      })
      .select("id, organization_id, asset_type_name, asset_type_code, is_active, created_at, updated_at")
      .single();

    if (error) {
      console.error("ARGOS Asset Type creation failed:", error);
      setActionMessage(
        error.code === "23505"
          ? "That Asset Type name or code already exists for this organization."
          : "ARGOS could not create the Asset Type."
      );
      setIsSaving(false);
      return;
    }

    setAssetTypes((currentAssetTypes) =>
      [...currentAssetTypes, data].sort((first, second) =>
        first.asset_type_name.localeCompare(second.asset_type_name)
      )
    );
    resetAddForm();
    setActionMessage("Asset Type created.");
    setIsSaving(false);
  }

  async function handleSaveEdit(assetType) {
    const cleanedName = editName.trim();
    const cleanedCode = editCode.trim().toUpperCase();

    if (!cleanedName) {
      setActionMessage("Asset Type name is required.");
      return;
    }

    if (!isAdministrator) {
      setActionMessage("Only an ARGOS administrator can edit Asset Types.");
      return;
    }

    if (isDemoMode) {
      setAssetTypes((currentAssetTypes) =>
        currentAssetTypes
          .map((currentAssetType) =>
            currentAssetType.id === assetType.id
              ? {
                  ...currentAssetType,
                  asset_type_name: cleanedName,
                  asset_type_code: cleanedCode || null,
                }
              : currentAssetType
          )
          .sort((first, second) =>
            first.asset_type_name.localeCompare(second.asset_type_name)
          )
      );
      cancelEdit();
      setActionMessage("Demo Asset Type updated.");
      return;
    }

    setIsSaving(true);
    setActionMessage("");

    const { data, error } = await supabase
      .from("asset_types")
      .update({
        asset_type_name: cleanedName,
        asset_type_code: cleanedCode || null,
      })
      .eq("id", assetType.id)
      .eq("organization_id", organizationId)
      .select("id, organization_id, asset_type_name, asset_type_code, is_active, created_at, updated_at")
      .single();

    if (error) {
      console.error("ARGOS Asset Type update failed:", error);
      setActionMessage(
        error.code === "23505"
          ? "That Asset Type name or code already exists for this organization."
          : "ARGOS could not update the Asset Type."
      );
      setIsSaving(false);
      return;
    }

    setAssetTypes((currentAssetTypes) =>
      currentAssetTypes
        .map((currentAssetType) =>
          currentAssetType.id === data.id ? data : currentAssetType
        )
        .sort((first, second) =>
          first.asset_type_name.localeCompare(second.asset_type_name)
        )
    );
    cancelEdit();
    setActionMessage("Asset Type updated.");
    setIsSaving(false);
  }

  async function handleDisableAssetType(assetType) {
    if (!isAdministrator) {
      setActionMessage("Only an ARGOS administrator can disable Asset Types.");
      return;
    }

    const shouldDisable = window.confirm(
      `Disable ${assetType.asset_type_name}? Existing assets will retain this Asset Type, but it will no longer be available for new selections.`
    );
    if (!shouldDisable) return;

    if (isDemoMode) {
      setAssetTypes((currentAssetTypes) =>
        currentAssetTypes.map((currentAssetType) =>
          currentAssetType.id === assetType.id
            ? { ...currentAssetType, is_active: false }
            : currentAssetType
        )
      );
      setActionMessage("Demo Asset Type disabled.");
      return;
    }

    const { data, error } = await supabase
      .from("asset_types")
      .update({ is_active: false })
      .eq("id", assetType.id)
      .eq("organization_id", organizationId)
      .select("id, organization_id, asset_type_name, asset_type_code, is_active, created_at, updated_at")
      .single();

    if (error) {
      console.error("ARGOS Asset Type disable failed:", error);
      setActionMessage("ARGOS could not disable the Asset Type.");
      return;
    }

    setAssetTypes((currentAssetTypes) =>
      currentAssetTypes.map((currentAssetType) =>
        currentAssetType.id === data.id ? data : currentAssetType
      )
    );
    setActionMessage("Asset Type disabled.");
  }

  return (
    <div className="argos-asset-types-content">
      <div className="argos-asset-types-heading">
        <div>
          <p className="eyebrow">Fleet Classification</p>
          <h4>Asset Types</h4>
          <p>
            Maintain the controlled vehicle and equipment classifications used across
            asset records, reporting, VIN defaults, and future maintenance analytics.
          </p>
        </div>
        <span className="argos-asset-types-mode">
          {isAdministrator ? "Administrator" : "Read Only"}
        </span>
      </div>

      <div className="argos-asset-types-actions">
        <button
          type="button"
          onClick={() => {
            setShowAddForm((currentValue) => !currentValue);
            setActionMessage("");
          }}
          disabled={!isAdministrator}
        >
          {showAddForm ? "Cancel Add" : "Add Asset Type"}
        </button>
      </div>

      {showAddForm && (
        <form className="argos-asset-types-add-form" onSubmit={handleAddAssetType}>
          <label>
            Asset Type Name
            <input
              type="text"
              value={assetTypeName}
              onChange={(event) => setAssetTypeName(event.target.value)}
              placeholder="Example: Pickup Truck"
              maxLength={120}
              autoFocus
            />
          </label>
          <label>
            Asset Type Code
            <input
              type="text"
              value={assetTypeCode}
              onChange={(event) => setAssetTypeCode(event.target.value)}
              placeholder="Example: PICKUP"
              maxLength={30}
            />
          </label>
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Create Asset Type"}
          </button>
        </form>
      )}

      {actionMessage && (
        <div className="argos-asset-types-action-message">{actionMessage}</div>
      )}

      <div className="argos-asset-types-summary">
        <div><span>Total Asset Types</span><strong>{assetTypes.length}</strong></div>
        <div><span>Active Asset Types</span><strong>{activeAssetTypes.length}</strong></div>
      </div>

      {isLoading ? (
        <AssetTypesState>Loading Asset Types…</AssetTypesState>
      ) : errorMessage ? (
        <AssetTypesState error>{errorMessage}</AssetTypesState>
      ) : assetTypes.length === 0 ? (
        <AssetTypesState>No Asset Types have been configured for this organization.</AssetTypesState>
      ) : (
        <div className="argos-asset-types-table-wrap">
          <table className="argos-asset-types-table">
            <thead>
              <tr>
                <th>Asset Type</th>
                <th>Code</th>
                <th>Asset Count</th>
                <th>Status</th>
                <th aria-label="Asset Type actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assetTypes.map((assetType) => {
                const isEditing = editingAssetTypeId === assetType.id;
                return (
                  <tr key={assetType.id}>
                    <td className="argos-asset-types-name">
                      {isEditing ? (
                        <input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={120} />
                      ) : assetType.asset_type_name}
                    </td>
                    <td>
                      {isEditing ? (
                        <input value={editCode} onChange={(event) => setEditCode(event.target.value)} maxLength={30} />
                      ) : assetType.asset_type_code || "Not configured"}
                    </td>
                    <td>
                      {isDemoMode
                        ? assetCounts[assetType.asset_type_name] || 0
                        : assetCounts[assetType.id] || 0}
                    </td>
                    <td>
                      <span className={`argos-asset-types-status ${assetType.is_active ? "active" : "inactive"}`}>
                        {assetType.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="argos-asset-types-row-actions">
                        {isEditing ? (
                          <>
                            <button type="button" onClick={() => handleSaveEdit(assetType)} disabled={isSaving}>Save</button>
                            <button type="button" onClick={cancelEdit} disabled={isSaving}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => beginEdit(assetType)} disabled={!isAdministrator || !assetType.is_active}>Edit</button>
                            <button className="disable" type="button" onClick={() => handleDisableAssetType(assetType)} disabled={!isAdministrator || !assetType.is_active}>
                              {assetType.is_active ? "Disable" : "Disabled"}
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

      <div className="argos-asset-types-foundation-note">
        <strong>Sprint 001K operational boundary</strong>
        <span>
          Asset Types are organization-scoped production records. Existing assets retain
          their descriptive Asset field while receiving a controlled Asset Type relationship.
          Version 1.0 supports create, edit, and disable; deletion is intentionally unavailable.
        </span>
      </div>
    </div>
  );
}
