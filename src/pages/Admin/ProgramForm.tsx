import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { DefaultWashing, ShiftType, LineType, WASHING_OPERATORS, TruckInfo } from '../../types';
import { X, Calendar, Clock, MapPin, Hash, User, Truck, Info } from 'lucide-react';
import { INITIAL_CATALOG } from '../../data/initialCatalog';

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
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
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
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

interface ProgramFormProps {
  onClose: () => void;
}

export default function ProgramForm({ onClose }: ProgramFormProps) {
  const { profile } = useAuth();
  const [catalog, setCatalog] = useState<DefaultWashing[]>([]);
  const [trucks, setTrucks] = useState<TruckInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 'T39' as ShiftType,
    line: '' as LineType | '',
    segmentId: '',
    washingName: '',
    programmedQuantity: 0,
    washingOperator: WASHING_OPERATORS[0],
    truck: '',
    adminObservation: ''
  });

  useEffect(() => {
    const fetchCatalog = async () => {
      const q = query(collection(db, 'defaultWashings'), where('active', '==', true));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DefaultWashing));
      
      if (data.length === 0 && !isSeeding) {
        // Auto-seed if empty
        setIsSeeding(true);
        try {
          const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
          const promises = INITIAL_CATALOG.map(item => 
            addDoc(collection(db, 'defaultWashings'), {
              ...item,
              active: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              createdBy: 'system-auto'
            })
          );
          await Promise.all(promises);
          // Refetch after seeding
          const retrySnap = await getDocs(q);
          setCatalog(retrySnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DefaultWashing)));
        } catch (e) {
          console.error("Error auto-seeding:", e);
        } finally {
          setIsSeeding(false);
        }
      } else {
        setCatalog(data);
      }
    };

    const fetchTrucks = async () => {
        const q = query(collection(db, 'trucks'), where('active', '==', true));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckInfo));
        // Filter out "Fuera de servicio"
        const filtered = data.filter(t => t.status !== 'Fuera de servicio');
        setTrucks(filtered);
        if (filtered.length > 0) {
            setFormData(p => ({ ...p, truck: filtered[0].code }));
        }
    };

    fetchCatalog();
    fetchTrucks();
  }, []);

  const filteredCatalog = catalog.filter(item => item.line === formData.line);

  const handleSegmentSelect = (id: string) => {
    const selected = catalog.find(c => c.id === id);
    if (selected) {
      setFormData(prev => ({
        ...prev,
        segmentId: id,
        washingName: selected.segmentName,
        programmedQuantity: selected.defaultQuantity
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        segmentId: '',
        washingName: '',
        programmedQuantity: 0
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.line || !formData.washingName || formData.programmedQuantity <= 0) {
      alert("La cantidad programada debe ser mayor a 0.");
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'washingPrograms'), {
        date: formData.date,
        shift: formData.shift,
        line: formData.line,
        washingName: formData.washingName,
        programmedQuantity: formData.programmedQuantity,
        washingOperator: formData.washingOperator,
        truck: formData.truck,
        adminObservation: formData.adminObservation,
        status: 'Pendiente',
        type: 'Planta', // Default internal value
        closed: false,
        createdAt: serverTimestamp(),
        createdBy: profile?.email || auth.currentUser?.email || 'unknown',
        updatedAt: serverTimestamp()
      });
      onClose();
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, 'washingPrograms');
      } catch (err) {
        if (err instanceof Error) {
          alert(`Error al crear programa: ${err.message}`);
        } else {
          alert("Error al crear programa.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md overflow-hidden">
      <div className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-10 py-8 bg-slate-50/50">
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Nuevo Programa</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Planificación Diaria de Lavados</p>
          </div>
          <button onClick={onClose} className="rounded-2xl p-3 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all border border-transparent hover:border-slate-200">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-10 overflow-y-auto space-y-8">
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Fecha</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Turno</label>
              <div className="relative">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <select
                  required
                  value={formData.shift}
                  onChange={e => setFormData(p => ({ ...p, shift: e.target.value as ShiftType }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
                >
                  <option value="T39">T39</option>
                  <option value="T44">T44</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Línea</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <select
                  required
                  value={formData.line}
                  onChange={e => setFormData(p => ({ ...p, line: e.target.value as LineType, segmentId: '', washingName: '', programmedQuantity: 0 }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
                >
                  <option value="">Seleccionar línea...</option>
                  <option value="110 kV">110 kV</option>
                  <option value="33 kV">33 kV</option>
                  <option value="23 kV">23 kV</option>
                  <option value="6,6 kV">6,6 kV</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Tramo/Equipo</label>
              <div className="space-y-3">
                <select
                  disabled={!formData.line}
                  required
                  value={formData.segmentId}
                  onChange={e => handleSegmentSelect(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all disabled:opacity-50"
                >
                  <option value="">{formData.line ? 'Seleccionar tramo/equipo...' : 'Primero seleccione línea'}</option>
                  {filteredCatalog.map(item => (
                    <option key={item.id} value={item.id}>{item.segmentName}</option>
                  ))}
                </select>
                             {formData.line && filteredCatalog.length === 0 && !isSeeding && (
                  <p className="text-[11px] text-slate-400 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                    Cargando tramos predefinidos...
                  </p>
                )}
                {isSeeding && (
                  <p className="text-[11px] text-blue-600 font-bold animate-pulse p-3 rounded-xl bg-blue-50 border border-blue-100">
                    Sincronizando base de datos inicial...
                  </p>
                )}
              </div>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Cantidad Programada</label>
              <div className="relative">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.programmedQuantity}
                  onChange={e => setFormData(p => ({ ...p, programmedQuantity: parseInt(e.target.value) }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Operador de Lavado</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <select
                  required
                  value={formData.washingOperator}
                  onChange={e => setFormData(p => ({ ...p, washingOperator: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
                >
                  {WASHING_OPERATORS.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Camión</label>
              <div className="relative">
                <Truck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <select
                  required
                  value={formData.truck}
                  onChange={e => setFormData(p => ({ ...p, truck: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
                >
                  <option value="" disabled>Seleccionar camión...</option>
                  {trucks.map(tr => (
                    <option key={tr.id} value={tr.code}>{tr.code}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Observación (Opcional)</label>
              <textarea
                rows={3}
                value={formData.adminObservation}
                onChange={e => setFormData(p => ({ ...p, adminObservation: e.target.value }))}
                className="w-full rounded-3xl border border-slate-200 bg-slate-50 py-4 px-6 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all resize-none"
                placeholder="Detalles adicionales..."
              />
            </div>
          </div>

          <div className="pt-6 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-200 bg-white py-4 text-sm font-black text-slate-500 hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-2xl bg-slate-900 py-4 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50 shadow-xl shadow-slate-200 transition-all lg:hover:translate-y-[-2px]"
            >
              {loading ? 'Sincronizando...' : 'Publicar Programa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
