import React from "react";
import { AuthProvider } from "./auth";

export function CoreProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

export default CoreProviders;
