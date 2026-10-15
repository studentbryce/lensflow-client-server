import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/authStore";

export default function RoleRoute({ allowedRole }) {
  const { profile, loading } = useAuth();

  if (loading) {
    return <p>Loading...</p>;
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (profile.role !== allowedRole) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}