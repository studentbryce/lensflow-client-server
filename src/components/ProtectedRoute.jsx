import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/authStore";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  const location = useLocation();

  if (loading) {
    return <p>Loading...</p>;
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