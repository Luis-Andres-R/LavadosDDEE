import * as XLSX from 'xlsx';
import { WashingProgram, OperationalReading, TruckOperatingHours } from '../types';

export const exportToExcel = (
  data: WashingProgram[], 
  fileName: string, 
  readings: OperationalReading[] = [],
  opHours: TruckOperatingHours[] = []
) => {
  const worksheetData = data.map(p => ({
    Fecha: p.date,
    Turno: p.shift,
    Línea: p.line,
    Tramo: p.washingName,
    Cantidad_Programada: p.programmedQuantity,
    Cantidad_Realizada: p.status === 'Completo' || p.status === 'Cerrado' ? p.programmedQuantity : (p.completedCount || 0),
    Pendiente: p.pendingCount || 0,
    Porcentaje: p.percentage || 0,
    Estado: p.status,
    Motivo: p.reason || '',
    Detección_No_Realizado: p.notPerformedDetectedAt || '',
    Detalle_No_Realizado: p.notPerformedDetail || '',
    Operador_Lavado: p.washingOperator || '',
    Camion: p.truck || '',
    Observacion_Admin: p.adminObservation || ''
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Lavados');

  if (readings.length > 0) {
    const readingsData = readings.map(r => ({
      Fecha: r.date,
      Turno: r.shift,
      Operador: r.washingOperator,
      Camion: r.truck,
      TKA_uS: r.readings.TKA.us,
      TKA_Temp: r.readings.TKA.temperature,
      TKA_Nivel: r.readings.TKA.level,
      TKC_uS: r.readings.TKC.us,
      TKC_Temp: r.readings.TKC.temperature,
      TKC_Nivel: r.readings.TKC.level,
      TKD_uS: r.readings.TKD.us,
      TKD_Temp: r.readings.TKD.temperature,
      TKD_Nivel: r.readings.TKD.level,
      Potable_uS: r.readings.potableWater.us,
      Potable_Temp: r.readings.potableWater.temperature,
      Potable_Nivel: r.readings.potableWater.level
    }));
    const readingsSheet = XLSX.utils.json_to_sheet(readingsData);
    XLSX.utils.book_append_sheet(workbook, readingsSheet, 'Lecturas Operacionales');
  }

  if (opHours.length > 0) {
    const opData = opHours.map(h => ({
        Fecha: h.date,
        Turno: h.shift,
        Camion: h.truck,
        Horas_Esperadas: h.theoreticalHours,
        Horas_Operativas: h.operationalHours,
        Horas_Descontadas: h.deductedHours,
        Deteccion_Falla: h.failureDetectedAt,
        Motivo: h.reason,
        Detalle: h.detail,
        Operador: h.washingOperator
    }));
    const opSheet = XLSX.utils.json_to_sheet(opData);
    XLSX.utils.book_append_sheet(workbook, opSheet, 'Horas Operativas');
  }
  
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};
