import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { OutOfProgramWashing, ShiftType } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Filter, 
  Calendar, 
  Search, 
  ChevronDown, 
  Trash2,
  AlertOctagon,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Plus,
  X,
  Droplets
} from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';

export default function OutOfProgramList() {
  const { profile } = useAuth();
  const [washings, setWashings] = useState<OutOfProgramWashing[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterShift, setFilterShift] = useState<'all' | 'T39' | 'T44'>('all');
  const [filterTruck, setFilterTruck] = useState<'all' | 'CM95' | 'CM97'>('all');
  const [filterReason, setFilterReason] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Add state for out of program assignment modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    shift: 'T39' as ShiftType,
    truck: 'CM95',
    replacementTruckTag: '',
    areaLocation: '',
    description: '',
    reason: 'Punto caliente',
    customReason: '',
    requestedBy: '',
    detectionTime: format(new Date(), 'HH:mm'),
    quantity: '',
    observation: '',
    status: 'Programado' as 'Programado' | 'Realizado' | 'Pendiente' | 'No realizado',
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.areaLocation.trim() || !formData.description.trim() || !formData.requestedBy.trim()) {
      alert("Por favor, complete los campos Área/Ubicación, Descripción y Solicitado por.");
      return;
    }
    if (formData.truck === 'REEMPLAZO' && !formData.replacementTruckTag.trim()) {
      alert("Por favor ingrese el tag del camión de reemplazo.");
      return;
    }

    try {
      const payload: any = {
        date: formData.date,
        shift: formData.shift,
        truck: formData.truck,
        areaLocation: formData.areaLocation.trim(),
        description: formData.description.trim(),
        reason: formData.reason === 'Otro' ? formData.customReason.trim() : formData.reason,
        requestedBy: formData.requestedBy.trim(),
        detectionTime: formData.detectionTime,
        status: formData.status,
        observation: formData.observation.trim(),
        createdBy: profile?.displayName || 'Administrador',
        operatorEmail: '',
        assignedBy: profile?.displayName || 'Administrador',
        assignedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (formData.truck === 'REEMPLAZO') {
        payload.truckId = 'REEMPLAZO';
        payload.replacementTruckTag = formData.replacementTruckTag.trim().toUpperCase();
        payload.displayTruckName = `${formData.replacementTruckTag.trim().toUpperCase()} (Reemplazo)`;
      }

      if (formData.quantity && formData.quantity.trim() !== '') {
        payload.quantity = Number(formData.quantity);
      }

      await addDoc(collection(db, 'outOfProgramWashings'), payload);

      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        shift: 'T39' as ShiftType,
        truck: 'CM95',
        replacementTruckTag: '',
        areaLocation: '',
        description: '',
        reason: 'Punto caliente',
        customReason: '',
        requestedBy: '',
        detectionTime: format(new Date(), 'HH:mm'),
        quantity: '',
        observation: '',
        status: 'Programado'
      });
      setShowModal(false);
    } catch (error: any) {
      console.error(error);
      alert("Error al guardar: " + error.message);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'outOfProgramWashings'), orderBy('date', 'desc'), orderBy('detectionTime', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWashings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OutOfProgramWashing)));
    });
    return () => unsubscribe();
  }, []);

  const filteredWashings = washings.filter(w => {
    // Search filter
    const matchesSearch = 
      w.areaLocation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.requestedBy || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.createdBy || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.operatorEmail || '').toLowerCase().includes(searchTerm.toLowerCase());

    // Shift filter
    const matchesShift = filterShift === 'all' || w.shift === filterShift;

    // Truck filter
    const matchesTruck = filterTruck === 'all' || w.truck === filterTruck;

    // Reason filter
    const matchesReason = filterReason === 'all' || w.reason === filterReason;

    // Status filter
    const matchesStatus = filterStatus === 'all' || w.status === filterStatus;

    // Date range filter
    let matchesDate = true;
    if (startDate && endDate) {
      try {
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        const itemDate = parseISO(w.date);
        matchesDate = isWithinInterval(itemDate, { start, end });
      } catch (e) {
        console.error("Error parsing dates", e);
      }
    } else if (startDate) {
      matchesDate = w.date >= startDate;
    } else if (endDate) {
      matchesDate = w.date <= endDate;
    }

    return matchesSearch && matchesShift && matchesTruck && matchesReason && matchesStatus && matchesDate;
  });

  // Calculate statistics
  const totalOutOfProgram = filteredWashings.length;
  const totalVolume = filteredWashings.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
  const completedCount = filteredWashings.filter(w => w.status === 'Realizado').length;
  const pendingCount = filteredWashings.filter(w => w.status === 'Pendiente').length;
  const failedCount = filteredWashings.filter(w => w.status === 'No realizado').length;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Eventos</p>
            <p className="text-3xl font-black text-slate-900 mt-2 font-mono">{totalOutOfProgram}</p>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Lavados adicionales</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <AlertOctagon size={24} />
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Volumen Lavado</p>
            <p className="text-3xl font-black text-slate-900 mt-2 font-mono">{totalVolume}</p>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Tramos/Equipos registrados</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <TrendingUp size={24} />
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Eventos Pendientes</p>
            <p className="text-3xl font-black text-slate-900 mt-2 font-mono">{pendingCount}</p>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Esperando acción</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Clock size={24} />
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total No Realizados</p>
            <p className="text-3xl font-black text-rose-600 mt-2 font-mono">{failedCount}</p>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">No viables hoy</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <XCircle size={24} />
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-2 flex items-center gap-2">
          <Filter size={14} /> Filtros de Monitoreo
        </h3>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {/* General Search */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Descripción, sector, supervisor..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-600 outline-hidden transition-all"
              />
            </div>
          </div>

          {/* Date range filters */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-600 outline-hidden transition-all cursor-pointer font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-600 outline-hidden transition-all cursor-pointer font-mono"
            />
          </div>

          {/* Shift filter */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Turno</label>
            <select
              value={filterShift}
              onChange={e => setFilterShift(e.target.value as any)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-600 outline-hidden transition-all"
            >
              <option value="all">Todos</option>
              <option value="T39">T39</option>
              <option value="T44">T44</option>
            </select>
          </div>

          {/* Truck filter */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Camión</label>
            <select
              value={filterTruck}
              onChange={e => setFilterTruck(e.target.value as any)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-600 outline-hidden transition-all"
            >
              <option value="all">Todos</option>
              <option value="CM95">CM95</option>
              <option value="CM97">CM97</option>
              <option value="REEMPLAZO">REEMPLAZO</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 pt-2 border-t border-slate-100">
          {/* Reason filter */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Motivo</label>
            <select
              value={filterReason}
              onChange={e => setFilterReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-600 outline-hidden transition-all"
            >
              <option value="all">Todos los motivos</option>
              <option value="Punto caliente">Punto caliente</option>
              <option value="Emergencia operacional">Emergencia operacional</option>
              <option value="Solicitud de supervisión">Solicitud de supervisión</option>
              <option value="Condición de terreno">Condición de terreno</option>
              <option value="Contaminación puntual">Contaminación puntual</option>
              <option value="Riesgo eléctrico">Riesgo eléctrico</option>
              <option value="Apoyo a otra área">Apoyo a otra área</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Estado</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-600 outline-hidden transition-all"
            >
              <option value="all">Todos los estados</option>
              <option value="Realizado">Realizado</option>
              <option value="Pendiente">Pendiente</option>
              <option value="No realizado">No realizado</option>
            </select>
          </div>

          {/* Clear Filter Button */}
          <div className="md:col-span-3 lg:col-span-3 flex items-end justify-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterShift('all');
                setFilterTruck('all');
                setFilterReason('all');
                setFilterStatus('all');
                setStartDate('');
                setEndDate('');
              }}
              className="px-6 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              Restaurar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Main Elegant Table Card */}
      <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">Consola de Avance Eventual</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Operaciones fuera del programa planificado</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white hover:bg-indigo-700 transition-all font-sans uppercase tracking-wider shadow-sm"
          >
            <Plus size={16} />
            Asignar Lavado Fuera de Programa
          </button>
        </div>

        {filteredWashings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4 border border-slate-100">
              <AlertOctagon className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Sin registros encontrados</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500 max-w-[280px]">No hay lavados fuera de programa que coincidan con sus criterios de búsqueda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="py-4 px-6">Fecha / Hora</th>
                  <th className="py-4 px-6">Turno</th>
                  <th className="py-4 px-6">Camión</th>
                  <th className="py-4 px-6">Sectores / Ubicación</th>
                  <th className="py-4 px-6">Descripción</th>
                  <th className="py-4 px-6">Motivo</th>
                  <th className="py-4 px-6">Solicitado por</th>
                  <th className="py-4 px-6 text-center">Cant.</th>
                  <th className="py-4 px-6">Estado</th>
                  <th className="py-4 px-6">Observación</th>
                  <th className="py-4 px-6">Registrador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredWashings.map((washing) => (
                  <tr key={washing.id} className="hover:bg-slate-50/50 transition-colors font-medium text-slate-700">
                    <td className="py-4 px-6 whitespace-nowrap">
                      <span className="font-bold text-slate-900 font-mono">{washing.date}</span>
                      <span className="block text-[10px] text-slate-400 font-mono font-black">{washing.detectionTime}</span>
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 font-black tracking-widest uppercase text-[10px] border border-blue-100">
                        {washing.shift}
                      </span>
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap font-mono font-bold text-slate-900">
                      {washing.displayTruckName || washing.truck}
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-bold text-slate-900 block max-w-[150px] truncate" title={washing.areaLocation}>
                        {washing.areaLocation}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <p className="max-w-[200px] truncate font-semibold text-slate-600" title={washing.description}>
                        {washing.description}
                      </p>
                    </td>
                    <td className="py-4 px-6">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                        {washing.reason}
                      </span>
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap font-semibold">
                      {washing.requestedBy}
                    </td>
                    <td className="py-4 px-6 text-center whitespace-nowrap font-mono font-bold">
                      {washing.quantity !== undefined ? (
                        <span className="text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                          {washing.quantity}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-normal">ND</span>
                      )}
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                        washing.status === 'Realizado'
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-250'
                          : washing.status === 'Pendiente'
                          ? 'bg-amber-100 text-amber-700 border border-amber-250'
                          : 'bg-rose-100 text-rose-700 border border-rose-250 animate-pulse'
                      }`}>
                        {washing.status}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <p className="max-w-[160px] truncate text-slate-500 font-semibold italic" title={washing.observation}>
                        {washing.observation ? `"${washing.observation}"` : '-'}
                      </p>
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap text-slate-400">
                      <span className="font-bold block text-slate-600 text-[10px]" title={washing.operatorEmail}>
                        {washing.createdBy || 'Sistema'}
                      </span>
                      <span className="text-[9px] font-mono tracking-tight block">
                        {washing.operatorEmail ? washing.operatorEmail.split('@')[0] : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs overflow-y-auto flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <span className="text-[9px] font-black text-indigo-700 uppercase tracking-widest border border-indigo-100 bg-indigo-50 px-2.5 py-1 rounded-full inline-block mb-1.5">
                  Operación Extraordinaria
                </span>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Asignar Lavado Fuera de Programa</h3>
              </div>
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-10 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fecha</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all cursor-pointer font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hora de Solicitud/Detección</label>
                  <input
                    type="time"
                    required
                    value={formData.detectionTime}
                    onChange={e => setFormData({ ...formData, detectionTime: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all cursor-pointer font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Turno</label>
                  <select
                    value={formData.shift}
                    onChange={e => setFormData({ ...formData, shift: e.target.value as ShiftType })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all cursor-pointer"
                  >
                    <option value="T39">T39</option>
                    <option value="T44">T44</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Camión</label>
                  <select
                    value={formData.truck}
                    onChange={e => setFormData({ ...formData, truck: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all cursor-pointer font-mono font-bold text-indigo-600"
                  >
                    <option value="CM95">CM95</option>
                    <option value="CM97">CM97</option>
                    <option value="REEMPLAZO">REEMPLAZO</option>
                  </select>
                </div>
              </div>

              {formData.truck === 'REEMPLAZO' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block">Tag del camión de reemplazo *</label>
                  <input
                    type="text"
                    required
                    value={formData.replacementTruckTag}
                    onChange={e => setFormData({ ...formData, replacementTruckTag: e.target.value.toUpperCase() })}
                    placeholder="Ej. CM102, ALJIBE-07"
                    className="w-full bg-slate-50 border border-amber-300 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-amber-500 outline-hidden transition-all uppercase font-mono"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Área o Ubicación</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Patio de Transformadores, Línea 110kV"
                  value={formData.areaLocation}
                  onChange={e => setFormData({ ...formData, areaLocation: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Descripción del Trabajo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Lavado extraordinario por polvo acumulado"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Motivo</label>
                  <select
                    value={formData.reason}
                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all cursor-pointer"
                  >
                    <option value="Punto caliente">Punto caliente</option>
                    <option value="Emergencia operacional">Emergencia operacional</option>
                    <option value="Solicitud de supervisión">Solicitud de supervisión</option>
                    <option value="Condición de terreno">Condición de terreno</option>
                    <option value="Contaminación puntual">Contaminación puntual</option>
                    <option value="Riesgo eléctrico">Riesgo eléctrico</option>
                    <option value="Apoyo a otra área">Apoyo a otra área</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Solicitado Por</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Supervisor de Turno DDEE"
                    value={formData.requestedBy}
                    onChange={e => setFormData({ ...formData, requestedBy: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all"
                  />
                </div>
              </div>

              {formData.reason === 'Otro' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Especificar Motivo (Detalle)</label>
                  <input
                    type="text"
                    required
                    placeholder="Escriba el motivo detallado..."
                    value={formData.customReason}
                    onChange={e => setFormData({ ...formData, customReason: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cantidad (Si aplica)</label>
                  <input
                    type="number"
                    placeholder="Escriba cantidad..."
                    value={formData.quantity}
                    onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Estado Inicial</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all cursor-pointer text-indigo-600 font-bold"
                  >
                    <option value="Programado">Programado</option>
                    <option value="Realizado">Realizado</option>
                    <option value="Pendiente">Pendiente</option>
                    <option value="No realizado">No realizado</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Observación</label>
                <textarea
                  placeholder="Instrucciones adicionales o anotaciones..."
                  value={formData.observation}
                  onChange={e => setFormData({ ...formData, observation: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all h-20 resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-100 border border-slate-200 text-slate-500 font-bold uppercase tracking-wider py-3.5 rounded-xl text-xs hover:bg-slate-200 transition-all font-sans"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 border border-indigo-700 text-white font-black uppercase tracking-widest py-3.5 rounded-xl text-xs hover:bg-indigo-750 shadow-md shadow-indigo-100 transition-all font-sans"
                >
                  Asignar Lavado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
