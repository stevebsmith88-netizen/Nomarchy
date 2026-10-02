"use client";

import { useEffect } from "react";
import { captureRefFromUrl } from "../lib/signupSource";

// Mounted once in the root layout so a ?ref= tag is saved whichever page
// someone lands on first - the home page, a friend's profile link, the FAQ.
export default function RefCapture() {
  useEffect(() => { captureRefFromUrl(); }, []);
  return null;
}
