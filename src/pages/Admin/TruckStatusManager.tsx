import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { TruckInfo, INITIAL_TRUCKS, TruckStatus, ShiftType } from '../../types';
import { Truck, Save, AlertTriangle, CheckCircle2, History, Calendar, Clock, Home, X, CheckCircle, Wrench } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

export default function TruckStatusManager({ onHome }: { onHome?: () => void }) {
  const { profile } = useAuth();
  const [trucks, setTrucks] = useState<TruckInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedShift, setSelectedShift] = useState<ShiftType>('T39');
  const [pendingChanges, setPendingChanges] = useState<Record<string, TruckStatus>>({});
  const [workshopDetails, setWorkshopDetails] = useState<Record<string, { entryHour?: string; reason?: string; observation?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'trucks'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckInfo));
      
      if (data.length === 0 && loading) {
        initializeTrucks();
      } else {
        const validTrucks = data
          .filter(t => t.code && INITIAL_TRUCKS.includes(t.code))
          .sort((a, b) => a.code.localeCompare(b.code));
        
        setTrucks(validTrucks);
        setLoading(false);
      }
    });

    // Check if there's already a history record for the selected date/shift
    const checkHistory = async () => {
      const historyId = `${selectedDate}_${selectedShift}`;
      const historyRef = doc(db, 'truckStatusHistory', historyId);
      try {
        const snap = await getDoc(historyRef);
        if (snap.exists()) {
          const historyData = snap.data();
          const changes: Record<string, TruckStatus> = {};
          const details: Record<string, { entryHour?: string; reason?: string; observation?: string }> = {};
          
          historyData.trucks.forEach((t: any) => {
            changes[t.code] = t.status;
            details[t.code] = {
              entryHour: t.entryHour || '',
              reason: t.reason || '',
              observation: t.observation || ''
            };
          });
          setPendingChanges(changes);
          setWorkshopDetails(details);
        } else {
          setPendingChanges({});
          setWorkshopDetails({});
        }
      } catch (e) {
        console.error("Error checking history", e);
      }
    };

    checkHistory();

    return () => unsub();
  }, [loading, selectedDate, selectedShift]);

  const initializeTrucks = async () => {
    try {
      for (const code of INITIAL_TRUCKS) {
        const truckRef = doc(db, 'trucks', code);
        await setDoc(truckRef, {
          code,
          status: 'Sin Registrar', // Defaulting to Sin Registrar for 1.0 architecture
          active: true,
          updatedAt: serverTimestamp(),
          updatedBy: profile?.email || 'sistema'
        });
      }
    } catch (e) {
      console.error("Error initializing trucks", e);
    }
  };

  const handleStatusChange = (truckId: string, newStatus: TruckStatus) => {
    setPendingChanges(prev => ({
      ...prev,
      [truckId]: newStatus
    }));
  };

  const saveAllChanges = async () => {
    setSaving(true);
    setError(null);
    try {
      const historyId = `${selectedDate}_${selectedShift}`;
      const historyTrucks: any[] = [];

      // 1. Update individual truck records (Global Status) and prepare historical payload
      for (const truck of trucks) {
        const newStatus = pendingChanges[truck.id!] || truck.status;
        const details = workshopDetails[truck.id!] || {};
        
        const payload: any = {
          code: truck.code,
          status: newStatus
        };

        if (newStatus === 'En taller') {
          payload.entryHour = details.entryHour || '';
          payload.reason = details.reason || '';
          payload.observation = details.observation || '';
        } else {
          payload.entryHour = '';
          payload.reason = '';
          payload.observation = '';
        }

        historyTrucks.push(payload);
        
        const truckRef = doc(db, 'trucks', truck.id!);
        await setDoc(truckRef, {
          ...payload,
          active: true,
          updatedAt: serverTimestamp(),
          updatedBy: profile?.email || 'admin'
        }, { merge: true });
      }

      // 2. Save Historical Record
      const historyRef = doc(db, 'truckStatusHistory', historyId);
      await setDoc(historyRef, {
        date: selectedDate,
        shift: selectedShift,
        trucks: historyTrucks,
        savedAt: serverTimestamp(),
        savedBy: profile?.email || 'admin'
      });
      
      setPendingChanges({});
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (e) {
      console.error("Error saving truck statuses", e);
      setError("No fue posible guardar los estados de camiones. Intente nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(pendingChanges).length > 0;

  const getStatusColor = (status: TruckStatus) => {
    switch (status) {
      case 'En servicio': return 'bg-emerald-500 text-white';
      case 'Disponible': return 'bg-blue-500 text-white';
      case 'Fuera de servicio': return 'bg-rose-500 text-white';
      case 'En taller': return 'bg-amber-500 text-white';
      case 'Sin Registrar':
      default:
        return 'bg-slate-400 text-white';
    }
  };

  return (
    <div className="space-y-8 pb-20 relative">
      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 right-8 z-50 bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-500"
          >
            <CheckCircle size={20} />
            <p className="text-sm font-black uppercase tracking-widest">Estados de camiones guardados correctamente.</p>
            <button onClick={() => setShowSuccess(false)} className="ml-2 hover:bg-white/20 p-1 rounded-lg transition-colors">
              <X size={16} />
            </button>
          </motion.div>
        )}

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 right-8 z-50 bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-red-500"
          >
            <AlertTriangle size={20} />
            <p className="text-sm font-black uppercase tracking-widest">{error}</p>
            <button onClick={() => setError(null)} className="ml-2 hover:bg-white/20 p-1 rounded-lg transition-colors">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-4">
                <div className="bg-slate-900 p-2.5 rounded-xl text-white">
                    <Truck size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">Estado de Camiones</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Gestión de Disponibilidad Flota</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
                <button
                    onClick={onHome}
                    className="flex items-center gap-2 px-4 py-4 rounded-2xl text-xs font-black uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all shadow-sm"
                >
                    <Home size={16} />
                    Inicio
                </button>

                {/* Date/Shift Selectors */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1.5 px-4">
                    <div className="flex items-center gap-2 pr-3 border-r border-slate-200">
                      <Calendar size={14} className="text-slate-400" />
                      <input 
                        type="date" 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2 pl-2">
                      <Clock size={14} className="text-slate-400" />
                      <select 
                        value={selectedShift}
                        onChange={(e) => setSelectedShift(e.target.value as ShiftType)}
                        className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none appearance-none cursor-pointer"
                      >
                        <option value="T39">T39 (Día)</option>
                        <option value="T44">T44 (Noche)</option>
                      </select>
                    </div>
                </div>

                <button
                    onClick={saveAllChanges}
                    disabled={saving}
                    className={`flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 ${
                        saving
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                    }`}
                >
                    {saving ? (
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <Save size={16} />
                    )}
                    {saving ? 'Guardando...' : 'Guardar estados de camiones'}
                </button>
            </div>
        </div>

        {loading ? (
            <div className="py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando flota...</div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {trucks.map((truck) => {
                    const currentStatus = pendingChanges[truck.id!] || truck.status;
                    const isChanged = !!pendingChanges[truck.id!];

                    return (
                        <div key={truck.id} className={`bg-slate-50 rounded-[2rem] border transition-all p-6 relative overflow-hidden group ${
                            isChanged ? 'border-blue-400 ring-2 ring-blue-50 bg-blue-50/10' : 'border-slate-100'
                        }`}>
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-xl bg-white shadow-sm font-black text-xs ${truck.status === 'Fuera de servicio' ? 'text-red-500' : 'text-slate-900'}`}>
                                        {truck.code}
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusColor(currentStatus)}`}>
                                        {currentStatus}
                                    </span>
                                </div>
                                {isChanged && (
                                    <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg animate-pulse">
                                        <AlertTriangle size={12} />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 ml-1">Seleccionar Estado</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['En servicio', 'Disponible', 'Fuera de servicio', 'En taller', 'Sin Registrar'] as TruckStatus[]).map((st) => (
                                        <button
                                            key={st}
                                            onClick={() => handleStatusChange(truck.id!, st)}
                                            className={`py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                                currentStatus === st 
                                                ? 'bg-slate-900 text-white shadow-md' 
                                                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
                                            }`}
                                        >
                                            {st}
                                        </button>
                                    ))}
                                </div>

                                {/* DYNAMIC WORKSHOP DETAILS FORM (Mejora N.º 7) */}
                                {currentStatus === 'En taller' && (
                                  <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                                    <h4 className="text-[9px] font-black uppercase tracking-wider text-amber-600 flex items-center gap-1">
                                      <Wrench size={10} /> DETALLE DE INGRESO A TALLER
                                    </h4>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Hora de Ingreso</label>
                                        <input 
                                          type="time"
                                          value={workshopDetails[truck.id!]?.entryHour || ''}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setWorkshopDetails(prev => ({
                                              ...prev,
                                              [truck.id!]: { ...prev[truck.id!], entryHour: val }
                                            }));
                                            handleStatusChange(truck.id!, 'En taller');
                                          }}
                                          className="w-full bg-white border border-slate-200 px-2 py-1.5 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Motivo</label>
                                        <input 
                                          type="text"
                                          placeholder="Ej: Falla mecánica"
                                          value={workshopDetails[truck.id!]?.reason || ''}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setWorkshopDetails(prev => ({
                                              ...prev,
                                              [truck.id!]: { ...prev[truck.id!], reason: val }
                                            }));
                                            handleStatusChange(truck.id!, 'En taller');
                                          }}
                                          className="w-full bg-white border border-slate-200 px-2 py-1.5 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500 placeholder-slate-400"
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Observación</label>
                                      <textarea 
                                        placeholder="Ingrese observaciones técnicas..."
                                        rows={2}
                                        value={workshopDetails[truck.id!]?.observation || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setWorkshopDetails(prev => ({
                                            ...prev,
                                            [truck.id!]: { ...prev[truck.id!], observation: val }
                                          }));
                                          handleStatusChange(truck.id!, 'En taller');
                                        }}
                                        className="w-full bg-white border border-slate-200 px-2 py-1.5 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:border-amber-500 placeholder-slate-400"
                                      />
                                    </div>
                                  </div>
                                )}
                            </div>

                            <div className="mt-6 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                                    <History size={10} />
                                    Act: {truck.updatedBy}
                                </div>
                                {isChanged && (
                                    <button 
                                        onClick={() => {
                                            const newPending = { ...pendingChanges };
                                            delete newPending[truck.id!];
                                            setPendingChanges(newPending);
                                        }}
                                        className="text-[8px] font-black uppercase tracking-widest text-red-500 hover:underline"
                                    >
                                        Deshacer
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
      </div>
    </div>
  );
}
