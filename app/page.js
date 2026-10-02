"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { getUser, onAuthChange } from "@/lib/data";
import { C, body, FontShell } from "./theme";

// The front door: checks whether someone is signed in, then loads either
// the landing page or the app - each as its own download, so a first-time
// visitor from Instagram doesn't download the whole app just to see the
// landing page, and a signed-in person doesn't download the landing page.
// The app itself lives in app/components/ (NomarchyApp.js and friends).
const SignInScreen = dynamic(() => import("./components/Landing").then((m) => m.SignInScreen));
const NomarchyApp = dynamic(() => import("./components/NomarchyApp"));

function Loading() {
  return <FontShell><div className="flex min-h-screen items-center justify-center" style={{ color: C.muted, ...body }}>Loading...</div></FontShell>;
}

export default function Nomarchy() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    getUser().then((u) => { setUser(u); setAuthChecked(true); });
    return onAuthChange((u) => setUser(u));
  }, []);

  if (!authChecked) return <Loading />;
  return user ? <NomarchyApp user={user} /> : <SignInScreen />;
}
