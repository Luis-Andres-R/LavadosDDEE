export type Role = 'admin' | 'operator';

export interface UserProfile {
  uid: string;
  email: string;
  role: Role;
  displayName: string;
  assignedShift: ShiftType | null;
  active: boolean;
}

export type LineType = '110 kV' | '33 kV' | '23 kV' | '6,6 kV';

export interface DefaultWashing {
  id?: string;
  line: LineType;
  segmentName: string;
  defaultQuantity: number;
  active: boolean;
  createdAt: any;
  createdBy: string;
  updatedAt: any;
}

export type ShiftType = 'T39' | 'T44';
export type WashingProgramType = 'Equipos críticos' | 'Planta' | 'Periferia';
export const WASHING_OPERATORS = [
  'Beltrán Cuello',
  'Joel Cisternas',
  'Eduardo Rojas'
];

export type TruckStatus = 'En servicio' | 'Fuera de servicio' | 'Disponible';

export interface TruckInfo {
  id?: string;
  code: string;
  status: TruckStatus;
  active: boolean;
  updatedAt: any;
  updatedBy: string;
}

export const INITIAL_TRUCKS = ['CM95', 'CM97', 'CM10', 'CM49'];
export const WASHING_TRUCKS = ['CM95', 'CM97'];

export type ProgramStatus = 'Pendiente' | 'Completo' | 'Parcial' | 'No realizado' | 'Cerrado';

export interface ChecklistItem {
  itemName: string;
  order: number;
  active: boolean;
  done?: boolean;
  doneAt?: string; // YYYY-MM-DD
  doneHour?: string; // HH:mm
  operatorEmail?: string;
  operatorName?: string;
  shift?: ShiftType;
  truck?: string;
}

export interface WashingProgramTemplate {
  id?: string;
  areaName: 'Equipos críticos CS' | 'Interior planta CS' | 'Equipos críticos en periferia' | 'Lavado periferia';
  packageName: string;
  controlType: 'checklist' | 'cantidad';
  quantity?: number;
  items?: { itemName: string; order: number; active: boolean }[];
  active: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface WashingProgram {
  id?: string;
  date: string; // YYYY-MM-DD
  shift: ShiftType;
  line: string;
  washingName: string;
  programmedQuantity: number;
  type: WashingProgramType;
  washingOperator: string;
  truck: string;
  adminObservation?: string;
  status: ProgramStatus;
  closed: boolean;
  createdAt: any;
  createdBy: string;
  updatedAt: any;
  
  // Version 2 fields
  areaName?: 'Equipos críticos CS' | 'Interior planta CS' | 'Equipos críticos en periferia' | 'Lavado periferia';
  packageName?: string;
  controlType?: 'checklist' | 'cantidad';
  items?: ChecklistItem[];
  
  // Realized data (calculated or stored summary)
  completedCount?: number;
  pendingCount?: number;
  percentage?: number;
  reason?: string;
  notPerformedDetectedAt?: string;
  notPerformedDetail?: string;
  lastUpdatedBy?: string;
  observation?: string;
}

export interface WashingRecord {
  id?: string;
  programId: string;
  operatorEmail: string;
  status: 'Completo' | 'Parcial' | 'No realizado';
  programmedQuantity: number;
  completed: number;
  pending: number;
  percentage: number;
  reason?: string;
  notPerformedDetectedAt?: string;
  notPerformedDetail?: string;
  otherReason?: string;
  observation?: string;
  registeredAt: any;
  updatedAt: any;
  syncStatus: 'synced' | 'pending';
}

export interface ChangeHistory {
  id?: string;
  programId: string;
  recordId?: string;
  changedBy: string;
  changedAt: any;
  previousData: any;
  newData: any;
  correctionReason?: string;
}

export interface TankReading {
  us: number;
  temperature: number;
  level: number;
}

export interface OperationalReading {
  id?: string;
  date: string;
  shift: ShiftType;
  operatorEmail: string;
  washingOperator: string;
  truck: string;
  readings: {
    TKA: TankReading;
    TKC: TankReading;
    TKD?: TankReading;
    TKE?: TankReading;
    potableWater: TankReading;
    truckTank?: TankReading;
  };
  createdAt: any;
  updatedAt: any;
}

export const REASONS = [
  "Sin acceso",
  "Falta de tiempo",
  "Falta de agua",
  "Equipo detenido",
  "Prioridad operacional",
  "Condición climática",
  "Riesgo operacional",
  "Sin señal",
  "Neumático pinchado",
  "Sin batería",
  "Falla mecánica",
  "Camión fuera de servicio",
  "Otra contingencia operacional",
  "Otro"
];

export interface TruckOperatingHours {
  id?: string;
  date: string;
  shift: ShiftType;
  truck: string;
  operatorEmail: string;
  washingOperator: string;
  theoreticalHours: number;
  operationalHours: number;
  deductedHours: number;
  failureDetectedAt: string | null; // HH:mm
  reason: string;
  detail: string;
  createdAt: any;
  updatedAt: any;
}

export interface TruckStatusHistory {
  id?: string;
  date: string;
  shift: ShiftType;
  trucks: { code: string; status: TruckStatus }[];
  savedAt: any;
  savedBy: string;
}

export interface OutOfProgramWashing {
  id?: string;
  date: string;
  shift: ShiftType;
  truck: string;
  areaLocation: string;
  description: string;
  reason: string;
  requestedBy: string;
  detectionTime: string;
  quantity?: number;
  status: 'Programado' | 'Realizado' | 'Pendiente' | 'No realizado';
  observation?: string;
  operatorEmail: string;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
  assignedBy?: string;
  assignedAt?: any;
  completedAt?: any;
}

export const OUT_OF_PROGRAM_REASONS = [
  'Punto caliente',
  'Emergencia operacional',
  'Solicitud de supervisión',
  'Condición de terreno',
  'Contaminación puntual',
  'Riesgo eléctrico',
  'Apoyo a otra área',
  'Otro'
];

export const SHIFT_CONFIG = {
  T39: { start: '08:00', end: '20:00', total: 12 },
  T44: { start: '20:00', end: '08:00', total: 12 }
};
