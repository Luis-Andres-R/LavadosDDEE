import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, updateDoc, doc, deleteDoc, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { WashingProgram } from '../../types';
import { 
  Lock, 
  Unlock, 
  MoreVertical, 
  Trash2, 
  AlertCircle, 
  CheckCircle,
  MoreHorizontal,
  ArrowRight,
  Filter,
  Calendar,
  User as UserIcon,
  Search,
  ChevronDown,
  ClipboardList,
  Truck
} from 'lucide-react';
import { format } from 'date-fns';

export default function ProgramList() {
  const [programs, setPrograms] = useState<WashingProgram[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Todos');

  useEffect(() => {
    const q = query(collection(db, 'washingPrograms'), orderBy('date', 'desc'), orderBy('shift', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPrograms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WashingProgram)));
    });
    return () => unsubscribe();
  }, []);

  const handleToggleClose = async (program: WashingProgram) => {
    try {
      await updateDoc(doc(db, 'washingPrograms', program.id!), {
        closed: !program.closed,
        status: !program.closed ? 'Cerrado' : program.status === 'Cerrado' ? 'Pendiente' : program.status,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Está seguro de eliminar este programa?")) {
      try {
        await deleteDoc(doc(db, 'washingPrograms', id));
      } catch (error) {
        console.error(error);
      }
    }
  };

  const filteredPrograms = programs.filter(p => {
    const matchesSearch = p.washingName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.line.includes(searchTerm) ||
                          p.washingOperator?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.truck?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'Todos' || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar lavado, línea, operador o camión..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm font-medium focus:border-blue-500 focus:bg-white transition-all outline-hidden"
          />
        </div>
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                <Filter size={16} className="text-slate-400" />
                <select 
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="bg-transparent text-sm font-bold text-slate-600 outline-hidden pr-8"
                >
                    <option value="Todos">Todos los Estados</option>
                    <option value="Pendiente">Pendiente</option>
                    <option value="Completo">Completo</option>
                    <option value="Parcial">Parcial</option>
                    <option value="No realizado">No realizado</option>
                    <option value="Cerrado">Cerrado</option>
                </select>
            </div>
        </div>
      </div>

      {/* Program Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {filteredPrograms.map((program) => (
          <div 
            key={program.id} 
            className={`group relative overflow-hidden rounded-2xl border bg-white p-6 shadow-sm transition-all hover:shadow-md ${program.closed ? 'border-slate-200 bg-slate-50/50 grayscale-[0.5]' : 'border-slate-200'}`}
          >
            <div className="mb-6 flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider ${
                        program.status === 'Completo' || program.status === 'Cerrado' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        program.status === 'Parcial' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                        program.status === 'No realizado' ? 'bg-red-100 text-red-700 border border-red-200' :
                        'bg-slate-100 text-slate-700'
                    }`}>
                        {program.status}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 uppercase tracking-widest border border-blue-100">
                        {program.controlType ? (program.controlType === 'checklist' ? '📋 Checklist' : '🔢 Cantidad') : (program.line || 'Lavado')}
                    </span>
                    {program.areaName && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-700 uppercase tracking-widest border border-slate-250">
                        {program.areaName}
                      </span>
                    )}
                    {program.closed && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-black text-white uppercase tracking-widest">
                        Cerrado
                      </span>
                    )}
                </div>
                <h4 className="text-xl font-black text-slate-900 tracking-tight">
                  {program.packageName || program.washingName}
                </h4>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleToggleClose(program)}
                  className={`p-2 rounded-xl border transition-all ${program.closed ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' : 'bg-slate-50 text-slate-400 border-slate-100 hover:text-slate-600 hover:bg-slate-100'}`}
                  title={program.closed ? 'Reabrir' : 'Cerrar Programa'}
                >
                  {program.closed ? <Unlock size={18} /> : <Lock size={18} />}
                </button>
                <button onClick={() => handleDelete(program.id!)} className="p-2 rounded-xl bg-slate-50 text-slate-400 border border-slate-100 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100">
                    <Calendar size={14} />
                  </div>
                  <span className="text-xs font-bold">{program.date} <span className="text-slate-300 mx-1">|</span> {program.shift}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100">
                    <UserIcon size={14} />
                  </div>
                  <span className="text-xs font-bold truncate max-w-[120px]">{program.washingOperator}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100">
                    <Truck size={14} />
                  </div>
                  <span className="text-xs font-bold">{program.truck}</span>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Programado</span>
                  <span className="text-sm font-black text-slate-900">{program.programmedQuantity}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Avance Real</span>
                  <span className={`text-sm font-black ${program.status === 'Completo' || program.status === 'Cerrado' ? 'text-emerald-600' : 'text-blue-600'}`}>
                    {program.status === 'Completo' || program.status === 'Cerrado' ? program.programmedQuantity : 
                     program.status === 'No realizado' ? 0 : 
                     program.completedCount || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Progress Area */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Progreso</span>
                <span>{program.status === 'Completo' || program.status === 'Cerrado' ? '100%' : `${Math.round(((program.completedCount || 0) / program.programmedQuantity) * 100)}%`}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div 
                  className={`h-full transition-all duration-700 ease-out ${
                      program.status === 'Completo' || program.status === 'Cerrado' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' :
                      program.status === 'Parcial' ? 'bg-amber-500' :
                      program.status === 'No realizado' ? 'bg-red-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${
                      program.status === 'Completo' || program.status === 'Cerrado' ? 100 : 
                      program.status === 'No realizado' ? 0 :
                      (program.completedCount || 0) / program.programmedQuantity * 100
                  }%` }}
                />
              </div>
            </div>
            
            {program.adminObservation && (
              <div className="mt-6 flex items-start gap-3 rounded-xl bg-slate-50 p-3 border border-slate-100">
                <AlertCircle size={14} className="text-slate-400 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed font-medium text-slate-500">
                  {program.adminObservation}
                </p>
              </div>
            )}
          </div>
        ))}

        {filteredPrograms.length === 0 && (
          <div className="col-span-full py-24 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 text-slate-300 mb-6">
                <ClipboardList size={40} />
            </div>
            <h3 className="text-slate-900 font-black text-xl tracking-tight">Sin resultados</h3>
            <p className="text-slate-500 font-medium text-sm mt-2">No encontramos programas con esos filtros.</p>
          </div>
        )}
      </div>
    </div>
  );
}
