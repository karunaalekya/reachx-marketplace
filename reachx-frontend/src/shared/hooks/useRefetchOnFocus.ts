import { useEffect, useRef } from "react";

// Fires `callback` whenever the tab regains visibility/focus - NOT on initial mount (the normal
// mount-time fetch already covers that). This is the actual fix for "a stale cached
// overallKycStatus lingers after a server-side admin approves/rejects a document in another
// tab/session" (Session 2 goal): the vendor never has to manually refresh, the persisted
// `overallKycStatus` self-corrects the moment they tab back in.
//
// `document.visibilitychange` + `window.focus` are both listened for, not just one - covers both
// "switched to another tab and back" and "alt-tabbed to another app and back" without double-
// firing in the common case (visibilitychange alone misses the cross-app case in some browsers).
export function useRefetchOnFocus(callback: () => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    function handleFocusRegained() {
      if (document.visibilityState === "visible") {
        callbackRef.current();
      }
    }

    document.addEventListener("visibilitychange", handleFocusRegained);
    window.addEventListener("focus", handleFocusRegained);
    return () => {
      document.removeEventListener("visibilitychange", handleFocusRegained);
      window.removeEventListener("focus", handleFocusRegained);
    };
  }, []);
}
