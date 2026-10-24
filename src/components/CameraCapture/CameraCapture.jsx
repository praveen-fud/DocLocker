import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, RotateCcw, Check, X, SwitchCamera, LoaderCircle, CircleAlert } from "lucide-react";
import "./CameraCapture.css";

// Full-screen document camera. Shows a frame to line the document up in,
// crops each photo to that frame (sharper text for the reader), and walks
// through every page a document needs ("Front side", then "Back side").
//
//   pages:     ["Photo page", "Last page"] — one photo per entry; [] = one photo
//   onDone(files)  called with the captured File objects (JPEG)
//   onFallback()   the camera can't be used here (no permission / no
//                  camera / insecure page) — the caller opens the phone's
//                  own camera picker instead
export default function CameraCapture({ title, pages = [], onDone, onClose, onFallback }) {
  const steps = pages.length ? pages : [""];
  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const streamRef = useRef(null);
  const closeRef = useRef(null);
  const [facing, setFacing] = useState("environment");
  const [state, setState] = useState("starting"); // starting | live | review | error
  const [error, setError] = useState("");
  const [shots, setShots] = useState([]); // [{ file, url }]
  const [current, setCurrent] = useState(null); // shot under review

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const [attempt, setAttempt] = useState(0);
  const onFallbackRef = useRef(onFallback);
  useEffect(() => { onFallbackRef.current = onFallback; });

  // (Re)opens the camera whenever the facing side changes or "Try again".
  useEffect(() => {
    let cancelled = false;
    const open = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      : Promise.reject(Object.assign(new Error("No camera API"), { name: "Unsupported" }));
    open.then(async (stream) => {
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState("live");
    }).catch((e) => {
      if (cancelled) return;
      if (e?.name === "Unsupported") { onFallbackRef.current?.(); return; }
      setError(e?.name === "NotAllowedError" || e?.name === "SecurityError"
        ? "Camera access is blocked. Allow the camera for this site in your browser settings, or use your phone’s camera instead."
        : "We couldn’t start the camera on this device.");
      setState("error");
    });
    return () => { cancelled = true; stop(); };
  }, [facing, attempt]);

  const retry = () => { setState("starting"); setAttempt((n) => n + 1); };

  // Escape closes; the page behind stops scrolling.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Photos stay in memory only; every preview URL is released on close.
  const urlsRef = useRef(new Set());
  useEffect(() => {
    const urls = urlsRef.current;
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); };
  }, []);

  // The part of the video under the on-screen frame, at full camera resolution.
  const capture = () => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video?.videoWidth || !frame) return;
    const vr = video.getBoundingClientRect();
    const fr = frame.getBoundingClientRect();
    // object-fit: cover — work out the scale and the hidden margins.
    const scale = Math.max(vr.width / video.videoWidth, vr.height / video.videoHeight);
    const offX = (video.videoWidth * scale - vr.width) / 2;
    const offY = (video.videoHeight * scale - vr.height) / 2;
    const pad = 12; // keep a little border around the edges
    let sx = (fr.left - vr.left + offX - pad) / scale;
    let sy = (fr.top - vr.top + offY - pad) / scale;
    let sw = (fr.width + pad * 2) / scale;
    let sh = (fr.height + pad * 2) / scale;
    sx = Math.max(0, sx); sy = Math.max(0, sy);
    sw = Math.min(video.videoWidth - sx, sw); sh = Math.min(video.videoHeight - sy, sh);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    canvas.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const n = shots.length + 1;
      const file = new File([blob], `scan-${Date.now()}-${n}.jpg`, { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      urlsRef.current.add(url);
      setCurrent({ file, url });
      setState("review");
    }, "image/jpeg", 0.92);
  };

  const retake = () => {
    setCurrent(null);
    setState("live");
  };

  const accept = () => {
    const next = [...shots, current];
    setCurrent(null);
    if (next.length >= steps.length) {
      stop();
      onDone(next.map((s) => s.file));
      setShots([]);
      return;
    }
    setShots(next);
    setState("live");
  };

  const step = steps[Math.min(shots.length, steps.length - 1)];
  const multi = steps.length > 1;

  return createPortal(
    <div className="cam" role="dialog" aria-modal="true" aria-label={`Scan ${title}`}>
      <div className="cam__top">
        <button ref={closeRef} type="button" className="cam__icon-btn" onClick={() => { stop(); onClose(); }} aria-label="Close camera">
          <X size={22} aria-hidden="true" />
        </button>
        <div className="cam__title">
          <strong>{title}</strong>
          {multi && <span>{step} · {shots.length + 1} of {steps.length}</span>}
        </div>
        <button type="button" className="cam__icon-btn" onClick={() => { setState("starting"); setFacing((f) => (f === "environment" ? "user" : "environment")); }} aria-label="Switch camera" disabled={state !== "live"}>
          <SwitchCamera size={21} aria-hidden="true" />
        </button>
      </div>

      <div className="cam__stage">
        <video ref={videoRef} className="cam__video" playsInline muted hidden={state === "review"} />
        {state === "review" && current && <img className="cam__review" src={current.url} alt={`Photo of ${step || title}`} />}

        {(state === "live" || state === "starting") && (
          <div className="cam__mask" aria-hidden="true">
            <div ref={frameRef} className="cam__frame">
              <span className="cam__corner is-tl" /><span className="cam__corner is-tr" />
              <span className="cam__corner is-bl" /><span className="cam__corner is-br" />
            </div>
          </div>
        )}

        {state === "starting" && (
          <p className="cam__status"><LoaderCircle size={18} className="cam__spin" aria-hidden="true" /> Starting the camera…</p>
        )}
        {state === "error" && (
          <div className="cam__error" role="alert">
            <CircleAlert size={22} aria-hidden="true" />
            <p>{error}</p>
            <div className="cam__error-actions">
              <button type="button" className="cam__btn" onClick={retry}>Try again</button>
              {onFallback && <button type="button" className="cam__btn is-primary" onClick={() => { stop(); onFallback(); }}>Use phone camera</button>}
            </div>
          </div>
        )}
      </div>

      <div className="cam__bottom">
        {state === "review" ? (
          <>
            <p className="cam__hint">Is the text sharp and every corner visible?</p>
            <div className="cam__actions">
              <button type="button" className="cam__btn" onClick={retake}><RotateCcw size={18} aria-hidden="true" /> Retake</button>
              <button type="button" className="cam__btn is-primary" onClick={accept}>
                <Check size={18} aria-hidden="true" /> {shots.length + 1 < steps.length ? `Use · next: ${steps[shots.length + 1]}` : "Use photo"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="cam__hint">{step ? `Fit the ${step.toLowerCase()} inside the frame` : "Fit the document inside the frame"} · good light, no glare</p>
            <button type="button" className="cam__shutter" onClick={capture} disabled={state !== "live"} aria-label="Take photo">
              <Camera size={26} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
