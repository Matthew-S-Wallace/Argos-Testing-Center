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
  const assetsRef = useRef(assets);
  const scanLockedRef = useRef(false);
  const scannerGenerationRef = useRef(0);

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
    controlsRef.current?.stop?.();
    controlsRef.current = null;

    const activeStream = videoRef.current?.srcObject;
    activeStream?.getTracks?.().forEach((track) => track.stop());

    if (videoRef.current) {
      videoRef.current.pause?.();
      videoRef.current.srcObject = null;
    }
  }

  function resetFeedback() {
    setScanSuccess(false);
    setTorchSupported(false);
    setTorchEnabled(false);
  }

  function resetScanner() {
    scannerGenerationRef.current += 1;
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

    const generation = scannerGenerationRef.current + 1;
    scannerGenerationRef.current = generation;

    let localControls = null;
    let isCancelled = false;
    const codeReader = new BrowserMultiFormatReader();

    async function startScanner() {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      setLastScannedVin("");
      setScanStatus("Starting camera. Allow camera access when prompted.");

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access is not supported by this browser.");
        }

        videoElement.muted = true;
        videoElement.playsInline = true;
        videoElement.setAttribute("playsinline", "true");
        videoElement.setAttribute("webkit-playsinline", "true");

        const cameraConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        };

        // ZXing must own camera acquisition and the decoding lifecycle.
        // The previous refactor opened getUserMedia separately and then passed
        // the stream into ZXing, allowing React effect cleanup to cancel the
        // decoder while leaving a camera preview visible.
        localControls = await codeReader.decodeFromConstraints(
          cameraConstraints,
          videoElement,
          (result, error) => {
            if (
              isCancelled ||
              scannerGenerationRef.current !== generation ||
              scanLockedRef.current
            ) {
              return;
            }

            if (result) {
              void handleScanResult(result.getText(), "scanner");
              return;
            }

            // ZXing reports normal per-frame decode misses as errors. They are
            // intentionally ignored so continuous scanning remains active.
            if (error?.name === "NotAllowedError") {
              setScanStatus("Camera permission was denied. Enable camera access and try again.");
            }
          }
        );

        if (isCancelled || scannerGenerationRef.current !== generation) {
          localControls?.stop?.();
          return;
        }

        controlsRef.current = localControls;

        if (videoElement.readyState < 2) {
          await new Promise((resolve) => {
            const timeoutId = window.setTimeout(resolve, 1500);
            videoElement.addEventListener(
              "loadedmetadata",
              () => {
                window.clearTimeout(timeoutId);
                resolve();
              },
              { once: true }
            );
          });
        }

        try {
          await videoElement.play();
        } catch (playbackError) {
          if (!videoElement.srcObject) throw playbackError;
          console.warn(
            "ARGOS VIN scanner video playback required browser-managed startup:",
            playbackError
          );
        }

        const activeTrack = videoElement.srcObject?.getVideoTracks?.()[0];
        const capabilities = activeTrack?.getCapabilities?.() || {};

        if (activeTrack?.applyConstraints) {
          const advancedConstraints = [];

          if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
            advancedConstraints.push({ focusMode: "continuous" });
          }

          if (capabilities.zoom) {
            const minimumZoom = Number(capabilities.zoom.min ?? 1);
            const maximumZoom = Number(capabilities.zoom.max ?? minimumZoom);
            const preferredZoom = Math.min(maximumZoom, Math.max(minimumZoom, 1.25));
            advancedConstraints.push({ zoom: preferredZoom });
          }

          if (advancedConstraints.length > 0) {
            try {
              await activeTrack.applyConstraints({ advanced: advancedConstraints });
            } catch (constraintError) {
              console.warn("ARGOS scanner camera enhancements were unavailable:", constraintError);
            }
          }
        }

        setTorchSupported(Boolean(capabilities.torch));
        setTorchEnabled(false);
        setScanStatus("Ready to scan. Center the VIN barcode or registration barcode in view.");
      } catch (error) {
        if (isCancelled || scannerGenerationRef.current !== generation) return;

        console.error("ARGOS VIN scanner camera initialization failed:", error);

        if (error?.name === "NotAllowedError") {
          setScanStatus("Camera permission was denied. Enable camera access and try again.");
        } else if (error?.name === "NotFoundError") {
          setScanStatus("No compatible camera was found on this device.");
        } else {
          setScanStatus(
            "ARGOS could not start the camera. Confirm browser camera permissions and use HTTPS or localhost."
          );
        }
      }
    }

    void startScanner();

    return () => {
      isCancelled = true;
      localControls?.stop?.();

      // Only clear the shared references when this effect still owns them.
      // This prevents a stale React cleanup from stopping a newer scan run.
      if (scannerGenerationRef.current === generation) {
        if (controlsRef.current === localControls) {
          controlsRef.current = null;
        }

        const activeStream = videoRef.current?.srcObject;
        activeStream?.getTracks?.().forEach((track) => track.stop());

        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }

        setTorchSupported(false);
        setTorchEnabled(false);
      }
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
      matchedAsset ? `Unit ${matchedAsset.unit} located.` : "Creating vehicle record…"
    );

    await new Promise((resolve) => window.setTimeout(resolve, 375));

    if (matchedAsset) {
      onMatchedAsset?.({ vin: scannedVin, asset: matchedAsset });
      return;
    }

    setScanStatus("Identifying vehicle…");
    const decodedVehicle = await decodeVinVehicleInformation(scannedVin);
    const assetDescription = decodedVehicle.assetDescription;

    setScanStatus(
      assetDescription
        ? `${assetDescription} identified. Opening vehicle record…`
        : "Vehicle identified. Opening vehicle record…"
    );

    onNewAsset?.({
      vin: scannedVin,
      year: decodedVehicle.year || "",
      make: decodedVehicle.make || "",
      model: decodedVehicle.model || "",
      engine: decodedVehicle.engine || "",
      assetDescription,
      decodedVehicle,
    });
  }

  async function handleScanResult(rawValue, source = "scanner") {
    if (scanLockedRef.current) return;

    const scannedVin = normalizeScannedVIN(rawValue);

    if (!isLikelyVIN(scannedVin)) {
      setLastScannedVin(scannedVin || rawValue);
      setScanStatus(
        "Unable to read a valid VIN. Move closer, reduce glare, or scan the registration barcode."
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
              or scan the registration barcode. For vertically printed doorjamb VIN barcodes on iPhone,
              enable Portrait Orientation Lock and rotate the phone sideways while keeping ARGOS upright.
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
