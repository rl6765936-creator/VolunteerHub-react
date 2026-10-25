import { Navigate, Outlet } from "react-router";
import useAuth from "../hooks/useAuth";

const ProtectedRoute = ({ requiredRole }: { requiredRole?: "ADMIN" }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // After a page refresh the token exists but the user is still loading; without this an
  // admin would be sent to "/" before their role is known.
  if (requiredRole && isLoading) {
    return <p>בודק הרשאות...</p>;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;