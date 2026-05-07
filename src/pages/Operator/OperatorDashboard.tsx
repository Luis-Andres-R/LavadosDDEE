import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  doc, 
  updateDoc, 
  addDoc, 
  setDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { WashingProgram, WashingRecord, REASONS, SHIFT_CONFIG, ShiftType, TruckOperatingHours } from '../../types';
import { 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  LogOut, 
  RefreshCcw, 
  Droplets,
  ChevronRight,
  Info,
  Check,
  AlertTriangle,
  History,
  Calendar as CalendarIcon,
  Home
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import ReadingsForm from '../../components/ReadingsForm';
import Logo from '../../components/Logo';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

export default function OperatorDashboard() {
  const { profile, logout } = useAuth();
  const [programs, setPrograms] = useState<WashingProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<WashingProgram | null>(null);
  const [action, setAction] = useState<'complete' | 'partial' | 'failed' | null>(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const [pwaOnline, setPwaOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setPwaOnline(true);
    const handleOffline = () => setPwaOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const q = query(
        collection(db, 'washingPrograms'), 
        where('date', '==', selectedDate),
        orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allPrograms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WashingProgram));
      setPrograms(allPrograms);
      setLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'washingPrograms');
      } catch (e) {
         console.error("Critical error in snapshot", e);
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [profile, selectedDate]);

  const calculateOperationalHours = (shift: ShiftType, failureTime: string | null) => {
    if (!failureTime) return { theoretical: 12, operational: 12, deducted: 0 };
    
    const config = SHIFT_CONFIG[shift];
    const [failH, failM] = failureTime.split(':').map(Number);
    const [startH, startM] = config.start.split(':').map(Number);
    
    let hours = 0;
    if (shift === 'T39') {
       const totalMin = (failH * 60 + failM) - (startH * 60 + startM);
       hours = totalMin / 60;
    } else {
       let failTotal = failH * 60 + failM;
       let startTotal = startH * 60 + startM;
       if (failTotal < startTotal) failTotal += 24 * 60;
       hours = (failTotal - startTotal) / 60;
    }
    
    const operational = Math.max(0, Math.min(12, parseFloat(hours.toFixed(2))));
    return {
      theoretical: 12,
      operational,
      deducted: parseFloat((12 - operational).toFixed(2))
    };
  };

  const handleAction = async (program: WashingProgram, type: 'complete' | 'partial' | 'failed', data?: any) => {
    try {
      const recordData: any = {
        programId: program.id!,
        operatorEmail: profile?.email || auth.currentUser?.email || '',
        syncStatus: 'synced',
        registeredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        programmedQuantity: program.programmedQuantity
      };

      let programUpdate: any = {
        updatedAt: serverTimestamp(),
        lastUpdatedBy: profile?.email || auth.currentUser?.email || 'operator'
      };

      if (type === 'complete') {
        recordData.status = 'Completo';
        recordData.completed = program.programmedQuantity;
        recordData.pending = 0;
        recordData.percentage = 100;
        
        programUpdate.status = 'Completo';
        programUpdate.completedCount = program.programmedQuantity;
        programUpdate.pendingCount = 0;
        programUpdate.percentage = 100;
      } else if (type === 'partial') {
        const pending = parseInt(data.pending);
        const completed = program.programmedQuantity - pending;
        recordData.status = 'Parcial';
        recordData.completed = completed;
        recordData.pending = pending;
        recordData.percentage = (completed / program.programmedQuantity) * 100;
        recordData.reason = data.reason;
        recordData.otherReason = data.otherReason;
        recordData.observation = data.observation;

        programUpdate.status = 'Parcial';
        programUpdate.completedCount = completed;
        programUpdate.pendingCount = pending;
        programUpdate.percentage = recordData.percentage;
        programUpdate.reason = data.reason;
      } else {
        recordData.status = 'No realizado';
        recordData.completed = 0;
        recordData.pending = program.programmedQuantity;
        recordData.percentage = 0;
        recordData.reason = data.reason;
        recordData.otherReason = data.otherReason;
        recordData.observation = data.observation;
        recordData.notPerformedDetectedAt = data.notPerformedDetectedAt;
        recordData.notPerformedDetail = data.notPerformedDetail;

        programUpdate.status = 'No realizado';
        programUpdate.completedCount = 0;
        programUpdate.pendingCount = program.programmedQuantity;
        programUpdate.percentage = 0;
        programUpdate.reason = data.reason;
        programUpdate.notPerformedDetectedAt = data.notPerformedDetectedAt;
        programUpdate.notPerformedDetail = data.notPerformedDetail;

        // Register truck operational hours if failed
        const { theoretical, operational, deducted } = calculateOperationalHours(program.shift, data.notPerformedDetectedAt);
        
        const opHoursData: TruckOperatingHours = {
          date: program.date,
          shift: program.shift,
          truck: program.truck,
          operatorEmail: profile?.email || '',
          washingOperator: program.washingOperator,
          theoreticalHours: theoretical,
          operationalHours: operational,
          deductedHours: deducted,
          failureDetectedAt: data.notPerformedDetectedAt,
          reason: data.reason,
          detail: data.notPerformedDetail || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        const opHId = `${program.date}_${program.shift}_${program.truck.replace(/\s+/g, '_')}`;
        await setDoc(doc(db, 'truckOperatingHours', opHId), opHoursData);
      }

      await addDoc(collection(db, 'washingRecords'), recordData);
      await (async () => {
        const docRef = doc(db, 'washingPrograms', program.id!);
        await updateDoc(docRef, programUpdate);
      })();
      
      setSelectedProgram(null);
      setAction(null);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, 'records/programs');
      } catch (err: any) {
        alert("Error al guardar registro: " + err.message);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans max-w-md mx-auto relative shadow-2xl overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900 px-6 py-4 text-white shadow-xl shadow-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Logo variant="light" className="h-10" />
            <div className="border-l border-white/10 pl-3">
              <h1 className="text-lg font-black tracking-tight leading-none uppercase">OPERADOR</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 bg-white/10 px-2.5 py-1 rounded-full border border-white/10`}>
                <div className={`h-1.5 w-1.5 rounded-full ${pwaOnline ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`} />
                <span className="text-[9px] font-black uppercase tracking-widest leading-none">{pwaOnline ? 'Online' : 'Offline'}</span>
            </div>
            <button onClick={() => { setSelectedDate(format(new Date(), 'yyyy-MM-dd')); setSelectedProgram(null); }} className="rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/20 transition-all">
              <Home size={20} />
            </button>
            <button onClick={logout} className="rounded-xl bg-red-500/20 p-2.5 text-red-400 hover:bg-red-500 hover:text-white transition-all">
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {/* Date Selector */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="flex items-center gap-3">
                <CalendarIcon className="text-blue-400" size={18} />
                <div className="flex-1">
                    <p className="text-[8px] font-black uppercase tracking-widest text-blue-400 leading-none mb-1">Fecha de Operación</p>
                    <input 
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent text-white font-black text-sm outline-hidden w-full cursor-pointer"
                    />
                </div>
            </div>
        </div>
      </header>

      {/* Program List */}
      <div className="px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Hoja de Ruta</h2>
            <p className="text-sm font-black text-slate-900 mt-0.5">
                {selectedDate === format(new Date(), 'yyyy-MM-dd') ? 'Tareas para HOY' : `Tareas de Fecha Selección`}
            </p>
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white shadow-sm border border-slate-100">
            <span className="text-sm font-black text-blue-600">{programs.length}</span>
          </div>
        </div>

        {loading ? (
             <div className="flex flex-col items-center justify-center py-24">
                <div className="relative">
                    <RefreshCcw className="h-12 w-12 animate-spin text-blue-100" />
                    <Droplets className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-600" size={20} />
                </div>
                <p className="mt-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando registros...</p>
             </div>
        ) : programs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
                    <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">¡Sin Retrasos!</h3>
                <p className="mt-2 text-sm font-medium text-slate-500 max-w-[200px]">No hay programas registrados para esta fecha.</p>
            </div>
        ) : (
            <div className="space-y-6">
                {programs.map(program => (
                    <ProgramCard 
                        key={program.id}
                        program={program} 
                        onSelect={() => setSelectedProgram(program)} 
                    />
                ))}
            </div>
        )}

        <div className="mt-12 border-t border-slate-200 pt-8">
            <ReadingsForm />
        </div>
      </div>

      <AnimatePresence>
        {selectedProgram && !action && (
          <SelectionDrawer 
            program={selectedProgram} 
            onClose={() => setSelectedProgram(null)} 
            onAction={setAction}
          />
        )}
        
        {selectedProgram && action && (
            <ActionModal 
                key={`modal-${selectedProgram.id}-${action}`}
                program={selectedProgram}
                type={action}
                onClose={() => setAction(null)}
                onSubmit={(data) => handleAction(selectedProgram, action, data)}
            />
        )}
      </AnimatePresence>
    </div>
  );
}

interface ProgramCardProps {
  key?: React.Key;
  program: WashingProgram;
  onSelect: () => void;
}

function ProgramCard({ program, onSelect }: ProgramCardProps) {
    return (
        <motion.div 
            whileTap={{ scale: 0.97 }}
            onClick={onSelect}
            className={`relative overflow-hidden rounded-[2rem] border bg-white p-8 shadow-sm active:shadow-inner transition-all hover:border-blue-200 group border-l-8 border-l-blue-600`}
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-50 text-slate-400 group-active:bg-blue-600 group-active:text-white transition-colors">
                        <Droplets size={16} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{program.date}</span>
                        <span className="text-[9px] font-bold text-blue-500 uppercase tracking-[0.2em]">{program.shift}</span>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">{program.truck}</span>
                    </div>
                </div>
            </div>
            
            <h3 className="text-xl font-black text-slate-900 tracking-tight leading-[1.1] mb-6">{program.washingName}</h3>
            
            <div className="flex flex-wrap gap-2 mb-8">
                <span className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 uppercase tracking-widest border border-blue-100">{program.line}</span>
                <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-600 uppercase tracking-widest border border-slate-100">{program.washingOperator}</span>
            </div>

            <div className="flex items-center justify-between p-6 rounded-3xl bg-slate-50 border border-slate-100">
                <div className="flex flex-col">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Volumen</p>
                    <p className="text-2xl font-black text-slate-900 tracking-tighter">{program.programmedQuantity}</p>
                </div>
                <div className="flex flex-col text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Registro</p>
                    <div className="flex items-center justify-center gap-1 bg-blue-600 px-4 py-2 rounded-xl text-white shadow-lg shadow-blue-100 transition-transform group-active:scale-95">
                        <span className="text-[10px] font-black uppercase tracking-widest">Ejecutar</span>
                        <ChevronRight size={14} />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function SelectionDrawer({ program, onClose, onAction }: { program: WashingProgram, onClose: () => void, onAction: (a: any) => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/80 backdrop-blur-md p-0">
            <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-md rounded-t-[3rem] bg-white p-10 shadow-2xl relative"
            >
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-slate-200" onClick={onClose} />
                
                <div className="mb-10 mt-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Confirmación de Avance</h3>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-[1.1] mt-1">{program.washingName}</h2>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <ActionButton 
                        label="Lavado Completo" 
                        sub="Ejecución terminada al 100%"
                        icon={<CheckCircle2 className="text-emerald-500" />} 
                        onClick={() => onAction('complete')}
                        color="green"
                    />
                    <ActionButton 
                        label="Lavado Parcial" 
                        sub="Trabajo pendiente / en curso"
                        icon={<Clock className="text-amber-500" />} 
                        onClick={() => onAction('partial')}
                        color="yellow"
                    />
                    <ActionButton 
                        label="Tarea No Realizada" 
                        sub="Imposibilidad técnica de lavado"
                        icon={<XCircle className="text-red-500" />} 
                        onClick={() => onAction('failed')}
                        color="red"
                    />
                    
                    <button onClick={onClose} className="mt-6 w-full py-4 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-colors">
                        Ignorar Registro
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

function ActionButton({ label, sub, icon, onClick, color }: { label: string, sub: string, icon: any, onClick: () => void, color: string }) {
    const borders: Record<string, string> = {
        green: 'border-emerald-100 bg-emerald-50/50 hover:border-emerald-500',
        yellow: 'border-amber-100 bg-amber-50/50 hover:border-amber-500',
        red: 'border-red-100 bg-red-50/50 hover:border-red-500'
    };

    return (
        <button 
            onClick={onClick}
            className={`flex items-center gap-5 rounded-3xl border-2 p-6 text-left transition-all active:scale-95 group ${borders[color]}`}
        >
            <div className="rounded-2xl bg-white p-3 shadow-sm group-active:scale-90 transition-transform">{icon}</div>
            <div className="flex-1">
                <p className="text-lg font-black text-slate-900 tracking-tight">{label}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{sub}</p>
            </div>
            <ChevronRight className="text-slate-300 group-hover:text-slate-900 transition-colors" size={24} />
        </button>
    );
}

function ActionModal({ program, type, onClose, onSubmit }: { program: WashingProgram, type: string, onClose: () => void, onSubmit: (d: any) => void, key?: React.Key }) {
    const [formData, setFormData] = useState({
        pending: '0',
        reason: 'Sin acceso',
        otherReason: '',
        observation: '',
        notPerformedDetectedAt: format(new Date(), 'HH:mm'),
        notPerformedDetail: ''
    });

    const isPartial = type === 'partial';
    const isFailed = type === 'failed';
    const isComplete = type === 'complete';

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/90 p-6 backdrop-blur-xl">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="w-full max-w-sm rounded-[2.5rem] bg-white overflow-hidden shadow-2xl border border-slate-200"
            >
                <div className="p-8 text-center bg-slate-50/80 border-b border-slate-100">
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                        {isComplete ? 'Confirmar Éxito' : isPartial ? 'Informar Restante' : 'Notificar Incidencia'}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sincronización Obligatoria</p>
                </div>

                <div className="p-10">
                    {isComplete ? (
                        <div className="mb-10 text-center">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-50 text-emerald-500 mb-6 shadow-inner ring-4 ring-emerald-50">
                                <CheckCircle2 size={40} />
                            </div>
                            <p className="text-sm font-bold text-slate-600 leading-relaxed">
                                Estas por registrar el cumplimiento del <span className="text-emerald-600 font-black">100%</span> del programa:<br/>
                                <span className="bg-slate-100 px-3 py-1 rounded-lg text-slate-900 inline-block mt-3 font-black text-lg">{program.programmedQuantity} Lavados</span>
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-8 mb-10">
                            {isPartial && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Cant. Pendiente</label>
                                    <div className="relative">
                                        <input 
                                            type="text"
                                            inputMode="numeric"
                                            value={formData.pending}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val === '' || /^\d+$/.test(val)) {
                                                    setFormData(f => ({ ...f, pending: val }));
                                                }
                                            }}
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-2xl font-black text-slate-900 outline-hidden focus:bg-white focus:border-blue-500"
                                        />
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                            MAX: {program.programmedQuantity - 1}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Causa de la Deuda</label>
                                <select 
                                    value={formData.reason}
                                    onChange={e => setFormData(f => ({ ...f, reason: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
                                >
                                    {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>

                            {isFailed && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Hora detección de no realización</label>
                                        <input 
                                            required
                                            type="time" 
                                            value={formData.notPerformedDetectedAt}
                                            onChange={e => setFormData(f => ({ ...f, notPerformedDetectedAt: e.target.value }))}
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Detalle de la Contingencia *</label>
                                        <textarea 
                                            required
                                            value={formData.notPerformedDetail}
                                            onChange={e => setFormData(f => ({ ...f, notPerformedDetail: e.target.value }))}
                                            className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 resize-none"
                                            rows={2}
                                            placeholder="Describa la falla mecánica, neumático, etc..."
                                        />
                                    </div>
                                </>
                            )}

                            {formData.reason === 'Otro' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Especificar Razón</label>
                                    <input 
                                        required
                                        type="text" 
                                        value={formData.otherReason}
                                        onChange={e => setFormData(f => ({ ...f, otherReason: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
                                        placeholder="Descripción mínima..."
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Observaciones en Terreno</label>
                                <textarea 
                                    value={formData.observation}
                                    onChange={e => setFormData(f => ({ ...f, observation: e.target.value }))}
                                    className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 resize-none"
                                    rows={3}
                                    placeholder="Detalles técnicos..."
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex gap-4">
                        <button onClick={onClose} className="flex-1 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-colors">Atrás</button>
                        <button 
                            onClick={() => onSubmit(formData)}
                            className={`flex-1 rounded-[1.25rem] py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 ${
                                isComplete ? 'bg-emerald-600 shadow-emerald-100' : 
                                isPartial ? 'bg-amber-600 shadow-amber-100' : 'bg-red-600 shadow-red-100'
                            }`}
                        >
                            Sincronizar
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
  );
}
