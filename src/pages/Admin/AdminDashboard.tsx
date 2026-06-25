import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  BarChart3, 
  ClipboardList, 
  Settings, 
  LogOut, 
  Plus, 
  Filter, 
  FileText, 
  Search,
  Bell,
  User as UserIcon,
  ChevronRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Droplets,
  Thermometer
} from 'lucide-react';
import ProgramList from './ProgramList';
import Catalog from './Catalog';
import Reports from './Reports';
import OperationalReadings from './OperationalReadings';
import TruckStatusManager from './TruckStatusManager';
import TruckOperatingHoursManager from './TruckOperatingHours';
import OutOfProgramList from './OutOfProgramList';
import ProgramForm from './ProgramForm';
import Logo from '../../components/Logo';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, onSnapshot, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { WashingProgram } from '../../types';
import { Truck } from 'lucide-react';

export default function AdminDashboard() {
  const { logout, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'programs' | 'catalog' | 'reports' | 'readings' | 'trucks' | 'hours' | 'outOfProgram'>('programs');
  const [showProgramForm, setShowProgramForm] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    complete: 0,
    partial: 0,
    notPerformed: 0,
    percentage: 0
  });

  useEffect(() => {
    const q = query(collection(db, 'washingPrograms'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const programs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WashingProgram));
      const total = programs.length;
      const pending = programs.filter(p => p.status === 'Pendiente').length;
      const complete = programs.filter(p => p.status === 'Completo' || p.status === 'Cerrado').length;
      const partial = programs.filter(p => p.status === 'Parcial').length;
      const notPerformed = programs.filter(p => p.status === 'No realizado').length;
      
      setStats({
        total,
        pending,
        complete,
        partial,
        notPerformed,
        percentage: total > 0 ? (complete / total) * 100 : 0
      });
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {/* Sidebar - Desktop */}
      <aside className="hidden w-64 flex-col bg-slate-900 text-slate-400 p-4 lg:flex shrink-0">
        <div className="flex items-center gap-3 px-2 py-6 mb-4">
          <Logo variant="light" className="h-10" />
        </div>
        
        <nav className="flex-1 space-y-1">
          <SidebarLink 
            active={activeTab === 'programs'} 
            onClick={() => setActiveTab('programs')} 
            icon={<ClipboardList size={18} />} 
            label="Inicio" 
          />
          <SidebarLink 
            active={activeTab === 'reports'} 
            onClick={() => setActiveTab('reports')} 
            icon={<FileText size={18} />} 
            label="Generar Reportes" 
          />
          <SidebarLink 
            active={activeTab === 'readings'} 
            onClick={() => setActiveTab('readings')} 
            icon={<Thermometer size={18} />} 
            label="Lecturas Operacionales" 
          />
          <SidebarLink 
            active={activeTab === 'trucks'} 
            onClick={() => setActiveTab('trucks')} 
            icon={<Truck size={18} />} 
            label="Estado Camiones" 
          />
          <SidebarLink 
            active={activeTab === 'outOfProgram'} 
            onClick={() => setActiveTab('outOfProgram')} 
            icon={<AlertTriangle size={18} />} 
            label="Fuera de programa" 
          />
          <SidebarLink 
            active={false} 
            onClick={() => window.open('/dashboard', '_blank')} 
            icon={<BarChart3 size={18} className="text-orange-400" />} 
            label="Dashboard BI / TV" 
          />
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-6 px-3">
            <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white font-bold">
              {profile?.displayName?.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{profile?.displayName}</p>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">{profile?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={18} />
            Salir del Sistema
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8 shadow-sm">
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {activeTab === 'programs' ? 'Operaciones de Lavado' : 
               activeTab === 'catalog' ? 'Configuración de Líneas' : 
               activeTab === 'reports' ? 'Reportes y Analíticas' : 
               activeTab === 'readings' ? 'Condiciones de Agua y Estanques' : 
               activeTab === 'trucks' ? 'Disponibilidad de Flota' :
               activeTab === 'outOfProgram' ? 'Registros Fuera de Programa' :
               'Horas Operativas Acumuladas'}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Control de Eficiencia Operativa</p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Servidor Sincronizado</span>
            </div>
            
            <button className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors border border-slate-100">
              <Bell size={20} />
            </button>
            
            <button 
              onClick={() => window.open('/dashboard', '_blank')}
              className="flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-orange-500/30 px-5 py-3 text-sm font-bold text-white shadow-xl hover:bg-slate-800 hover:scale-[1.02] transition-all active:scale-95"
            >
              <BarChart3 size={18} className="text-orange-400 animate-pulse" />
              <span className="hidden sm:inline">Dashboard BI / TV</span>
              <span className="sm:hidden">BI</span>
            </button>

            {activeTab === 'programs' && (
              <button 
                onClick={() => setShowProgramForm(true)}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-blue-200 hover:bg-blue-700 hover:scale-[1.02] transition-all active:scale-95"
              >
                <Plus size={20} />
                Nuevo Programa
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {/* Stats Bar */}
          {activeTab === 'programs' && (
            <div className="mb-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Ejecución Hoy" value={stats.total} icon={<TrendingUp />} color="blue" subtext={`${stats.total - stats.pending} Avances`} />
              <StatCard label="Completados" value={stats.complete} icon={<CheckCircle2 />} color="emerald" subtext={`${stats.percentage.toFixed(1)}% Cumplimiento`} />
              <StatCard label="Parciales" value={stats.partial} icon={<Clock />} color="amber" subtext="Estado en curso" />
              <StatCard label="No Realizados" value={stats.notPerformed} icon={<XCircle />} color="red" subtext="Requiere revisión" />
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'programs' && <ProgramList />}
              {activeTab === 'catalog' && <Catalog />}
              {activeTab === 'reports' && <Reports onHome={() => setActiveTab('programs')} />}
              {activeTab === 'readings' && <OperationalReadings />}
              {activeTab === 'trucks' && <TruckStatusManager onHome={() => setActiveTab('programs')} />}
              {activeTab === 'hours' && <TruckOperatingHoursManager />}
              {activeTab === 'outOfProgram' && <OutOfProgramList />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Program Form Modal */}
      {showProgramForm && (
        <ProgramForm onClose={() => setShowProgramForm(false)} />
      )}

      {/* Mobile Navigation */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white px-2 py-1 lg:hidden flex justify-around">
          <button onClick={() => setActiveTab('programs')} className={`flex flex-col items-center p-2 ${activeTab === 'programs' ? 'text-blue-600' : 'text-slate-400'}`}>
            <ClipboardList size={24} />
            <span className="text-[10px] font-bold">Inicio</span>
          </button>
          <button onClick={() => setActiveTab('reports')} className={`flex flex-col items-center p-2 ${activeTab === 'reports' ? 'text-blue-600' : 'text-slate-400'}`}>
            <FileText size={24} />
            <span className="text-[10px] font-bold">KPI</span>
          </button>
          <button onClick={() => setActiveTab('readings')} className={`flex flex-col items-center p-2 ${activeTab === 'readings' ? 'text-blue-600' : 'text-slate-400'}`}>
            <Thermometer size={24} />
            <span className="text-[10px] font-bold">Lecturas</span>
          </button>
          <button onClick={() => setActiveTab('trucks')} className={`flex flex-col items-center p-2 ${activeTab === 'trucks' ? 'text-blue-600' : 'text-slate-400'}`}>
            <Truck size={24} />
            <span className="text-[10px] font-bold">Camiones</span>
          </button>
          <button onClick={() => setActiveTab('outOfProgram')} className={`flex flex-col items-center p-2 ${activeTab === 'outOfProgram' ? 'text-blue-600' : 'text-slate-400'}`}>
            <AlertTriangle size={24} />
            <span className="text-[10px] font-bold">Eventos</span>
          </button>
          <button onClick={logout} className="flex flex-col items-center p-2 text-red-500">
            <LogOut size={24} />
            <span className="text-[10px] font-bold">Salir</span>
          </button>
      </div>
    </div>
  );
}

function SidebarLink({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-bold transition-all ${
        active ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-600 rounded-l-none pl-3' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value, icon, color, subtext }: { label: string, value: number, icon: React.ReactNode, color: string, subtext: string }) {
  const themes: Record<string, any> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100', iconBg: 'bg-blue-600', iconText: 'text-white' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', iconBg: 'bg-emerald-600', iconText: 'text-white' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', iconBg: 'bg-amber-600', iconText: 'text-white' },
    red: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-100', iconBg: 'bg-red-600', iconText: 'text-white' },
  };

  const theme = themes[color];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-slate-300">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{label}</p>
          <h3 className="text-3xl font-black text-slate-900">{value}</h3>
          <p className={`mt-2 text-[10px] font-bold uppercase tracking-wider ${theme.text}`}>{subtext}</p>
        </div>
        <div className={`rounded-xl p-3 shadow-lg ${theme.iconBg} ${theme.iconText} transition-transform group-hover:scale-110 group-hover:rotate-3`}>
          {React.cloneElement(icon as React.ReactElement, { size: 24 })}
        </div>
      </div>
      <div className={`absolute bottom-0 left-0 h-1.5 w-full ${theme.iconBg} opacity-20 group-hover:opacity-100 transition-opacity`}></div>
    </div>
  );
}
