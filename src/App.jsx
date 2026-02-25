/* ──────────────────────────────────────────────
   Delhi RoadWatch — App Core Structure
   ────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import CitizenHome from './pages/citizen/CitizenHome';
import ReportViolation from './pages/citizen/ReportViolation';
import MyReports from './pages/citizen/MyReports';
import AdminDashboard from './pages/admin/AdminDashboard';
import LegalFAQBot from './pages/shared/LegalFAQBot';
import PoliceDashboard from './pages/police/PoliceDashboard';
import NotificationsPanel from './components/NotificationsPanel';

import './index.css';

// ── Protected Route — only for logged-in users ──
function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, ready } = useAuth();

  if (!ready) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '14px', fontWeight: 700 }}>Loading...</div>;
  if (!currentUser) return <Navigate to="/" replace />;
  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    const dest = currentUser.role === 'citizen' ? '/citizen' : currentUser.role === 'admin' ? '/admin' : '/police';
    return <Navigate to={dest} replace />;
  }

  return children;
}

// ── Guest Route — only for logged-out users ──
function GuestRoute({ children }) {
  const { currentUser, ready } = useAuth();

  if (!ready) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '14px', fontWeight: 700 }}>Loading...</div>;
  if (currentUser) {
    const dest = currentUser.role === 'citizen' ? '/citizen' : currentUser.role === 'admin' ? '/admin' : '/police';
    return <Navigate to={dest} replace />;
  }

  return children;
}

// ── Shared Dashboard Shell ──
function DashboardLayout() {
  const { currentUser, logout, ready } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/'); };
  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  // Close sidebar on navigation (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  if (!ready) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>Loading...</div>;
  if (!currentUser) return <Navigate to="/" replace />;

  const citizenLinks = [
    { to: '/citizen', label: 'Overview' },
    { to: '/citizen/report', label: 'Capture' },
    { to: '/citizen/my-reports', label: 'History' },
  ];

  const adminLinks = [
    { to: '/admin', label: 'Reports' },
    { to: '/admin/notifications', label: 'Dispatch' },
  ];

  const policeLinks = [
    { to: '/police', label: 'Overview' },
    { to: '/police/report', label: 'Capture' },
    { to: '/police/my-reports', label: 'History' },
  ];

  const links = currentUser?.role === 'citizen' ? citizenLinks
    : currentUser?.role === 'admin' ? adminLinks
      : policeLinks;

  const activeLabel = links.find(l => location.pathname === l.to)?.label || 'Console';

  return (
    <div className="app-layout">
      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${isSidebarOpen ? 'show' : ''}`} style={{
        background: 'white',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1001
      }}>
        {/* Sidebar Brand/Logo */}
        <div style={{ padding: '32px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontWeight: 900, fontSize: '18px', letterSpacing: '-0.04em', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
              ROAD<span style={{ color: 'var(--primary)', fontStyle: 'italic', fontWeight: 500 }}>WATCH</span>.
            </div>
          </div>
          <button className="mobile-only" onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Links List */}
        <nav style={{ padding: '16px', flex: 1 }}>
          <div style={{ fontSize: '10px', fontWeight: 950, color: 'var(--text-secondary)', opacity: 0.4, letterSpacing: '0.1em', padding: '0 12px', marginBottom: '16px', textTransform: 'uppercase' }}>Navigation</div>
          <ul style={{ listStyle: 'none' }}>
            {links.map(link => (
              <li key={link.to} style={{ marginBottom: '4px' }}>
                <NavLink
                  to={link.to}
                  end
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: '10px', textDecoration: 'none',
                    background: isActive ? 'var(--primary-light)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: 800, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em',
                    transition: 'all 0.2s ease'
                  })}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Account / Footer */}
        <div style={{ marginTop: 'auto', padding: '24px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px', color: 'var(--primary)', border: '1px solid var(--border-color)' }}>
              {currentUser?.name?.charAt(0)}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 800, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUser?.name || 'Authorized User'}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{currentUser?.role}</div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ width: '100%', padding: '10px', borderRadius: '10px', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }} onClick={handleLogout}>
            Logout Account
          </button>
        </div>
      </aside>

      {/* Content Viewport */}
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-main)' }}>
        {/* Top Navbar */}
        <header className="navbar" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 24px', background: 'white', borderBottom: '1px solid var(--border-color)',
          position: 'sticky', top: 0, zIndex: 100
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="mobile-only" onClick={toggleSidebar} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'pointer' }}>
              <div style={{ width: '20px', height: '2px', background: 'var(--text-primary)' }}></div>
              <div style={{ width: '14px', height: '2px', background: 'var(--text-primary)' }}></div>
              <div style={{ width: '20px', height: '2px', background: 'var(--text-primary)' }}></div>
            </button>
            <h2 style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
              {activeLabel}
            </h2>
          </div>

          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '12px' }}>
            {currentUser?.name?.charAt(0)}
          </div>
        </header>

        {/* Page Container */}
        <div style={{ padding: '24px', flex: 1 }}>
          <Routes>
            <Route path="/citizen" element={<ProtectedRoute allowedRoles={['citizen']}><CitizenHome /></ProtectedRoute>} />
            <Route path="/citizen/report" element={<ProtectedRoute allowedRoles={['citizen']}><ReportViolation /></ProtectedRoute>} />
            <Route path="/citizen/my-reports" element={<ProtectedRoute allowedRoles={['citizen']}><MyReports /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/notifications" element={<ProtectedRoute allowedRoles={['admin']}><NotificationsPanel /></ProtectedRoute>} />
            <Route path="/police" element={<ProtectedRoute allowedRoles={['police']}><CitizenHome /></ProtectedRoute>} />
            <Route path="/police/report" element={<ProtectedRoute allowedRoles={['police']}><ReportViolation /></ProtectedRoute>} />
            <Route path="/police/my-reports" element={<ProtectedRoute allowedRoles={['police']}><MyReports /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to={currentUser?.role === 'citizen' ? '/citizen' : currentUser?.role === 'admin' ? '/admin' : '/police'} replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

// ── Application Entry ──
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/signup" element={<GuestRoute><SignupPage /></GuestRoute>} />
          <Route path="/*" element={<DashboardLayout />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
