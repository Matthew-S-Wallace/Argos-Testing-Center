import { useEffect, useRef, useState } from "react";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateSelectedFile(file) {
  if (!file) return "Select a CSV file to continue.";

  const fileName = String(file.name || "").toLowerCase();
  const csvMimeTypes = ["text/csv", "application/csv", "application/vnd.ms-excel"];
  const hasCsvExtension = fileName.endsWith(".csv");
  const hasCsvMimeType = !file.type || csvMimeTypes.includes(file.type);

  if (!hasCsvExtension || !hasCsvMimeType) {
    return "The selected file must be a CSV document.";
  }

  if (file.size <= 0) return "The selected CSV file is empty.";
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "The selected CSV file exceeds the 25 MB import limit.";
  }

  return "";
}

export default function ARGOSVMRSImportDialog({
  isOpen,
  organizationId,
  currentUserId,
  onClose,
  onValidated,
}) {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sourceVersion, setSourceVersion] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [importMode, setImportMode] = useState("MERGE");
  const [isDragging, setIsDragging] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) return;
    setSelectedFile(null);
    setSourceVersion("");
    setEffectiveDate("");
    setImportMode("MERGE");
    setIsDragging(false);
    setValidationMessage("");
  }, [isOpen]);

  if (!isOpen) return null;

  function acceptFile(file) {
    const error = validateSelectedFile(file);
    setSelectedFile(file || null);
    setValidationMessage(error);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  }

  function handleValidate() {
    const fileError = validateSelectedFile(selectedFile);
    if (fileError) {
      setValidationMessage(fileError);
      return;
    }

    if (!organizationId || !currentUserId) {
      setValidationMessage("ARGOS could not resolve the importing organization or user.");
      return;
    }

    setValidationMessage("");
    onValidated({
      file: selectedFile,
      originalFilename: selectedFile.name,
      fileSize: selectedFile.size,
      sourceVersion: sourceVersion.trim() || null,
      effectiveDate: effectiveDate || null,
      importMode,
      organizationId,
      importedBy: currentUserId,
    });
  }

  return (
    <div
      className="argos-vmrs-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="argos-vmrs-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="argos-vmrs-import-title"
      >
        <header className="argos-vmrs-modal-header">
          <div>
            <p className="eyebrow">Organization-Supplied Reference Data</p>
            <h4 id="argos-vmrs-import-title">Import VMRS Catalog</h4>
            <p>
              Select a licensed VMRS CSV catalog owned by your organization. This step validates
              the file and captures the import settings before database processing begins.
            </p>
          </div>
          <button
            className="argos-vmrs-modal-close"
            type="button"
            aria-label="Close VMRS import dialog"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="argos-vmrs-modal-body">
          <div
            className={`argos-vmrs-dropzone${isDragging ? " dragging" : ""}${
              selectedFile ? " selected" : ""
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />

            <span className="argos-vmrs-dropzone-label">
              {selectedFile ? "CSV Selected" : "Licensed VMRS CSV"}
            </span>
            <strong>{selectedFile ? selectedFile.name : "Drop a CSV file here"}</strong>
            <p>
              {selectedFile
                ? `${formatFileSize(selectedFile.size)} · Ready for initial validation`
                : "CSV format only · Maximum file size 25 MB"}
            </p>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              {selectedFile ? "Choose Different File" : "Browse Files"}
            </button>
          </div>

          <div className="argos-vmrs-import-fields">
            <label>
              <span>Source Version</span>
              <input
                type="text"
                value={sourceVersion}
                maxLength={100}
                placeholder="Example: VMRS 2026.1"
                onChange={(event) => setSourceVersion(event.target.value)}
              />
            </label>

            <label>
              <span>Effective Date</span>
              <input
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </label>

            <label>
              <span>Import Mode</span>
              <select value={importMode} onChange={(event) => setImportMode(event.target.value)}>
                <option value="MERGE">Merge with Existing Catalog</option>
                <option value="REPLACE">Replace Organization Catalog</option>
              </select>
            </label>
          </div>

          <div className="argos-vmrs-import-guidance">
            <strong>{importMode === "MERGE" ? "Merge Catalog" : "Replace Catalog"}</strong>
            <span>
              {importMode === "MERGE"
                ? "Existing organization records remain available while new or updated catalog rows are prepared for import."
                : "The current organization catalog will be replaced only after the new file passes validation and the import pipeline is completed."}
            </span>
          </div>

          {validationMessage && (
            <div className="argos-vmrs-import-validation error" role="alert">
              {validationMessage}
            </div>
          )}
        </div>

        <footer className="argos-vmrs-modal-footer">
          <button className="argos-vmrs-secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="argos-vmrs-primary-button" type="button" onClick={handleValidate}>
            Validate File
          </button>
        </footer>
      </section>
    </div>
  );
}
