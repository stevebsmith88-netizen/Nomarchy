"use client";

import { useEffect } from "react";
import { captureRefFromUrl } from "../lib/signupSource";
import { captureInviteFromUrl } from "../lib/invite";

// Mounted once in the root layout so a ?ref= tag is saved whichever page
// someone lands on first - the home page, a friend's profile link, the FAQ.
// Same for a friend's ?invite= link.
export default function RefCapture() {
  useEffect(() => { captureRefFromUrl(); captureInviteFromUrl(); }, []);
  return null;
}
