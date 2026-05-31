import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { ShiftType, WASHING_OPERATORS, TruckInfo, WASHING_TRUCKS } from '../../types';
import { X, Calendar, Clock, MapPin, User, Truck, Info, CheckSquare, Layers } from 'lucide-react';
import { INITIAL_WASHING_TEMPLATES, WashingTemplate } from '../../data/washingTemplates';

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

const AREAS = [
  'Equipos críticos CS',
  'Interior planta CS',
  'Equipos críticos en periferia',
  'Lavado periferia'
] as const;

export default function ProgramForm({ onClose }: ProgramFormProps) {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<WashingTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [selectedArea, setSelectedArea] = useState<typeof AREAS[number] | ''>('');
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 'T39' as ShiftType,
    washingOperator: WASHING_OPERATORS[0],
    truck: WASHING_TRUCKS[0],
    adminObservation: ''
  });

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const q = query(collection(db, 'washingProgramTemplates'), where('active', '==', true));
        const snap = await getDocs(q);
        let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)) as WashingTemplate[];
        
        if (data.length === 0 && !isSeeding) {
          setIsSeeding(true);
          try {
            const promises = INITIAL_WASHING_TEMPLATES.map(item => 
              addDoc(collection(db, 'washingProgramTemplates'), {
                ...item,
                active: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              })
            );
            await Promise.all(promises);
            // Refetch after seeding
            const retrySnap = await getDocs(q);
            data = retrySnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)) as WashingTemplate[];
          } catch (e) {
            console.error("Error auto-seeding templates:", e);
          } finally {
            setIsSeeding(false);
          }
        }
        setTemplates(data);
      } catch (error) {
        console.error("Error fetching templates:", error);
      }
    };

    fetchTemplates();
  }, []);

  // Filter templates by chosen area
  const filteredTemplates = templates.filter(t => t.areaName === selectedArea);

  const handleTogglePackage = (packageName: string) => {
    setSelectedPackages(prev => 
      prev.includes(packageName) 
        ? prev.filter(name => name !== packageName)
        : [...prev, packageName]
    );
  };

  const handleSelectAll = () => {
    if (selectedPackages.length === filteredTemplates.length) {
      setSelectedPackages([]);
    } else {
      setSelectedPackages(filteredTemplates.map(t => t.packageName));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArea) {
      alert("Por favor seleccione un área principal.");
      return;
    }
    if (selectedPackages.length === 0) {
      alert("Debe seleccionar al menos un paquete para programar.");
      return;
    }

    setLoading(true);

    try {
      // Create separate washingPrograms documents for each selected package
      const creationPromises = selectedPackages.map(async (packageName) => {
        const pkgTemplate = filteredTemplates.find(t => t.packageName === packageName);
        if (!pkgTemplate) return;

        // Map area to old types for backward-compat
        let legacyType: 'Equipos críticos' | 'Planta' | 'Periferia' = 'Planta';
        if (selectedArea === 'Equipos críticos CS') {
          legacyType = 'Equipos críticos';
        } else if (selectedArea === 'Interior planta CS') {
          legacyType = 'Planta';
        } else if (selectedArea === 'Equipos críticos en periferia' || selectedArea === 'Lavado periferia') {
          legacyType = 'Periferia';
        }

        const programmedQty = pkgTemplate.controlType === 'checklist' 
          ? (pkgTemplate.items?.length || 0)
          : (pkgTemplate.quantity || 1);

        const payload: any = {
          date: formData.date,
          shift: formData.shift,
          line: selectedArea, // for backward compatible lists
          washingName: packageName, // for backward compatible lists
          programmedQuantity: programmedQty,
          type: legacyType,
          washingOperator: formData.washingOperator,
          truck: formData.truck,
          adminObservation: formData.adminObservation,
          status: 'Pendiente',
          closed: false,
          createdAt: serverTimestamp(),
          createdBy: profile?.email || auth.currentUser?.email || 'unknown',
          updatedAt: serverTimestamp(),
          
          // V2 Specific info
          areaName: selectedArea,
          packageName: packageName,
          controlType: pkgTemplate.controlType,
          active: pkgTemplate.active !== false,
          completedCount: 0,
          pendingCount: programmedQty,
          percentage: 0
        };

        if (pkgTemplate.controlType === 'cantidad') {
          payload.quantity = pkgTemplate.quantity || 1;
        }

        if (pkgTemplate.controlType === 'checklist' && pkgTemplate.items) {
          payload.items = pkgTemplate.items.map(it => ({
            itemName: it.itemName,
            order: it.order,
            active: it.active,
            done: false
          }));
        }

        await addDoc(collection(db, 'washingPrograms'), payload);
      });

      await Promise.all(creationPromises);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md overflow-hidden animate-fade-in">
      <div className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-10 py-8 bg-slate-50/50">
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Nuevo Programa <span className="text-blue-600 text-sm font-black align-super px-2 py-0.5 rounded-full bg-blue-50">V2</span></h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Planificación por Paquetes de Lavado</p>
          </div>
          <button onClick={onClose} className="rounded-2xl p-3 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all border border-transparent hover:border-slate-200">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-10 overflow-y-auto space-y-8 flex-1">
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            
            {/* Date Input */}
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

            {/* Shift Input */}
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

            {/* Main Area Selection */}
            <div className="sm:col-span-2 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Área Principal de Lavado</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <select
                  required
                  value={selectedArea}
                  onChange={e => {
                    setSelectedArea(e.target.value as any);
                    setSelectedPackages([]); // reset matches
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
                >
                  <option value="">Seleccionar área principal...</option>
                  {AREAS.map(area => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Package List Grid (Checkboxes) */}
            {selectedArea && (
              <div className="sm:col-span-2 space-y-3 bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Paquetes Disponibles ({filteredTemplates.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs font-black text-blue-600 hover:text-blue-800 transition-all"
                  >
                    {selectedPackages.length === filteredTemplates.length ? 'Desmarcar Todos' : 'Seleccionar Todos'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 max-h-[220px] overflow-y-auto pr-2 mt-2">
                  {filteredTemplates.map((pkg, idx) => {
                    const isChecked = selectedPackages.includes(pkg.packageName);
                    return (
                      <div
                        key={pkg.id || `${pkg.packageName}_${idx}`}
                        onClick={() => handleTogglePackage(pkg.packageName)}
                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                          isChecked 
                            ? 'bg-blue-50 border-blue-200 shadow-xs' 
                            : 'bg-white border-slate-150 hover:bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                            isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {isChecked && <CheckSquare className="w-4 h-4" />}
                          </div>
                          <span className="text-sm font-black text-slate-850 truncate max-w-[320px]">
                            {pkg.packageName}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${
                            pkg.controlType === 'checklist'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : 'bg-indigo-50 text-indigo-750 border-indigo-100'
                          }`}>
                            {pkg.controlType === 'checklist' ? 'Checklist' : `Cantidad (${pkg.quantity})`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isSeeding && (
              <div className="sm:col-span-2 text-[11px] text-blue-600 font-bold animate-pulse p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-center gap-2">
                <Info size={16} />
                Sincronizando la base de datos maestra con templates iniciales...
              </div>
            )}

            {/* Operator Selection */}
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

            {/* Truck Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Camión</label>
              <div className="relative">
                <Truck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <select
                  required
                  value={formData.truck}
                  onChange={e => setFormData(p => ({ ...p, truck: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all font-mono"
                >
                  <option value="" disabled>Seleccionar camión...</option>
                  {WASHING_TRUCKS.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Admin Observations */}
            <div className="sm:col-span-2 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Observación (Opcional)</label>
              <textarea
                rows={2}
                value={formData.adminObservation}
                onChange={e => setFormData(p => ({ ...p, adminObservation: e.target.value }))}
                className="w-full rounded-3xl border border-slate-200 bg-slate-50 py-4 px-6 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all resize-none"
                placeholder="Detalles adicionales para este grupo de lavados..."
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-200 bg-white py-4 text-sm font-black text-slate-500 hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || isSeeding}
              className="flex-1 rounded-2xl bg-blue-600 py-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50 shadow-xl shadow-blue-100 transition-all lg:hover:translate-y-[-2px]"
            >
              {loading ? 'Sincronizando...' : 'Crear programa del día'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
