import { Navigate, Route, Routes } from 'react-router-dom';
import PublicLayout from './layout/PublicLayout';
import About from './pages/About';
import AccountPage from './pages/AccountPage';
import Contact from './pages/Contact';
import Download from './pages/Download';
import Features from './pages/Features';
import BookingsPage from './pages/BookingsPage';
import CarsPage from './pages/CarsPage';
import Home from './pages/Home';
import ProviderDetailPage from './pages/ProviderDetailPage';
import LoginPage from './pages/LoginPage';
import PayLinkPage from './pages/PayLinkPage';
import RequireAuth from './pages/RequireAuth';
import AdminLayout from './pages/admin/AdminLayout';
import AdminLoginRedirect from './pages/admin/AdminLoginRedirect';
import ApiControlsPage from './pages/admin/ApiControlsPage';
import CategoriesPage from './pages/admin/CategoriesPage';
import Dashboard from './pages/admin/Dashboard';
import RequireAdmin from './pages/admin/RequireAdmin';
import UsersPage from './pages/admin/UsersPage';

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="pay/:slug" element={<PayLinkPage />} />
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="features" element={<Features />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="download" element={<Download />} />
        <Route path="providers/:id" element={<ProviderDetailPage />} />
        <Route
          path="account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route
          path="bookings"
          element={
            <RequireAuth>
              <BookingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="cars"
          element={
            <RequireAuth>
              <CarsPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="admin/login" element={<AdminLoginRedirect />} />
      <Route
        path="admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="api-controls" element={<ApiControlsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
