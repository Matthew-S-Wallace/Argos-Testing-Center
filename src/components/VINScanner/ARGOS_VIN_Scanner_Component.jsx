import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  decodeVinVehicleInformation,
  isLikelyVIN,
  normalizeScannedVIN,
} from "../../services/ARGOS_VIN_Service";
import "./ARGOS_VIN_Scanner_Component.css";

function ARGOSVINScanner({
  isOpen,
  assets = [],
  onClose,
  onMatchedAsset,
  onNewAsset,
}) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const assetsRef = useRef(assets);
  const scanLockedRef = useRef(false);
  const [scanStatus, setScanStatus] = useState("");
  const [scanSuccess, setScanSuccess] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [lastScannedVin, setLastScannedVin] = useState("");
  const [manualVinEntry, setManualVinEntry] = useState("");
  const [scannerRunId, setScannerRunId] = useState(0);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  function stopScanner() {
    controlsRef.current?.stop();
    controlsRef.current = null;

    cameraStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    cameraStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function resetFeedback() {
    setScanSuccess(false);
    setTorchSupported(false);
    setTorchEnabled(false);
  }

  function resetScanner() {
    scanLockedRef.current = false;
    stopScanner();
    setLastScannedVin("");
    setScanStatus("");
    resetFeedback();
  }

  useEffect(() => {
    if (!isOpen) {
      resetScanner();
      setManualVinEntry("");
      return undefined;
    }

    scanLockedRef.current = false;
    setLastScannedVin("");
    setManualVinEntry("");
    setScanStatus("");
    resetFeedback();
    setScannerRunId((currentRunId) => currentRunId + 1);
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    let isCancelled = false;
    const codeReader = new BrowserMultiFormatReader();

    async function startScanner() {
      if (!videoRef.current) return;

      setLastScannedVin("");
      setScanStatus("Starting camera. Allow camera access when prompted.");

      try {
        const cameraConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
          },
        };

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access is not supported by this browser.");
        }

        // Request the stream directly so iOS can complete its permission
        // handshake before ZXing begins decoding. This prevents the first-run
        // blue fallback field that previously cleared only after Scan Again.
        const cameraStream = await navigator.mediaDevices.getUserMedia(cameraConstraints);

        if (isCancelled) {
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }

        cameraStreamRef.current = cameraStream;

        const controls = await codeReader.decodeFromStream(
          cameraStream,
          videoRef.current,
          (result) => {
            if (isCancelled || !result) return;
            handleScanResult(result.getText(), "scanner");
          }
        );

        if (isCancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;

        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;

          if (videoRef.current.readyState < 2) {
            await new Promise((resolve) => {
              videoRef.current.addEventListener("loadedmetadata", resolve, { once: true });
              window.setTimeout(resolve, 1200);
            });
          }

          try {
            await videoRef.current.play();
          } catch (playbackError) {
            if (!videoRef.current.srcObject) throw playbackError;
            console.warn("ARGOS VIN scanner video playback required browser-managed startup:", playbackError);
          }
        }

        const activeTrack = videoRef.current?.srcObject?.getVideoTracks?.()[0];
        const capabilities = activeTrack?.getCapabilities?.() || {};
        setTorchSupported(Boolean(capabilities.torch));
        setTorchEnabled(false);
        setScanStatus("Ready to scan. Center the VIN barcode or registration barcode in view.");
      } catch (error) {
        console.error("ARGOS VIN scanner camera initialization failed:", error);
        setScanStatus(
          "ARGOS could not start the camera. Confirm browser camera permissions and use HTTPS or localhost."
        );
      }
    }

    startScanner();

    return () => {
      isCancelled = true;
      stopScanner();
      setTorchSupported(false);
      setTorchEnabled(false);
    };
  }, [isOpen, scannerRunId]);

  async function resolveVin(vin, sourceLabel) {
    const scannedVin = normalizeScannedVIN(vin);

    if (!isLikelyVIN(scannedVin)) {
      setLastScannedVin(scannedVin || vin);
      setScanStatus(
        `${sourceLabel} read a value, but ARGOS could not normalize it into a valid 17-character VIN.`
      );
      scanLockedRef.current = false;
      return;
    }

    const matchedAsset = assetsRef.current.find(
      (asset) => normalizeScannedVIN(asset.vin) === scannedVin
    );

    stopScanner();
    setLastScannedVin(scannedVin);
    setScanSuccess(true);
    setScanStatus(
      matchedAsset
        ? `VIN recognized. Unit ${matchedAsset.unit} found.`
        : "VIN recognized. Preparing a new vehicle record."
    );

    await new Promise((resolve) => window.setTimeout(resolve, 650));

    if (matchedAsset) {
      onMatchedAsset?.({ vin: scannedVin, asset: matchedAsset });
      return;
    }

    setScanStatus("VIN scanned successfully. Decoding vehicle information...");
    const decodedVehicle = await decodeVinVehicleInformation(scannedVin);
    const assetDescription = decodedVehicle.assetDescription;

    setScanStatus(
      assetDescription
        ? `VIN scanned successfully. Vehicle identified as ${assetDescription}. Opening new asset record.`
        : "VIN scanned successfully, but vehicle information could not be retrieved. Opening new asset record for manual completion."
    );

    onNewAsset?.({ vin: scannedVin, assetDescription });
  }

  async function handleScanResult(rawValue, source = "scanner") {
    if (scanLockedRef.current) return;

    const scannedVin = normalizeScannedVIN(rawValue);

    if (!isLikelyVIN(scannedVin)) {
      setLastScannedVin(scannedVin || rawValue);
      setScanStatus(
        "Barcode detected, but ARGOS could not read it as a valid 17-character VIN. Try reducing glare, moving closer, scanning the registration barcode, or entering the VIN manually."
      );
      return;
    }

    scanLockedRef.current = true;

    if (source === "scanner" && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([90, 45, 140]);
    }

    await resolveVin(scannedVin, source === "manual" ? "Manual entry" : "Scanner");
  }

  async function handleToggleTorch() {
    const activeTrack = videoRef.current?.srcObject?.getVideoTracks?.()[0];
    if (!activeTrack || !torchSupported) return;

    const nextTorchState = !torchEnabled;

    try {
      await activeTrack.applyConstraints({ advanced: [{ torch: nextTorchState }] });
      setTorchEnabled(nextTorchState);
    } catch (error) {
      console.warn("ARGOS scanner torch control is unavailable:", error);
      setTorchSupported(false);
      setTorchEnabled(false);
    }
  }

  function handleScanAgain() {
    resetScanner();
    setScannerRunId((currentRunId) => currentRunId + 1);
  }

  function handleClose() {
    resetScanner();
    onClose?.();
  }

  if (!isOpen) return null;

  return (
    <div className="update-overlay">
      <section className="update-panel">
        <div className="update-panel-header">
          <div>
            <p className="eyebrow">Mobile Fleet Lookup</p>
            <h3>Scan VIN</h3>
            <p className="update-asset-name">
              Scan a vehicle VIN or registration barcode to find an asset or start a new asset record
            </p>
          </div>
          <button className="close-button" onClick={handleClose} type="button" aria-label="Close VIN scanner">
            ×
          </button>
        </div>

        <div className="update-form">
          <div className="issue-field">
            <div className={`argos-vin-scanner-viewport${scanSuccess ? " is-success" : ""}`}>
              <video
                ref={videoRef}
                className="argos-vin-scanner-video"
                autoPlay
                muted
                playsInline
              />
              <div className="argos-vin-scanner-overlay" aria-hidden="true">
                <div className="argos-vin-scanner-shade argos-vin-scanner-shade-top" />
                <div className="argos-vin-scanner-shade argos-vin-scanner-shade-bottom" />
                <div className="argos-vin-scanner-target">
                  <span className="argos-vin-scanner-corner corner-top-left" />
                  <span className="argos-vin-scanner-corner corner-top-right" />
                  <span className="argos-vin-scanner-corner corner-bottom-left" />
                  <span className="argos-vin-scanner-corner corner-bottom-right" />
                  <span className="argos-vin-scanner-laser" />
                </div>
                {scanSuccess && (
                  <div className="argos-vin-scanner-success">
                    <span aria-hidden="true">✓</span>
                    <strong>VIN Recognized</strong>
                  </div>
                )}
                <div className="argos-vin-scanner-instruction">
                  {scanSuccess ? "Opening vehicle record" : "Align VIN barcode inside the guide"}
                </div>
              </div>
            </div>
          </div>

          <div className="issue-field">
            <p className="eyebrow">Scanner Status</p>
            <strong>{scanStatus || "Preparing VIN scanner."}</strong>
            {lastScannedVin && <p>Last scanned value: {lastScannedVin}</p>}
            <p>
              Tips: reduce windshield glare, move slowly, let the barcode fill most of the camera view,
              or scan the registration barcode instead.
            </p>
          </div>

          <label className="issue-field">
            Manual VIN Entry
            <input
              type="text"
              value={manualVinEntry}
              onChange={(event) => setManualVinEntry(event.target.value.toUpperCase())}
              placeholder="Enter or paste 17-character VIN"
              maxLength={17}
            />
          </label>
        </div>

        <div className="update-actions argos-vin-scanner-actions">
          {torchSupported && (
            <button
              className={`cancel-button argos-vin-torch-button${torchEnabled ? " active" : ""}`}
              onClick={handleToggleTorch}
              type="button"
            >
              {torchEnabled ? "Turn Flashlight Off" : "Turn Flashlight On"}
            </button>
          )}
          <button className="cancel-button" onClick={handleClose} type="button">Cancel</button>
          <button className="cancel-button" onClick={handleScanAgain} type="button">Scan Again</button>
          <button className="save-button" onClick={() => handleScanResult(manualVinEntry, "manual")} type="button">Use VIN</button>
        </div>
      </section>
    </div>
  );
}

export default ARGOSVINScanner;
