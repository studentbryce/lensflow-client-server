import { createContext, useContext } from "react";

// The context and consumer hook live outside AuthContext.jsx so the provider
// module exports React components only (compatible with Vite Fast Refresh).
export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}
