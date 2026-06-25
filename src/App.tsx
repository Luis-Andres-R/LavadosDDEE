import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import AdminDashboard from './pages/Admin/AdminDashboard';
import OperatorDashboard from './pages/Operator/OperatorDashboard';
import ReportView from './pages/Admin/ReportView';
import DashboardBI from './pages/Admin/DashboardBI';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, LogOut, Home } from 'lucide-react';

function AppContent() {
  const { user, profile, loading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'catalog' | 'programs' | 'reports'>('programs');

  const isReportView = window.location.search.includes('view=report');
  const isDashboardView = 
    window.location.pathname === '/dashboard' || 
    window.location.search.includes('view=dashboard') || 
    window.location.hash.includes('#/dashboard');

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (isReportView) {
    return <ReportView />;
  }

  if (!profile || !profile.active) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 border border-amber-100 mb-6 animate-pulse">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-7 w-7"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Usuario no autorizado</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">Contacte al administrador.</p>
          
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={logout}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 px-5 text-xs font-black text-slate-600 hover:bg-slate-50 transition-all font-sans cursor-pointer"
            >
              <LogOut size={14} />
              Cerrar sesión
            </button>
            <button
              onClick={logout}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 px-5 text-xs font-black text-white hover:bg-blue-700 transition-all font-sans cursor-pointer"
            >
              <Home size={14} />
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isDashboardView) {
    return <DashboardBI />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AnimatePresence mode="wait">
        {profile.role === 'admin' ? (
          <motion.div
            key="admin"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AdminDashboard />
          </motion.div>
        ) : (
          <motion.div
            key="operator"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <OperatorDashboard />
          </motion.div>
        )
        }
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
