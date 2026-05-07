import React, { useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { WashingProgram, OperationalReading, TruckOperatingHours, TruckStatusHistory } from '../../types';
import { FileDown, FileSpreadsheet, Loader2, Calendar, Search, Filter, Home } from 'lucide-react';
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

  const handleDownloadPDF = async (type: 'diario' | 'ciclo' | 'mensual' | 'anual' | 'personalizado') => {
    setLoading(true);
    try {
      let start = filters.startDate;
      let end = filters.endDate;

      if (type === 'diario') { end = start; }
      else if (type === 'mensual') {
          const d = new Date(start);
          start = format(startOfMonth(d), 'yyyy-MM-dd');
          end = format(new Date(d.getFullYear(), d.getMonth() + 1, 0), 'yyyy-MM-dd');
      } else if (type === 'anual') {
          const d = new Date(start);
          start = format(startOfYear(d), 'yyyy-MM-dd');
          end = format(new Date(d.getFullYear(), 11, 31), 'yyyy-MM-dd');
      }

      const { programs, readings, opHours, statusHistory } = await fetchData(start, end);
      
      if (programs.length === 0 && opHours.length === 0 && statusHistory.length === 0) {
        alert("No existen registros para generar el reporte en el rango seleccionado.");
        return;
      }

      // Save to session storage and open new tab
      const reportData = {
        programs,
        readings,
        opHours,
        statusHistory,
        type,
        range: { start, end }
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

    const [snapPrograms, snapReadings, snapOpHours, snapStatusHistory] = await Promise.all([
        getDocs(qPrograms),
        getDocs(qReadings),
        getDocs(qOpHours),
        getDocs(qStatusHistory)
    ]);

    let programs = snapPrograms.docs.map(doc => ({ id: doc.id, ...doc.data() } as WashingProgram));
    let readings = snapReadings.docs.map(doc => ({ id: doc.id, ...doc.data() } as OperationalReading));
    let opHours = snapOpHours.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckOperatingHours));
    let statusHistory = snapStatusHistory.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckStatusHistory));

    // Client side remaining filters
    if (filters.shift !== 'Todos') {
        programs = programs.filter(p => p.shift === filters.shift);
        readings = readings.filter(r => r.shift === filters.shift);
        opHours = opHours.filter(h => h.shift === filters.shift);
        statusHistory = statusHistory.filter(s => s.shift === filters.shift);
    }
    
    if (filters.line !== 'Todos') programs = programs.filter(p => p.line === filters.line);
    if (filters.type !== 'Todos') programs = programs.filter(p => p.type === filters.type);
    if (filters.status !== 'Todos') programs = programs.filter(p => p.status === filters.status);

    return { programs, readings, opHours, statusHistory };
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
            <ReportButton label="Resumen de Ciclo" onClick={() => handleDownloadPDF('ciclo')} icon={<FileDown size={18} />} disabled={loading} color="blue" />
            <ReportButton label="Cierre Mensual" onClick={() => handleDownloadPDF('mensual')} icon={<FileDown size={18} />} disabled={loading} color="blue" />
            <ReportButton label="Rango Especial" onClick={() => handleDownloadPDF('personalizado')} icon={<FileDown size={18} />} disabled={loading} color="indigo" />
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
