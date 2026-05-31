import React, { useEffect, useState } from 'react';
import { WashingProgram, OperationalReading, TruckOperatingHours, TruckStatusHistory, INITIAL_TRUCKS, OutOfProgramWashing } from '../../types';
import { format } from 'date-fns';
import { generatePDFReport } from '../../utils/pdfGenerator';
import { FileDown, Printer, X, CheckCircle2, AlertCircle, Clock, Thermometer, Truck, Loader2, AlertTriangle, PlayCircle } from 'lucide-react';

interface ReportData {
  programs: WashingProgram[];
  readings: OperationalReading[];
  opHours: TruckOperatingHours[];
  statusHistory: TruckStatusHistory[];
  outOfPrograms?: OutOfProgramWashing[];
  type: string;
  range: { start: string, end: string };
  selectedShift?: string;
}

export default function ReportView() {
  const [data, setData] = useState<ReportData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const rawData = sessionStorage.getItem('currentReportData');
    if (rawData) {
      setData(JSON.parse(rawData));
    }
  }, []);

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Clock className="mx-auto h-12 w-12 animate-spin text-blue-500 mb-4" />
          <p className="text-slate-600 font-bold">Cargando reporte...</p>
        </div>
      </div>
    );
  }

  const { programs, readings, opHours, statusHistory, outOfPrograms = [], type, range, selectedShift = 'Todos' } = data;

  // Helper to calculate structures/equipments for a WashingProgram based on checklist/cantidad
  const getProgramStructures = (p: WashingProgram) => {
    const isChecklist = p.controlType === 'checklist' || (p.items && p.items.length > 0);
    let programmed = 0;
    let completed = 0;

    if (isChecklist) {
      programmed = p.items?.length || p.programmedQuantity || 0;
      if (p.status === 'Completo' || p.status === 'Cerrado') {
        completed = programmed;
      } else if (p.status === 'No realizado') {
        completed = 0;
      } else {
        completed = p.items?.filter(item => item.done).length ?? p.completedCount ?? 0;
      }
    } else {
      programmed = p.programmedQuantity || 0;
      if (p.status === 'Completo' || p.status === 'Cerrado') {
        completed = programmed;
      } else if (p.status === 'No realizado') {
        completed = 0;
      } else {
        completed = p.completedCount ?? 0;
      }
    }

    completed = Math.max(0, Math.min(programmed, completed));
    const pending = Math.max(0, programmed - completed);

    return { programmed, completed, pending };
  };

  // Official Program calculations (Structures/equipments bases)
  let totalEstructurasProgramadas = 0;
  let totalEstructurasRealizadas = 0;
  let totalEstructurasPendientes = 0;

  programs.forEach(p => {
    const { programmed, completed, pending } = getProgramStructures(p);
    totalEstructurasProgramadas += programmed;
    totalEstructurasRealizadas += completed;
    totalEstructurasPendientes += pending;
  });

  const percentageCumplimiento = totalEstructurasProgramadas > 0 
    ? ((totalEstructurasRealizadas / totalEstructurasProgramadas) * 100).toFixed(1) 
    : "0.0";

  // Out of program stats
  const oopStats = {
    totalRecords: outOfPrograms.length,
    totalQuantity: outOfPrograms.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0),
    completed: outOfPrograms.filter(w => w.status === 'Realizado').length,
    pending: outOfPrograms.filter(w => w.status === 'Pendiente' || w.status === 'Programado').length,
    failed: outOfPrograms.filter(w => w.status === 'No realizado').length,
  };

  // Grouped operational hours specifically for CM95, CM97, CM10, CM49. CM58 excluded.
  const getOpHoursSummary = () => {
    const summary: Record<string, { expected: number, operational: number, deducted: number, reasons: string[] }> = {};
    const validTrucks = ['CM95', 'CM97', 'CM10', 'CM49'];
    
    validTrucks.forEach(truck => {
      summary[truck] = { expected: 0, operational: 0, deducted: 0, reasons: [] };
    });

    // Extract all unique dates evaluated in the report range from any records
    const uniqueDates = new Set<string>();
    programs.forEach(p => uniqueDates.add(p.date));
    statusHistory.forEach(h => uniqueDates.add(h.date));
    opHours.forEach(o => uniqueDates.add(o.date));

    if (uniqueDates.size === 0) {
      uniqueDates.add(range.start);
    }

    // "El lavado solo se realiza en turno día. No existe operación nocturna de lavado."
    // Only check shift 'T39' (Day Shift). 12 Operational hours base.
    const shift = 'T39';

    uniqueDates.forEach(date => {
      validTrucks.forEach(truck => {
        summary[truck].expected += 12; // Base 12 hours for day shift

        // Check if status is "En servicio" during this day's shift
        const statusRecord = statusHistory.find(h => h.date === date && h.shift === shift);
        const truckStatus = statusRecord?.trucks.find(t => t.code === truck)?.status;

        if (truckStatus === 'En servicio') {
          // If "En servicio", check if there's an active failure during day shift 'T39'
          const failure = opHours.find(h => h.date === date && h.shift === shift && h.truck === truck);
          
          if (failure) {
            summary[truck].operational += failure.operationalHours;
            summary[truck].deducted += failure.deductedHours;
            if (failure.reason && !summary[truck].reasons.includes(failure.reason)) {
              summary[truck].reasons.push(failure.reason);
            }
          } else {
            summary[truck].operational += 12;
          }
        } else {
          // Not "En servicio" (e.g., 'Disponible', 'Fuera de servicio' or No registered status)
          // Suma: 0 horas operativas, 12 horas descontadas
          summary[truck].deducted += 12;
          
          const label = truckStatus ? `Estado: ${truckStatus}` : 'Sin registro de estado';
          if (!summary[truck].reasons.includes(label)) {
            summary[truck].reasons.push(label);
          }
        }
      });
    });

    return Object.entries(summary).map(([truck, s]) => ({
      truck,
      ...s,
      availability: s.expected > 0 ? (s.operational / s.expected) * 100 : 100
    })).sort((a, b) => a.truck.localeCompare(b.truck));
  };

  // Status Summary
  const getStatusSummary = () => {
    const summary: Record<string, Record<string, number>> = {};
    const validTrucks = ['CM95', 'CM97', 'CM10', 'CM49'];
    validTrucks.forEach(code => {
      summary[code] = { 'En servicio': 0, 'Disponible': 0, 'Fuera de servicio': 0 };
    });

    statusHistory.forEach(h => {
      h.trucks.forEach(t => {
        if (summary[t.code]) {
          summary[t.code][t.status] = (summary[t.code][t.status] || 0) + 1;
        }
      });
    });

    return Object.entries(summary).map(([code, counts]) => ({
      code,
      ...counts
    }));
  };

  const getStatusDisplay = (s: string) => {
    switch (s) {
      case 'En servicio': return { text: 'SERV', icon: '✅', color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' };
      case 'Disponible': return { text: 'DIPS', icon: '🟠', color: 'bg-amber-50 text-amber-700', border: 'border-amber-200' };
      case 'Fuera de servicio': return { text: 'F/S', icon: '❌', color: 'bg-red-50 text-red-700', border: 'border-red-200' };
      default: return { text: '-', icon: '', color: 'bg-slate-50 text-slate-400', border: 'border-slate-100' };
    }
  };

  const truckSummary = getOpHoursSummary();
  const statusTableSummary = getStatusSummary();

  const handlePrint = () => window.print();

  const handleDownloadPDF = async () => {
    if (!data) return;
    setIsGenerating(true);
    try {
      await generatePDFReport(
        data.programs,
        data.type,
        data.range,
        data.readings,
        data.opHours,
        data.statusHistory
      );
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error al generar el PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-8 max-w-5xl mx-auto print:p-0 print:bg-white">
      {/* Action Bar - Hidden on print */}
      <div className="fixed bottom-8 right-8 flex gap-3 print:hidden z-50">
        <button 
          onClick={handleDownloadPDF} 
          disabled={isGenerating}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold shadow-2xl hover:bg-blue-700 transition-all disabled:opacity-50"
        >
          {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <FileDown size={20} />}
          {isGenerating ? 'Generando...' : 'Descargar PDF'}
        </button>
        <button onClick={handlePrint} className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold shadow-2xl hover:bg-slate-800 transition-all">
          <Printer size={20} />
          Imprimir
        </button>
        <button onClick={() => window.close()} className="flex items-center gap-2 bg-white text-slate-500 border border-slate-200 px-6 py-3 rounded-2xl font-bold shadow-sm hover:bg-slate-50 transition-all">
          <X size={20} />
          Cerrar
        </button>
      </div>

      <div id="report-content" className="bg-white p-12 rounded-[2.5rem] border border-slate-200 shadow-xl print:border-none print:shadow-none print:p-0">

        {/* Brand Header */}
        <div className="flex border-b-4 border-blue-600 pb-6 mb-8 items-end justify-between">
          <div>
            <span className="text-[10px] bg-blue-50 text-blue-700 font-extrabold px-3 py-1 rounded-full uppercase tracking-widest border border-blue-100">
              SQM - Sistema de Gestión de Activos
            </span>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter mt-2">PROGRAMA DE LAVADOS SQM</h1>
            <p className="text-slate-500 text-xs font-bold font-mono">Control de Lavados DDEE</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Generado el</p>
            <p className="text-sm font-bold text-slate-700 mt-1">{format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
          </div>
        </div>

        {/* Report Meta Info */}
        <div className="grid grid-cols-3 gap-6 mb-10 bg-slate-50 p-6 rounded-3xl border border-slate-100">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Tipo de Reporte</p>
            <p className="text-base font-black text-slate-900 capitalize">Reporte {type === 'diario' ? 'Diario' : type === 'turno' ? 'del Turno' : 'Mensual'}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Turno Evaluado</p>
            <p className="text-base font-black text-slate-900">{selectedShift === 'Todos' ? 'Todos los Turnos (T39/T44)' : `Turno ${selectedShift}`}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Periodo Evaluado</p>
            <p className="text-base font-black text-slate-900 font-mono">{range.start} al {range.end}</p>
          </div>
        </div>

        {/* SECTION 1: CUMPLIMIENTO PROGRAMA OFICIAL */}
        <section className="mb-14">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
            <CheckCircle2 className="text-blue-600 shrink-0" size={22} />
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">1. Cumplimiento del Programa Oficial</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Métricas calculadas exclusivamente sobre la programación oficial planificada</p>
            </div>
          </div>

          {/* Compliance Stats cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="border border-slate-150 p-4 rounded-2xl bg-slate-50/50">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Total Estructuras Programadas</p>
              <p className="text-2xl font-black text-slate-900">{totalEstructurasProgramadas}</p>
            </div>
            <div className="border border-emerald-100 p-4 rounded-2xl bg-emerald-50/20">
              <p className="text-[9px] font-black text-emerald-500 uppercase mb-0.5">Porcentaje Cumplimiento</p>
              <p className="text-2xl font-black text-emerald-600">{percentageCumplimiento}%</p>
            </div>
            <div className="border border-amber-100 p-4 rounded-2xl bg-amber-50/20">
              <p className="text-[9px] font-black text-amber-500 uppercase mb-0.5">Estructuras Realizadas</p>
              <p className="text-2xl font-black text-amber-600">{totalEstructurasRealizadas}</p>
            </div>
            <div className="border border-blue-100 p-4 rounded-2xl bg-blue-50/20">
              <p className="text-[9px] font-black text-blue-500 uppercase mb-0.5">Estructuras Pendientes</p>
              <p className="text-2xl font-black text-blue-600">{totalEstructurasPendientes}</p>
            </div>
          </div>

          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-3 text-left border border-slate-800">Fecha</th>
                <th className="p-3 text-left border border-slate-800">Línea</th>
                <th className="p-3 text-left border border-slate-800">Tramo / Equipamiento del Programa</th>
                <th className="p-3 text-center border border-slate-800">Asig.</th>
                <th className="p-3 text-center border border-slate-800">Real.</th>
                <th className="p-3 text-left border border-slate-800">Estado</th>
                <th className="p-3 text-left border border-slate-800">Operador / Camión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {programs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">No se registraron lavados del programa oficial para el período evaluado.</td>
                </tr>
              ) : (
                programs.map((p, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                    <td className="p-3 border border-slate-100 font-mono font-bold text-slate-600">{p.date}</td>
                    <td className="p-3 border border-slate-100 font-black text-slate-700">{p.line}</td>
                    <td className="p-3 border border-slate-100 font-semibold">{p.washingName}</td>
                    <td className="p-3 border border-slate-100 text-center font-bold text-slate-400">{p.programmedQuantity}</td>
                    <td className="p-3 border border-slate-100 text-center font-black text-slate-900">{p.status === 'Completo' ? p.programmedQuantity : (p.completedCount || 0)}</td>
                    <td className="p-3 border border-slate-100">
                      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide inline-block ${
                        p.status === 'Completo' ? 'bg-emerald-50 text-emerald-600' : 
                        p.status === 'Parcial' ? 'bg-amber-50 text-amber-500' : 
                        p.status === 'Pendiente' ? 'bg-blue-50 text-blue-500' : 'bg-red-50 text-red-500'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 border border-slate-100 text-slate-600">
                      <p className="font-semibold text-slate-800">{p.washingOperator || '-'}</p>
                      <p className="text-[9px] font-extrabold text-indigo-600 uppercase font-mono">{p.truck || 'S/I'}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* SECTION 2: ACTIVIDADES PENDIENTES */}
        <section className="mb-14">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
            <AlertTriangle className="text-rose-500 shrink-0" size={22} />
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">2. Detalle de Actividades Pendientes</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tareas que no fueron completadas ni reportadas en su totalidad</p>
            </div>
          </div>

          <table className="w-full text-[11px] border-collapse bg-white border border-slate-150">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-3 text-left border-r border-slate-200">Fecha</th>
                <th className="p-3 text-left border-r border-slate-200">Línea</th>
                <th className="p-3 text-left border-r border-slate-200">Tramo / Nombre</th>
                <th className="p-3 text-center border-r border-slate-200">Prog.</th>
                <th className="p-3 text-center border-r border-slate-200">Avance</th>
                <th className="p-3 text-left">Motivo / Operador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {programs.filter(p => p.status === 'Pendiente' || p.status === 'Parcial').length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 italic">No existen actividades pendientes en el periodo actual. ¡100% de ejecución!</td>
                </tr>
              ) : (
                programs.filter(p => p.status === 'Pendiente' || p.status === 'Parcial').map((p, index) => (
                  <tr key={index} className="hover:bg-slate-50/50">
                    <td className="p-3 border-r border-slate-100 text-slate-600 font-mono">{p.date}</td>
                    <td className="p-3 border-r border-slate-100 font-bold text-amber-600">{p.line}</td>
                    <td className="p-3 border-r border-slate-100">{p.washingName}</td>
                    <td className="p-3 border-r border-slate-100 text-center font-bold text-slate-400">{p.programmedQuantity}</td>
                    <td className="p-3 border-r border-slate-100 text-center font-black text-amber-600">{p.completedCount || 0} de {p.programmedQuantity}</td>
                    <td className="p-3 text-slate-600">
                      <p className="font-semibold">{p.washingOperator || 'Sin operador asignado'}</p>
                      <p className="text-[10px] text-slate-400 italic">"Pospuesto a falta de condiciones o tiempo"</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* SECTION 3: LAVADOS FUERA DE PROGRAMA */}
        <section className="mb-14">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
            <PlayCircle className="text-indigo-600 shrink-0" size={22} />
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">3. Trabajos Fuera de Programa Registrados</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lavados eventuales realizados por contingencias que NO restan adherencia al programa planificado</p>
            </div>
          </div>

          {/* OOP Stats Row */}
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="border border-indigo-150 p-4 rounded-2xl bg-indigo-50/10 text-center">
              <p className="text-[9px] font-black text-indigo-400 uppercase">Eventos Totales</p>
              <p className="text-2xl font-black text-indigo-600 mt-1">{oopStats.totalRecords} incidentes</p>
            </div>
            <div className="border border-emerald-150 p-4 rounded-2xl bg-emerald-50/10 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase">Tramos Lavados Eventualmente</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{oopStats.totalQuantity} tramos</p>
            </div>
            <div className="border border-slate-200 p-4 rounded-2xl bg-slate-50 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase">Estado General de Atención</p>
              <p className="text-xs font-black text-slate-700 mt-1 leading-snug">
                <span className="text-emerald-600">{oopStats.completed} Realizados</span> &bull; <span className="text-indigo-500">{oopStats.pending} Pendientes</span>
              </p>
            </div>
          </div>

          <table className="w-full text-[11px] border-collapse bg-white">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="p-3 text-left border border-slate-700">Fecha / Hora</th>
                <th className="p-3 text-left border border-slate-700">Línea / Lugar</th>
                <th className="p-3 text-left border border-slate-700">Descripción / Trabajo</th>
                <th className="p-3 text-center border border-slate-700">Cantidad</th>
                <th className="p-3 text-left border border-slate-700">Motivo de Emergencia</th>
                <th className="p-3 text-center border border-slate-700">Estado</th>
                <th className="p-3 text-left border border-slate-700">Atendido por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {outOfPrograms.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">No se registraron lavados eventuales ni actividades fuera de programa en este periodo.</td>
                </tr>
              ) : (
                outOfPrograms.map((item, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                    <td className="p-3 border border-slate-100 font-mono text-slate-500 text-[10px]">
                      <p className="font-bold">{item.date}</p>
                      <p>{item.detectionTime} hrs ({item.shift})</p>
                    </td>
                    <td className="p-3 border border-slate-100 font-bold text-slate-700">{item.areaLocation}</td>
                    <td className="p-3 border border-slate-100 max-w-[150px] truncate" title={item.description}>{item.description}</td>
                    <td className="p-3 border border-slate-100 text-center font-black text-indigo-600">{item.quantity}</td>
                    <td className="p-3 border border-slate-100 text-rose-600 font-bold uppercase text-[9px] tracking-wider">{item.reason}</td>
                    <td className="p-3 border border-slate-100 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                        item.status === 'Realizado' ? 'bg-emerald-50 text-emerald-600' :
                        item.status === 'Pendiente' ? 'bg-amber-50 text-amber-500' : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="p-3 border border-slate-100 text-[10px] text-slate-600">
                      <p className="font-bold text-slate-800">{item.washingOperator || item.createdBy || 'Operador'}</p>
                      <p className="text-[9px] text-slate-400 font-mono uppercase">{item.truck || '-'}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* SECTION 4: DISPONIBILIDAD Y HORAS OPERATIVAS */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
            <Truck className="text-blue-600 shrink-0" size={22} />
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">4. Disponibilidad y Horas Operativas de Camiones</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cálculos autorizados sobre camiones operativos CM95, CM97, CM10 y CM49. Se excluye CM58.</p>
            </div>
          </div>

          {/* VISUAL CHART OF OPERATIONAL HOURS */}
          <div className="mb-10 bg-slate-50 p-8 rounded-[2rem] border border-slate-200">
            <h4 className="text-xs font-black text-indigo-700 uppercase tracking-widest mb-6">Visualización Gráfica de Disponibilidad (%)</h4>
            
            <div className="space-y-6">
              {truckSummary.map((t) => {
                const isExcellent = t.availability >= 90;
                const isAcceptable = t.availability >= 70;
                const color = isExcellent ? 'bg-emerald-500 text-emerald-700' : isAcceptable ? 'bg-amber-500 text-amber-700' : 'bg-red-500 text-red-700';
                const progressBg = isExcellent ? 'bg-emerald-100' : isAcceptable ? 'bg-amber-100' : 'bg-red-100';

                return (
                  <div key={t.truck} className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-sm font-mono">{t.truck}</span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                          isExcellent ? 'bg-emerald-50 text-emerald-600' : isAcceptable ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {t.availability.toFixed(1)}% Disp
                        </span>
                      </div>
                      <span className="font-mono text-slate-500 font-bold">
                        {t.operational.toFixed(1)} hrs Real / {t.expected.toFixed(1)} hrs Esperadas
                      </span>
                    </div>
                    {/* SVG/CSS Horizontal Bar Chart */}
                    <div className="w-full bg-slate-200/80 rounded-full h-3 overflow-hidden shadow-xs relative">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${isExcellent ? 'bg-emerald-500' : isAcceptable ? 'bg-amber-500' : 'bg-red-500'}`} 
                        style={{ width: `${Math.min(t.availability, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="p-3 text-left border border-slate-700">Camión</th>
                <th className="p-3 text-center border border-slate-700">Turnos Registrados</th>
                <th className="p-3 text-center border border-slate-700">Horas Esperadas</th>
                <th className="p-3 text-center border border-slate-700">Horas Operativas</th>
                <th className="p-3 text-center border border-slate-700">Horas Descontadas (Fallas)</th>
                <th className="p-3 text-center border border-slate-700">Disponibilidad %</th>
                <th className="p-3 text-left border border-slate-700">Observaciones Generales de la Flota</th>
              </tr>
            </thead>
            <tbody>
              {truckSummary.map((t, idx) => (
                <tr key={idx} className="border-b border-slate-150 font-medium">
                  <td className="p-3 font-black text-slate-900 font-mono text-sm">{t.truck}</td>
                  <td className="p-3 text-center text-slate-505 font-mono">{(t.expected / 12).toFixed(0)} turnos</td>
                  <td className="p-3 text-center font-mono text-slate-605">{t.expected.toFixed(1)}h</td>
                  <td className="p-3 text-center font-black font-mono text-slate-800 bg-slate-50/50">{t.operational.toFixed(1)}h</td>
                  <td className="p-3 text-center text-red-500 font-extrabold font-mono hover:bg-slate-50/30">-{t.deducted.toFixed(1)}h</td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-1 rounded-lg font-black font-mono text-xs ${
                      t.availability >= 90 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                      t.availability >= 70 ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-red-50 text-red-600 border border-red-100'
                    }`}>
                      {t.availability.toFixed(1)}%
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 italic text-[10px]">
                    {t.reasons.join(', ') || 'Operación regular en servicio'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[9px] text-slate-400 uppercase font-black tracking-wider">Nota: Todos los cálculos de disponibilidad se fundamentan en una jornada regular asignada de 12 horas teóricas por turno.</p>
        </section>

        {/* SECTION 5: HISTÓRICO DE ESTADO DE CAMIONES */}
        <section className="mb-12">
          {statusHistory.length > 0 && (
            <>
              <p className="text-[10px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest">Detalle de Estados Registrados por Turno</p>
              <table className="w-full text-[10px] border-collapse bg-white rounded-xl overflow-hidden border border-slate-200">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-3 text-left border-r border-slate-800">Fecha</th>
                    <th className="p-3 text-center border-r border-slate-800">Turno</th>
                    <th className="p-3 text-center border-r border-slate-800">CM95</th>
                    <th className="p-3 text-center border-r border-slate-800">CM97</th>
                    <th className="p-3 text-center border-r border-slate-800">CM10</th>
                    <th className="p-3 text-center border-slate-850">CM49</th>
                  </tr>
                </thead>
                <tbody>
                  {statusHistory.map((h, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors bg-white font-medium">
                      <td className="p-3 border-r border-slate-100 font-bold text-slate-700">{h.date}</td>
                      <td className="p-3 border-r border-slate-100 text-center font-black text-blue-600">{h.shift}</td>
                      {['CM95', 'CM97', 'CM10', 'CM49'].map(code => {
                        const s = h.trucks.find(t => t.code === code)?.status || '-';
                        const display = getStatusDisplay(s);
                        return (
                          <td key={code} className={`p-2 border-r border-slate-100 last:border-r-0 text-center transition-colors ${display.color}`}>
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              <span className="text-xs">{display.icon}</span>
                              <span className="font-black text-[9px] tracking-tighter">{display.text}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        {/* Brand Footer */}
        <div className="mt-20 pt-8 border-t border-slate-200 text-center">
          <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-[0.2em] leading-loose">
            PROGRAMA DE LAVADOS SQM<br />
            Control de Lavados DDEE - Informe técnico oficial de adherencia operativa y disponibilidad de activos mecánicos.
          </p>
        </div>
      </div>
    </div>
  );
}
