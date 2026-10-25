import { useEffect, useState } from "react";

// Types safe to show inside DocLocker. A blob: URL is same-origin, so an
// HTML or SVG file opened from one would run inside the workspace; those
// are offered as downloads only.
const SHOWABLE = /^(image\/(png|jpeg|webp|gif|avif|bmp|x-icon)|application\/pdf|video\/(mp4|webm|quicktime)|audio\/.+|text\/plain)$/;

export const canShow = (type = "") => SHOWABLE.test(type.split(";")[0].trim().toLowerCase());

// A temporary URL for a local file, released when it is no longer shown
export default function useBlobUrl(blob) {
  const [state, setState] = useState({ blob: null, url: null });
  useEffect(() => {
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL lives exactly as long as the file is on screen
    setState({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return state.blob === blob ? state.url : null;
}
