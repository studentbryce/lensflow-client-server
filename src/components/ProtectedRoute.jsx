import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/authStore";
import LoadingScreen from "./LoadingScreen";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{ from: location }}
        replace
      />
    );
  }

  return <Outlet />;
}
