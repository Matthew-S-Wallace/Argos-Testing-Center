import "./ARGOS_Identity_Confirmation_Modal.css";

export default function ARGOSIdentityConfirmationModal({
  identityLabel,
  enteredValue,
  existingValue,
  onUseExisting,
  onKeepNew,
  onCancel,
}) {
  return (
    <div
      className="argos-identity-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="argos-identity-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="argos-identity-modal-title"
      >
        <div className="argos-identity-modal-header">
          <div>
            <p className="eyebrow">Data Quality Check</p>
            <h3 id="argos-identity-modal-title">Similar {identityLabel} found</h3>
          </div>

          <button
            className="argos-identity-modal-close"
            type="button"
            onClick={onCancel}
            aria-label="Close confirmation"
          >
            ×
          </button>
        </div>

        <p className="argos-identity-modal-intro">
          ARGOS found an existing {identityLabel} name that is similar to the one entered.
          Confirm which name should be saved.
        </p>

        <div className="argos-identity-comparison">
          <div>
            <span>You entered</span>
            <strong>{enteredValue}</strong>
          </div>

          <div>
            <span>Existing {identityLabel}</span>
            <strong>{existingValue}</strong>
          </div>
        </div>

        <div className="argos-identity-modal-actions">
          <button className="cancel-button" type="button" onClick={onKeepNew}>
            Keep New Name
          </button>

          <button className="save-button" type="button" onClick={onUseExisting}>
            Use Existing
          </button>
        </div>
      </section>
    </div>
  );
}
