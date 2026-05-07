import React, { useEffect, useState } from 'react';
import { WashingProgram, OperationalReading, TruckOperatingHours, TruckStatusHistory, INITIAL_TRUCKS } from '../../types';
import { format } from 'date-fns';
import { generatePDFReport } from '../../utils/pdfGenerator';
import { FileDown, Printer, X, CheckCircle2, AlertCircle, Clock, Thermometer, Truck, Loader2 } from 'lucide-react';

interface ReportData {
  programs: WashingProgram[];
  readings: OperationalReading[];
  opHours: TruckOperatingHours[];
  statusHistory: TruckStatusHistory[];
  type: string;
  range: { start: string, end: string };
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

  const { programs, readings, opHours, statusHistory, type, range } = data;

  // Calculations
  const stats = {
    total: programs.length,
    completes: programs.filter(p => p.status === 'Completo' || p.status === 'Cerrado').length,
    partials: programs.filter(p => p.status === 'Parcial').length,
    failed: programs.filter(p => p.status === 'No realizado').length,
    pending: programs.filter(p => p.status === 'Pendiente').length,
  };

  const compliance = stats.total > 0 ? ((stats.completes / stats.total) * 100).toFixed(1) : 0;

  // Grouped operational hours
  const getOpHoursSummary = () => {
    const summary: Record<string, { expected: number, operational: number, deducted: number, reasons: string[] }> = {};
    const activeTruckShifts = new Set(programs.map(p => `${p.date}_${p.shift}_${p.truck}`));

    activeTruckShifts.forEach(key => {
      const [date, shift, truckRaw] = (key as string).split('_');
      const truck = (truckRaw === 'undefined' || !truckRaw || truckRaw === 'null') ? 'Sin camión asignado' : truckRaw;

      if (!summary[truck]) {
        summary[truck] = { expected: 0, operational: 0, deducted: 0, reasons: [] };
      }

      // Base 12 hours per shift
      summary[truck].expected += 12;

      const failure = opHours.find(h => h.date === date && h.shift === shift && h.truck === truckRaw);
      if (failure) {
        summary[truck].operational += failure.operationalHours;
        summary[truck].deducted += failure.deductedHours;
        if (failure.reason && !summary[truck].reasons.includes(failure.reason)) {
          summary[truck].reasons.push(failure.reason);
        }
      } else {
        summary[truck].operational += 12;
      }
    });

    return Object.entries(summary).map(([truck, s]) => ({
      truck,
      ...s,
      availability: (s.operational / s.expected) * 100
    })).sort((a, b) => a.truck.localeCompare(b.truck));
  };

  // Status Summary
  const getStatusSummary = () => {
    const summary: Record<string, Record<string, number>> = {};
    INITIAL_TRUCKS.forEach(code => {
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
    <div className="min-h-screen bg-white p-8 max-w-5xl mx-auto print:p-0">
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

      <div id="report-content" className="bg-white">

        {/* Header */}
      <div className="flex border-b-4 border-blue-600 pb-6 mb-8 items-end justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">REPORTE DE CONTROL DE LAVADOS DDEE</h1>
          <p className="text-blue-600 font-black uppercase tracking-widest text-sm">Empresa: SQM - Sistema de Gestión de Activos</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Generado el</p>
          <p className="text-sm font-bold text-slate-700">{format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
        </div>
      </div>

      {/* Report Info */}
      <div className="grid grid-cols-2 gap-8 mb-10 bg-slate-50 p-6 rounded-3xl border border-slate-100">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Tipo de Reporte</p>
          <p className="text-xl font-black text-slate-900 capitalize">{type}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Periodo Evaluado</p>
          <p className="text-xl font-black text-slate-900 font-mono">{range.start} al {range.end}</p>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-4 gap-6 mb-12">
        <div className="border border-slate-100 p-5 rounded-2xl">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Lavados</p>
          <p className="text-2xl font-black text-slate-900">{stats.total}</p>
        </div>
        <div className="border border-slate-100 p-5 rounded-2xl">
          <p className="text-[10px] font-black text-emerald-400 uppercase mb-1">Cumplimiento</p>
          <p className="text-2xl font-black text-emerald-600">{compliance}%</p>
        </div>
        <div className="border border-slate-100 p-5 rounded-2xl">
          <p className="text-[10px] font-black text-amber-400 uppercase mb-1">Parciales / Fallidos</p>
          <p className="text-2xl font-black text-amber-600">{stats.partials + stats.failed}</p>
        </div>
        <div className="border border-slate-100 p-5 rounded-2xl">
          <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Pendientes</p>
          <p className="text-2xl font-black text-blue-600">{stats.pending}</p>
        </div>
      </div>

      {/* Wash Details Table */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="text-blue-600" size={20} />
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Detalle de Actividades de Lavado</h2>
        </div>
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="p-3 text-left border border-slate-800">Fecha</th>
              <th className="p-3 text-left border border-slate-800">Línea</th>
              <th className="p-3 text-left border border-slate-800">Tramo / Nombre</th>
              <th className="p-3 text-center border border-slate-800">Prog.</th>
              <th className="p-3 text-center border border-slate-800">Real.</th>
              <th className="p-3 text-left border border-slate-800">Estado</th>
              <th className="p-3 text-left border border-slate-800">Operador / Camión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {programs.map((p, index) => (
              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                <td className="p-3 border border-slate-100 font-medium">{p.date}</td>
                <td className="p-3 border border-slate-100 font-bold">{p.line}</td>
                <td className="p-3 border border-slate-100 italic">{p.washingName}</td>
                <td className="p-3 border border-slate-100 text-center font-bold text-slate-400">{p.programmedQuantity}</td>
                <td className="p-3 border border-slate-100 text-center font-black text-slate-900">{p.status === 'Completo' ? p.programmedQuantity : (p.completedCount || 0)}</td>
                <td className={`p-3 border border-slate-100 font-black ${
                  p.status === 'Completo' ? 'text-emerald-600' : 
                  p.status === 'Parcial' ? 'text-amber-500' : 
                  p.status === 'Pendiente' ? 'text-blue-500' : 'text-red-500'
                }`}>
                  {p.status}
                </td>
                <td className="p-3 border border-slate-100">
                  <p className="text-slate-700">{p.washingOperator || '-'}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">{p.truck || '-'}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Operational Hours Section */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="text-blue-600" size={20} />
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Resumen de Horas Operativas por Camión</h2>
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="p-3 text-left border border-slate-700">Camión</th>
              <th className="p-3 text-center border border-slate-700">Horas Esperadas</th>
              <th className="p-3 text-center border border-slate-700">Horas Operativas</th>
              <th className="p-3 text-center border border-slate-700">Horas Descontadas</th>
              <th className="p-3 text-center border border-slate-700">Disponibilidad %</th>
              <th className="p-3 text-left border border-slate-700">Motivos Observados</th>
            </tr>
          </thead>
          <tbody>
            {truckSummary.map((t, idx) => (
              <tr key={idx} className="border-b border-slate-100">
                <td className="p-3 font-bold text-slate-900">{t.truck}</td>
                <td className="p-3 text-center">{t.expected.toFixed(1)}h</td>
                <td className="p-3 text-center font-bold text-slate-800">{t.operational.toFixed(1)}h</td>
                <td className="p-3 text-center text-red-500 font-medium">-{t.deducted.toFixed(1)}h</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-1 rounded-lg font-black ${t.availability >= 90 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    {t.availability.toFixed(1)}%
                  </span>
                </td>
                <td className="p-3 text-slate-500 italic text-[10px]">
                  {t.reasons.join(', ') || 'Operación sin novedad'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[9px] text-slate-400 uppercase font-black">Nota: Todos los cálculos de disponibilidad se basan en una jornada asignada de 12 horas por turno.</p>
      </section>

      {/* Truck Status Section */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <Truck className="text-blue-600" size={20} />
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Estado de Camiones</h2>
        </div>
        
        {statusHistory.length === 0 ? (
          <div className="bg-slate-50 p-4 rounded-xl text-center text-slate-500 italic text-sm">
            No existen estados de camiones registrados para el período seleccionado.
          </div>
        ) : (
          <>
            <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-wrap gap-6 items-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-200 pr-4">Leyenda de Estados</span>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center bg-emerald-50 border border-emerald-200 rounded text-xs select-none">✅</span>
                <span className="text-[10px] font-bold text-slate-700 uppercase"><span className="text-emerald-600">SERV:</span> En servicio</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center bg-amber-50 border border-amber-200 rounded text-xs select-none">🟠</span>
                <span className="text-[10px] font-bold text-slate-700 uppercase"><span className="text-amber-600">DIPS:</span> Disponible</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center bg-red-50 border border-red-200 rounded text-xs select-none">❌</span>
                <span className="text-[10px] font-bold text-slate-700 uppercase"><span className="text-red-600">F/S:</span> Fuera de servicio</span>
              </div>
            </div>

            <div className="mb-10">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-3 ml-1">Detalle Histórico por Fecha y Turno</p>
              <table className="w-full text-[10px] border-collapse bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-3 text-left border-r border-slate-800">Fecha</th>
                    <th className="p-3 text-center border-r border-slate-800">Turno</th>
                    {INITIAL_TRUCKS.map(code => (
                      <th key={code} className="p-3 text-center border-r last:border-r-0 border-slate-800">{code}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statusHistory.map((h, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 border-r border-slate-100 font-bold text-slate-900">{h.date}</td>
                      <td className="p-3 border-r border-slate-100 text-center font-black text-blue-600">{h.shift}</td>
                      {INITIAL_TRUCKS.map(code => {
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
            </div>

            <div className="mb-6">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-3 ml-1">Resumen de Turnos Acumulados</p>
              <table className="w-full text-[10px] border-collapse bg-white rounded-xl overflow-hidden border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="p-3 text-left border-r border-slate-200">Camión</th>
                    <th className="p-3 text-center border-r border-slate-200">En servicio</th>
                    <th className="p-3 text-center border-r border-slate-200">Disponible</th>
                    <th className="p-3 text-center border-slate-200">Fuera de servicio</th>
                  </tr>
                </thead>
                <tbody>
                  {statusTableSummary.map((t, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-b-0">
                      <td className="p-3 font-black text-slate-900 border-r border-slate-100">{t.code}</td>
                      <td className="p-3 text-center font-bold text-emerald-600 border-r border-slate-100">{t['En servicio']} turnos</td>
                      <td className="p-3 text-center font-bold text-amber-600 border-r border-slate-100">{t['Disponible']} turnos</td>
                      <td className="p-3 text-center font-bold text-red-600">{t['Fuera de servicio']} turnos</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Readings Section */}
      {readings.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Thermometer className="text-blue-600" size={20} />
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Registro de Temperaturas y Conductividad</h2>
          </div>
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="p-2 border border-slate-600">Fecha/Turno</th>
                <th className="p-2 border border-slate-600">Camión</th>
                <th className="p-2 border border-slate-600 text-center">TK-A (uS/T/%)</th>
                <th className="p-2 border border-slate-600 text-center">TK-C (uS/T/%)</th>
                <th className="p-2 border border-slate-600 text-center">TK-D (uS/T/%)</th>
                <th className="p-2 border border-slate-600 text-center">Agua Pot. (uS/T/%)</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="p-2 border border-slate-100">{r.date} / {r.shift}</td>
                  <td className="p-2 border border-slate-100 font-bold">{r.truck}</td>
                  <td className="p-2 border border-slate-100 text-center font-mono">{r.readings.TKA.us}/{r.readings.TKA.temperature}/{r.readings.TKA.level}%</td>
                  <td className="p-2 border border-slate-100 text-center font-mono">{r.readings.TKC.us}/{r.readings.TKC.temperature}/{r.readings.TKC.level}%</td>
                  <td className="p-2 border border-slate-100 text-center font-mono">{r.readings.TKD.us}/{r.readings.TKD.temperature}/{r.readings.TKD.level}%</td>
                  <td className="p-2 border border-slate-100 text-center font-mono">{r.readings.potableWater.us}/{r.readings.potableWater.temperature}/{r.readings.potableWater.level}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Footer */}
        <div className="mt-20 pt-8 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-loose">
            CONTROL DE LAVADOS DDEE - SQM<br />
            Documento generado automáticamente por el sistema de gestión operacional.
          </p>
        </div>
      </div>
    </div>
  );
}
