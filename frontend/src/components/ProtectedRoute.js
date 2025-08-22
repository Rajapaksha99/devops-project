import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children, allowedRole }) => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user")); // read user object
  const role = user?.role;

  if (!token) return <Navigate to="/login" />; // Not logged in
  if (allowedRole && role !== allowedRole) return <Navigate to="/login" />; // Wrong role

  return children;
};

export default ProtectedRoute;
