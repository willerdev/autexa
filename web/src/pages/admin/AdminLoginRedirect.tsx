import { Navigate } from 'react-router-dom';

/** Legacy URL: /admin/login → unified sign-in with return path to admin. */
export default function AdminLoginRedirect() {
  return <Navigate to="/login?next=/admin" replace />;
}
