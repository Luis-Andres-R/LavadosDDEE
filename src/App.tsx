import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import AdminDashboard from './pages/Admin/AdminDashboard';
import OperatorDashboard from './pages/Operator/OperatorDashboard';
import ReportView from './pages/Admin/ReportView';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'catalog' | 'programs' | 'reports'>('programs');

  const isReportView = window.location.search.includes('view=report');

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
      <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <h1 className="text-2xl font-bold text-red-600">Usuario no autorizado</h1>
        <p className="mt-2 text-gray-600">Contacte al administrador para habilitar su acceso.</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
        >
          Reintentar
        </button>
      </div>
    );
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
