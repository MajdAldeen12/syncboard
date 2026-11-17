"use client";

import { useEffect } from "react";

// Whether the first page of this visit has been shown. Pages rendered after
// that were reached by navigating inside the app, and may animate in; the
// first one may have arrived as finished HTML and must show at once.
let firstLoadDone = false;

export function isAfterFirstLoad(): boolean {
  return firstLoadDone;
}

/** Rendered once by the root layout, on every page. */
export function FirstLoadMarker(): null {
  useEffect(() => {
    firstLoadDone = true;
  }, []);
  return null;
}
