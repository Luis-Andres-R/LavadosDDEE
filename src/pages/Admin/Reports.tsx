import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { WashingProgram, OperationalReading, TruckOperatingHours, TruckStatusHistory, OutOfProgramWashing } from '../../types';
import { FileDown, FileSpreadsheet, Loader2, Calendar, Search, Filter, Home, AlertOctagon, Truck, Clock, AlertTriangle, BookOpen } from 'lucide-react';
import { generatePDFReport } from '../../utils/pdfGenerator';
import { exportToExcel } from '../../utils/excelExporter';
import { format, startOfWeek, endOfWeek, startOfMonth, startOfYear } from 'date-fns';

export default function Reports({ onHome }: { onHome?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    shift: 'Todos',
    line: 'Todos',
    type: 'Todos',
    status: 'Todos'
  });

  const [outOfProgramRecords, setOutOfProgramRecords] = useState<OutOfProgramWashing[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'outOfProgramWashings'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OutOfProgramWashing));
      
      // Filter by date range
      data = data.filter(w => w.date >= filters.startDate && w.date <= filters.endDate);
      
      // Filter by shift
      if (filters.shift !== 'Todos') {
        data = data.filter(w => w.shift === filters.shift);
      }
      
      setOutOfProgramRecords(data);
    }, (err) => console.error(err));
    return () => unsubscribe();
  }, [filters.startDate, filters.endDate, filters.shift]);

  const handleDownloadPDF = async (type: 'diario' | 'rango') => {
    setLoading(true);
    try {
      let start = filters.startDate;
      let end = filters.endDate;

      if (type === 'diario') { 
        end = start; 
      }

      const { programs, readings, opHours, statusHistory, outOfPrograms } = await fetchData(start, end);
      
      if (programs.length === 0 && opHours.length === 0 && statusHistory.length === 0 && outOfPrograms.length === 0) {
        alert("No existen registros para generar el reporte en el rango de fechas seleccionado.");
        return;
      }

      // Save to session storage and open new tab
      const reportData = {
        programs,
        readings,
        opHours,
        statusHistory,
        outOfPrograms,
        type,
        range: { start, end },
        selectedShift: filters.shift
      };
      
      sessionStorage.setItem('currentReportData', JSON.stringify(reportData));
      
      const url = new URL(window.location.origin + window.location.pathname);
      url.searchParams.set('view', 'report');
      window.open(url.toString(), '_blank');
      
    } catch (error) {
      console.error(error);
      alert("No fue posible generar el reporte. Revise la conexión o los datos seleccionados.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    setLoading(true);
    try {
      const { programs, readings, opHours } = await fetchData(filters.startDate, filters.endDate);
      exportToExcel(programs, `reporte_lavados_${filters.startDate}_a_${filters.endDate}`, readings, opHours);
    } catch (error) {
        console.error(error);
        alert("Error al exportar.");
    } finally {
        setLoading(false);
    }
  };

  const fetchData = async (start: string, end: string) => {
    const qPrograms = query(
      collection(db, 'washingPrograms'),
      where('date', '>=', start),
      where('date', '<=', end),
      orderBy('date', 'asc')
    );

    const qReadings = query(
        collection(db, 'operationalReadings'),
        where('date', '>=', start),
        where('date', '<=', end),
        orderBy('date', 'asc')
    );

    const qOpHours = query(
      collection(db, 'truckOperatingHours'),
      where('date', '>=', start),
      where('date', '<=', end),
      orderBy('date', 'asc')
    );

    const qStatusHistory = query(
      collection(db, 'truckStatusHistory'),
      where('date', '>=', start),
      where('date', '<=', end),
      orderBy('date', 'asc')
    );

    const qOutOfProg = query(
      collection(db, 'outOfProgramWashings'),
      where('date', '>=', start),
      where('date', '<=', end)
    );

    const [snapPrograms, snapReadings, snapOpHours, snapStatusHistory, snapOutOfProg] = await Promise.all([
        getDocs(qPrograms),
        getDocs(qReadings),
        getDocs(qOpHours),
        getDocs(qStatusHistory),
        getDocs(qOutOfProg)
    ]);

    let programs = snapPrograms.docs.map(doc => ({ id: doc.id, ...doc.data() } as WashingProgram));
    let readings = snapReadings.docs.map(doc => ({ id: doc.id, ...doc.data() } as OperationalReading));
    let opHours = snapOpHours.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckOperatingHours));
    let statusHistory = snapStatusHistory.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckStatusHistory));
    let outOfPrograms = snapOutOfProg.docs.map(doc => ({ id: doc.id, ...doc.data() } as OutOfProgramWashing));

    outOfPrograms.sort((a, b) => a.date.localeCompare(b.date));

    // Client side remaining filters
    if (filters.shift !== 'Todos') {
        programs = programs.filter(p => p.shift === filters.shift);
        readings = readings.filter(r => r.shift === filters.shift);
        opHours = opHours.filter(h => h.shift === filters.shift);
        statusHistory = statusHistory.filter(s => s.shift === filters.shift);
        outOfPrograms = outOfPrograms.filter(o => o.shift === filters.shift);
    }
    
    if (filters.line !== 'Todos') programs = programs.filter(p => p.line === filters.line);
    if (filters.type !== 'Todos') programs = programs.filter(p => p.type === filters.type);
    if (filters.status !== 'Todos') programs = programs.filter(p => p.status === filters.status);

    return { programs, readings, opHours, statusHistory, outOfPrograms };
  };

  return (
    <div className="space-y-10">
      <div className="flex justify-end mb-4">
        <button
          onClick={onHome}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all shadow-sm active:scale-95 border border-slate-200"
        >
          <Home size={16} />
          Inicio
        </button>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
            <Filter size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Parametrización de Datos</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Definir rango y criterios de búsqueda</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Fecha de Inicio</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              <input 
                type="date" 
                value={filters.startDate}
                onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all font-mono"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Fecha de Término</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              <input 
                type="date" 
                value={filters.endDate}
                onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all font-mono"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Turno Laboral</label>
            <select 
              value={filters.shift}
              onChange={e => setFilters(f => ({ ...f, shift: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
            >
              <option value="Todos">Todos los Turnos</option>
              <option value="T39">T39</option>
              <option value="T44">T44</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Línea de Operación</label>
            <select 
              value={filters.line}
              onChange={e => setFilters(f => ({ ...f, line: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
            >
              <option value="Todos">Todas las Líneas</option>
              <option value="110 kV">110 kV</option>
              <option value="33 kV">33 kV</option>
              <option value="23 kV">23 kV</option>
              <option value="6,6 kV">6,6 kV</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Estado del Programa</label>
            <select 
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
            >
              <option value="Todos">Todos los Estados</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Completo">Completado</option>
              <option value="Parcial">Avance Parcial</option>
              <option value="No realizado">Sin Actividad</option>
              <option value="Cerrado">Histórico Cerrado</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        {/* PDF Reports */}
        <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-bl-full flex items-center justify-center">
            <FileDown size={32} className="text-blue-100 mt-[-10px] mr-[-10px]" />
          </div>
          
          <h3 className="text-xl font-black text-slate-900 tracking-tight mb-2">Generación Oficial PDF</h3>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8 border-l-4 border-blue-600 pl-4">Documentación Operativa</p>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReportButton label="Reporte Diario" onClick={() => handleDownloadPDF('diario')} icon={<FileDown size={18} />} disabled={loading} color="blue" />
            <ReportButton label="Reporte por Rango" onClick={() => handleDownloadPDF('rango')} icon={<FileDown size={18} />} disabled={loading} color="indigo" />
          </div>
        </div>

        {/* Data Export */}
        <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/50 rounded-bl-full flex items-center justify-center">
            <FileSpreadsheet size={32} className="text-emerald-100 mt-[-10px] mr-[-10px]" />
          </div>
          
          <h3 className="text-xl font-black text-slate-900 tracking-tight mb-2">Analítica en Excel</h3>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8 border-l-4 border-emerald-600 pl-4">Exportación para BI</p>
          
          <p className="mb-8 text-sm font-medium text-slate-500 leading-relaxed">Descargue el dataset procesado en formato estándar para su integración con PowerBI o análisis avanzado.</p>
          
          <button 
            onClick={handleExportExcel}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-4 text-sm font-black text-white shadow-xl shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all lg:hover:translate-y-[-2px]"
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <FileSpreadsheet size={20} />}
            DEX: Exportar Sábana de Datos
          </button>
        </div>
      </div>

      {/* Out of Program Reports Section */}
      <div className="rounded-[2.5rem] border border-slate-200 bg-white p-10 shadow-sm relative overflow-hidden space-y-8">
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-bl-full flex items-center justify-center">
          <AlertOctagon size={32} className="text-indigo-100 mt-[-10px] mr-[-10px]" />
        </div>

        <div>
          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-100 bg-indigo-50 px-3 py-1 rounded-full inline-block mb-3">
            Módulo de Control Extraordinario
          </span>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Lavados Fuera de Programa</h3>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            Análisis de cumplimiento y contingencias fuera de agenda
          </p>
        </div>

        {/* Big Totalizers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-150">
          <div className="text-center md:text-left">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Registros Capturados</span>
            <span className="text-3xl font-black text-indigo-600 font-mono block mt-1">{outOfProgramRecords.length} Eventos</span>
            <span className="text-[10px] font-bold text-slate-400 block mt-1">Registrados en terreno por los operadores</span>
          </div>
          <div className="text-center md:text-left border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Totalizador de Volumen / Cantidad</span>
            <span className="text-3xl font-black text-slate-800 font-mono block mt-1">
              {outOfProgramRecords.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0)} Tramos
            </span>
            <span className="text-[10px] font-bold text-slate-400 block mt-1">No interfieren en la adherencia del programa de lavado oficial</span>
          </div>
        </div>

        {outOfProgramRecords.length === 0 ? (
          <div className="text-center py-10 bg-slate-50/30 rounded-3xl border border-dashed border-slate-200">
            <span className="text-xs font-bold text-slate-400">No se detectaron registros para el rango de fechas seleccionado.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Breakdown by Truck */}
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-[0.15em] text-slate-400 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Truck size={14} className="text-slate-400" /> Por Camión Alocado
              </h4>
              <div className="space-y-2 font-mono text-xs">
                {Object.entries(
                  outOfProgramRecords.reduce((acc, curr) => {
                    const t = curr.truck || 'Otros';
                    acc[t] = (acc[t] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([truck, count]) => (
                  <div key={truck} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="font-bold text-slate-700">{truck}</span>
                    <span className="font-black bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 text-indigo-600">
                      {count} {count === 1 ? 'evento' : 'eventos'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Breakdown by Shift */}
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-[0.15em] text-slate-400 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Clock size={14} className="text-slate-400" /> Por Turno Asignado
              </h4>
              <div className="space-y-2 font-mono text-xs">
                {Object.entries(
                  outOfProgramRecords.reduce((acc, curr) => {
                    const s = curr.shift || 'Otros';
                    acc[s] = (acc[s] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([shift, count]) => (
                  <div key={shift} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="font-bold text-slate-700">{shift}</span>
                    <span className="font-black bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 text-indigo-600">
                      {count} {count === 1 ? 'evento' : 'eventos'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Breakdown by Reason */}
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-[0.15em] text-slate-400 flex items-center gap-2 border-b border-slate-100 pb-2">
                <AlertTriangle size={14} className="text-slate-400" /> Por Motivos Gatillantes
              </h4>
              <div className="space-y-2 text-xs max-h-[180px] overflow-y-auto pr-1">
                {Object.entries(
                  outOfProgramRecords.reduce((acc, curr) => {
                    const r = curr.reason || 'Otro';
                    acc[r] = (acc[r] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([reason, count]) => (
                  <div key={reason} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="font-semibold text-slate-600 truncate max-w-[124px]" title={reason}>{reason}</span>
                    <span className="font-black bg-white px-2 py-0.5 rounded-md border border-slate-200 text-indigo-500 font-mono text-[10px]">
                      {count} ev.
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Breakdown by Status */}
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-[0.15em] text-slate-400 flex items-center gap-2 border-b border-slate-100 pb-2">
                <BookOpen size={14} className="text-slate-400" /> Por Estado de Ejecución
              </h4>
              <div className="space-y-2 text-xs">
                {Object.entries(
                  outOfProgramRecords.reduce((acc, curr) => {
                    const st = curr.status || 'Realizado';
                    acc[st] = (acc[st] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([status, count]) => (
                  <div key={status} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="font-semibold text-slate-600">{status}</span>
                    <span className={`font-black px-2 py-0.5 rounded-md text-[10px] font-mono ${
                      status === 'Realizado' ? 'bg-emerald-50 text-emerald-600 border border-emerald-250' :
                      status === 'Pendiente' ? 'bg-amber-50 text-amber-600 border border-amber-250' :
                      'bg-red-50 text-red-600 border border-red-250'
                    }`}>
                      {count} ev.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Observations Feed */}
        {outOfProgramRecords.filter(w => w.observation && w.observation.trim()).length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">
              Observaciones de Terreno Recientes
            </h4>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2">
              {outOfProgramRecords
                .filter(w => w.observation && w.observation.trim())
                .slice(0, 10)
                .map((washing, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between gap-2.5">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">
                        {washing.date} &bull; {washing.truck} ({washing.shift}) &bull; {washing.areaLocation}
                      </span>
                      <p className="text-xs font-bold text-slate-700 italic">
                        "{washing.observation}"
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="block text-[10px] text-indigo-600 font-bold uppercase tracking-wider">
                        {washing.reason}
                      </span>
                      <span className="block text-[9px] text-slate-400 mt-1">
                        Por {washing.createdBy || 'Operador'}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportButton({ label, onClick, icon, disabled, color }: { label: string, onClick: () => void, icon: any, disabled: boolean, color: string }) {
    const colors: Record<string, string> = {
        blue: 'bg-slate-50 text-slate-900 hover:bg-blue-600 hover:text-white border border-slate-100 hover:border-blue-600 shadow-sm',
        indigo: 'bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-200',
    };

    return (
        <button 
            onClick={onClick}
            disabled={disabled}
            className={`flex items-center justify-center gap-2 rounded-2xl py-4 text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 ${colors[color]} disabled:opacity-50`}
        >
            {icon}
            {label}
        </button>
    );
}
