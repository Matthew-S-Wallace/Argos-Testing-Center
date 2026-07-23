import { useEffect, useMemo, useState } from "react";
import {
  listArchivedAssets,
  restoreArchivedAsset,
} from "../../services/ARGOS_Asset_Archive_Service";
import "./ARGOS_Archived_Assets_Administration_Module.css";

function formatArchivedDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isArchivedThisMonth(value) {
  if (!value) return false;

  const archivedDate = new Date(value);
  const today = new Date();

  if (Number.isNaN(archivedDate.getTime())) {
    return false;
  }

  return (
    archivedDate.getFullYear() === today.getFullYear() &&
    archivedDate.getMonth() === today.getMonth()
  );
}

function getArchiveSearchValue(asset) {
  return [
    asset.unit,
    asset.vin,
    asset.asset,
    asset.department,
    asset.archiveReason,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

export default function ARGOSArchivedAssetsAdministrationModule({
  organizationId,
  isDemoMode = false,
  onAssetRestored,
}) {
  const [archivedAssets, setArchivedAssets] = useState([]);
  const [searchValue, setSearchValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");

  async function loadArchive() {
    if (isDemoMode) {
      setArchivedAssets([]);
      setLoadError("");
      setIsLoading(false);
      return;
    }

    if (!organizationId) {
      setArchivedAssets([]);
      setLoadError("ARGOS could not determine the active organization.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const records = await listArchivedAssets(organizationId);
      setArchivedAssets(records);
    } catch (error) {
      console.error("ARGOS archived asset load failed:", error);
      setLoadError(
        error?.message || "ARGOS could not load archived assets."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadArchive();
  }, [organizationId, isDemoMode]);

  const filteredAssets = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    if (!normalizedSearch) {
      return archivedAssets;
    }

    return archivedAssets.filter((asset) =>
      getArchiveSearchValue(asset).includes(normalizedSearch)
    );
  }, [archivedAssets, searchValue]);

  const archivedThisMonth = archivedAssets.filter((asset) =>
    isArchivedThisMonth(asset.archivedAt)
  ).length;

  const mostRecentArchive = archivedAssets[0] || null;

  function openRestoreConfirmation(asset) {
    setRestoreError("");
    setSuccessMessage("");
    setSelectedArchive(asset);
  }

  function closeRestoreConfirmation() {
    if (isRestoring) return;

    setSelectedArchive(null);
    setRestoreError("");
  }

  async function handleRestoreAsset() {
    if (!selectedArchive?.id || isRestoring) {
      return;
    }

    setIsRestoring(true);
    setRestoreError("");
    setSuccessMessage("");

    try {
      const restoredAsset = await restoreArchivedAsset(selectedArchive.id);

      setArchivedAssets((currentAssets) =>
        currentAssets.filter(
          (asset) => asset.id !== selectedArchive.id
        )
      );

      setSuccessMessage(
        `Unit ${selectedArchive.unit} was restored to the active fleet.`
      );

      setSelectedArchive(null);

      if (typeof onAssetRestored === "function") {
        onAssetRestored(restoredAsset);
      }
    } catch (error) {
      console.error("ARGOS archived asset restore failed:", error);
      setRestoreError(
        error?.message || "ARGOS could not restore this asset."
      );
    } finally {
      setIsRestoring(false);
    }
  }

  if (isLoading) {
    return (
      <section className="argos-archive-module">
        <div className="argos-archive-loading" role="status">
          <div className="argos-archive-spinner" aria-hidden="true" />
          <strong>Loading Archived Assets...</strong>
          <span>ARGOS is retrieving the organization archive.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="argos-archive-module">
      <header className="argos-archive-heading">
        <div>
          <p className="eyebrow">Data Management</p>
          <h4>Archived Assets</h4>
          <p>
            Review assets removed from the active fleet and restore eligible
            records when operationally required.
          </p>
        </div>

        <button
          className="argos-archive-refresh-button"
          type="button"
          onClick={loadArchive}
          disabled={isDemoMode}
        >
          Refresh Archive
        </button>
      </header>

      {isDemoMode && (
        <div className="argos-archive-notice">
          Archived Assets is unavailable in Demo Mode because archive and
          restore actions modify permanent organization data.
        </div>
      )}

      {loadError && (
        <div className="argos-archive-alert argos-archive-alert-error">
          <strong>Unable to load archived assets</strong>
          <span>{loadError}</span>
        </div>
      )}

      {successMessage && (
        <div className="argos-archive-alert argos-archive-alert-success">
          <strong>Asset restored</strong>
          <span>{successMessage}</span>
        </div>
      )}

      <div className="argos-archive-summary-grid">
        <article>
          <span>Archived Assets</span>
          <strong>{archivedAssets.length}</strong>
          <small>Total organization archive</small>
        </article>

        <article>
          <span>Archived This Month</span>
          <strong>{archivedThisMonth}</strong>
          <small>Records moved during the current month</small>
        </article>

        <article>
          <span>Last Archive</span>
          <strong>
            {mostRecentArchive
              ? formatArchivedDate(mostRecentArchive.archivedAt)
              : "None"}
          </strong>
          <small>
            {mostRecentArchive
              ? `Unit ${mostRecentArchive.unit}`
              : "No archive activity recorded"}
          </small>
        </article>

        <article>
          <span>Available for Restore</span>
          <strong>{archivedAssets.length}</strong>
          <small>Subject to active Unit and VIN validation</small>
        </article>
      </div>

      <div className="argos-archive-toolbar">
        <label className="argos-archive-search">
          <span>Search archived assets</span>
          <input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Unit, VIN, department, or asset"
            disabled={isDemoMode}
          />
        </label>

        <div className="argos-archive-result-count">
          <span>Results</span>
          <strong>{filteredAssets.length}</strong>
        </div>
      </div>

      {!isDemoMode && !loadError && filteredAssets.length === 0 ? (
        <div className="argos-archive-empty-state">
          <div aria-hidden="true">▣</div>
          <h5>
            {searchValue.trim()
              ? "No archived assets match this search."
              : "No archived assets found."}
          </h5>
          <p>
            {searchValue.trim()
              ? "Clear or adjust the search criteria to view additional archived records."
              : "Archived assets will appear here when they are removed from the active fleet."}
          </p>
        </div>
      ) : !isDemoMode && !loadError ? (
        <div className="argos-archive-table-wrap">
          <table className="argos-archive-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>VIN</th>
                <th>Asset</th>
                <th>Department</th>
                <th>Archived</th>
                <th>Reason</th>
                <th aria-label="Restore action" />
              </tr>
            </thead>

            <tbody>
              {filteredAssets.map((asset) => (
                <tr key={asset.id}>
                  <td className="argos-archive-unit">{asset.unit}</td>
                  <td>{asset.vin || "—"}</td>
                  <td>{asset.asset || "—"}</td>
                  <td>{asset.department || "—"}</td>
                  <td>{formatArchivedDate(asset.archivedAt)}</td>
                  <td>{asset.archiveReason || "No reason recorded"}</td>
                  <td className="argos-archive-action-cell">
                    <button
                      type="button"
                      className="argos-archive-restore-button"
                      onClick={() => openRestoreConfirmation(asset)}
                    >
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedArchive && (
        <div
          className="argos-archive-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeRestoreConfirmation();
            }
          }}
        >
          <section
            className="argos-archive-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="argos-archive-dialog-title"
          >
            <div className="argos-archive-dialog-header">
              <div>
                <p className="eyebrow">Restore Archived Asset</p>
                <h4 id="argos-archive-dialog-title">
                  Restore Unit {selectedArchive.unit}?
                </h4>
              </div>

              <button
                type="button"
                className="argos-archive-dialog-close"
                onClick={closeRestoreConfirmation}
                disabled={isRestoring}
                aria-label="Close restore confirmation"
              >
                ×
              </button>
            </div>

            <div className="argos-archive-dialog-body">
              <p>
                This will move the complete archived asset record back into
                the active fleet.
              </p>

              <dl>
                <div>
                  <dt>Unit</dt>
                  <dd>{selectedArchive.unit}</dd>
                </div>
                <div>
                  <dt>VIN</dt>
                  <dd>{selectedArchive.vin || "—"}</dd>
                </div>
                <div>
                  <dt>Asset</dt>
                  <dd>{selectedArchive.asset || "—"}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{selectedArchive.department || "—"}</dd>
                </div>
              </dl>

              <div className="argos-archive-restore-warning">
                ARGOS will verify that the Unit Number and VIN are not already
                assigned to an active asset before restoring this record.
              </div>

              {restoreError && (
                <div className="argos-archive-alert argos-archive-alert-error">
                  <strong>Unable to restore asset</strong>
                  <span>{restoreError}</span>
                </div>
              )}
            </div>

            <div className="argos-archive-dialog-actions">
              <button
                type="button"
                className="argos-archive-cancel-button"
                onClick={closeRestoreConfirmation}
                disabled={isRestoring}
              >
                Cancel
              </button>

              <button
                type="button"
                className="argos-archive-confirm-button"
                onClick={handleRestoreAsset}
                disabled={isRestoring}
              >
                {isRestoring ? "Restoring..." : "Restore Asset"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
