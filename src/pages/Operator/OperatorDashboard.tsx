import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  doc, 
  updateDoc, 
  addDoc, 
  setDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { WashingProgram, REASONS, SHIFT_CONFIG, ShiftType, TruckOperatingHours, WASHING_TRUCKS, OutOfProgramWashing, WASHING_OPERATORS } from '../../types';
import { 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  LogOut, 
  RefreshCcw, 
  Droplets,
  ChevronRight,
  Info,
  Check,
  AlertTriangle,
  History,
  Calendar as CalendarIcon,
  Home,
  CheckSquare,
  Square,
  Save,
  Truck,
  ListTodo,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import ReadingsForm from '../../components/ReadingsForm';
import Logo from '../../components/Logo';

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
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

export default function OperatorDashboard() {
  const { profile, logout } = useAuth();
  const [allPrograms, setAllPrograms] = useState<WashingProgram[]>([]);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<WashingProgram | null>(null);
  const [action, setAction] = useState<'complete' | 'partial' | 'failed' | null>(null);
  
  // Checklist view state
  const [checklistProgram, setChecklistProgram] = useState<WashingProgram | null>(null);
  const [checklistTruck, setChecklistTruck] = useState('');
  const [checklistReplacementTruckTag, setChecklistReplacementTruckTag] = useState('');
  const [checklistItems, setChecklistItems] = useState<any[]>([]);
  const [checklistObservation, setChecklistObservation] = useState('');

  // Fuera de programa states
  const [showOutOfProgramForm, setShowOutOfProgramForm] = useState(false);
  const [outOfProgramWashings, setOutOfProgramWashings] = useState<OutOfProgramWashing[]>([]);
  
  // Operator dynamic status updates for out-of-program
  const [selectedOutOfProgramToUpdate, setSelectedOutOfProgramToUpdate] = useState<OutOfProgramWashing | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'Realizado' | 'Pendiente' | 'No realizado'>('Realizado');
  const [updateDate, setUpdateDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [updateTime, setUpdateTime] = useState(format(new Date(), 'HH:mm'));
  const [updateOperator, setUpdateOperator] = useState('Beltrán Cuello');
  const [updateReplacementOperatorName, setUpdateReplacementOperatorName] = useState('');
  const [updateTruck, setUpdateTruck] = useState('CM95');
  const [updateReplacementTruckTag, setUpdateReplacementTruckTag] = useState('');
  const [updateObs, setUpdateObs] = useState('');

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedShift, setSelectedShift] = useState<ShiftType | 'all'>('all');
  const [tab, setTab] = useState<'today' | 'pending' | 'out_of_program'>('today');
  
  const [statusHistory, setStatusHistory] = useState<any[]>([]);

  // Find current day/shift operation status in statusHistory
  const currentDayOperation = useMemo(() => {
    const mapStatus = (record: any) => {
      if (!record) return { status: 'En ejecución', observation: '' };
      let statusValue = record.operationStatus || 'En ejecución';
      if (statusValue === 'Operativa') {
        statusValue = 'En ejecución';
      } else if (statusValue === 'Suspendida') {
        const oldReason = record.suspensionReason || '';
        if (oldReason.toLowerCase().includes('camión') || oldReason.toLowerCase().includes('camion')) {
          statusValue = 'Suspendido por falta de camión';
        } else if (oldReason.toLowerCase().includes('clima') || oldReason.toLowerCase().includes('climática')) {
          statusValue = 'Suspendido por condiciones climáticas';
        } else {
          statusValue = 'Suspendido por contingencia operacional';
        }
      }
      return {
        status: statusValue,
        observation: record.suspensionObservation || ''
      };
    };

    if (selectedShift === 'all') {
      const hist39 = statusHistory.find(h => h.id === `${selectedDate}_T39`);
      const hist44 = statusHistory.find(h => h.id === `${selectedDate}_T44`);
      
      const mapped39 = mapStatus(hist39);
      const mapped44 = mapStatus(hist44);
      
      const isSusp39 = mapped39.status !== 'En ejecución';
      const isSusp44 = mapped44.status !== 'En ejecución';
      
      if (isSusp39 && isSusp44) {
        return {
          status: 'Sin operación' as const,
          reason: `T39: ${mapped39.status} | T44: ${mapped44.status}`,
          observation: `${mapped39.observation} / ${mapped44.observation}`.trim()
        };
      } else if (isSusp39) {
        return {
          status: 'Operación Parcial' as const,
          reason: `T39: ${mapped39.status}`,
          observation: mapped39.observation
        };
      } else if (isSusp44) {
        return {
          status: 'Operación Parcial' as const,
          reason: `T44: ${mapped44.status}`,
          observation: mapped44.observation
        };
      }
    } else {
      const historyId = `${selectedDate}_${selectedShift}`;
      const record = statusHistory.find(h => h.id === historyId);
      if (record) {
        const mapped = mapStatus(record);
        return {
          status: mapped.status,
          reason: mapped.status !== 'En ejecución' ? mapped.status : '',
          observation: mapped.observation
        };
      }
    }
    return {
      status: 'En ejecución' as const,
      reason: '',
      observation: ''
    };
  }, [statusHistory, selectedDate, selectedShift]);

  const [pwaOnline, setPwaOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (profile?.assignedShift) {
      setSelectedShift(profile.assignedShift);
    }
  }, [profile]);

  useEffect(() => {
    const handleOnline = () => setPwaOnline(true);
    const handleOffline = () => setPwaOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Fetch open programs for tracking the pending list
    const qOpen = query(
      collection(db, 'washingPrograms'),
      where('closed', '==', false)
    );

    const unsubscribe = onSnapshot(qOpen, (snapshot) => {
      const openProgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WashingProgram));
      setAllPrograms(openProgs);
      setLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'washingPrograms');
      } catch (e) {
         console.error("Critical error in snapshot", e);
      }
    });

    // Fetch out of program washings
    const unsubscribeOutOfProg = onSnapshot(collection(db, 'outOfProgramWashings'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OutOfProgramWashing));
      setOutOfProgramWashings(data);
    }, (error) => {
      console.error("Error fetching outOfProgramWashings:", error);
    });

    // Fetch truck status history
    const unsubscribeHistory = onSnapshot(collection(db, 'truckStatusHistory'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStatusHistory(data);
    }, (error) => {
      console.error("Error fetching truck status history in operator dashboard:", error);
    });

    // Fetch active trucks
    const fetchTrucks = async () => {
      try {
        const q = query(collection(db, 'trucks'), where('active', '==', true));
        const snap = await getDocs(q);
        const allTrucks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const filteredTrucks = allTrucks.filter((t: any) => WASHING_TRUCKS.includes(t.code));
        setTrucks(filteredTrucks);
      } catch (e) {
        console.error("Error loading trucks:", e);
      }
    };
    fetchTrucks();

    return () => {
      unsubscribe();
      unsubscribeOutOfProg();
      unsubscribeHistory();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (selectedOutOfProgramToUpdate) {
      setUpdateStatus(selectedOutOfProgramToUpdate.status === 'Programado' ? 'Realizado' : selectedOutOfProgramToUpdate.status as any);
      setUpdateDate(format(new Date(), 'yyyy-MM-dd'));
      setUpdateTime(format(new Date(), 'HH:mm'));
      setUpdateTruck(selectedOutOfProgramToUpdate.truck || 'CM95');
      setUpdateReplacementTruckTag(selectedOutOfProgramToUpdate.replacementTruckTag || '');
      setUpdateObs(selectedOutOfProgramToUpdate.observation || '');
    }
  }, [selectedOutOfProgramToUpdate]);

  const handleUpdateOutOfProgramWashing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutOfProgramToUpdate?.id) return;

    if (updateStatus !== 'Realizado' && !updateObs.trim()) {
      alert("Por favor ingrese una observación o motivo para el estado " + updateStatus);
      return;
    }

    try {
      const docRef = doc(db, 'outOfProgramWashings', selectedOutOfProgramToUpdate.id);
      
      const updateData: any = {
        status: updateStatus,
        observation: updateObs.trim(),
        operatorEmail: profile?.email || 'operador@ddeecopiapo.co.cl',
        updatedAt: new Date().toISOString()
      };

      if (updateStatus === 'Realizado') {
        updateData.completedDate = updateDate;
        updateData.completedTime = updateTime;
        updateData.washingOperator = updateOperator;
        updateData.truck = updateTruck;
        if (updateOperator === 'REEMPLAZO') {
          if (!updateReplacementOperatorName.trim()) {
            alert("Por favor ingrese el nombre del operador de reemplazo.");
            return;
          }
          updateData.replacementOperatorName = updateReplacementOperatorName.trim();
          updateData.displayOperatorName = `${updateReplacementOperatorName.trim()} (Reemplazo)`;
        } else {
          updateData.replacementOperatorName = '';
          updateData.displayOperatorName = updateOperator;
        }

        if (updateTruck === 'REEMPLAZO') {
          if (!updateReplacementTruckTag.trim()) {
            alert("Por favor ingrese el tag del camión de reemplazo.");
            return;
          }
          updateData.replacementTruckTag = updateReplacementTruckTag.trim().toUpperCase();
          updateData.displayTruckName = `${updateReplacementTruckTag.trim().toUpperCase()} (Reemplazo)`;
        } else {
          updateData.replacementTruckTag = '';
          updateData.displayTruckName = updateTruck;
        }
        updateData.completedAt = new Date().toISOString();
      }

      await updateDoc(docRef, updateData);
      
      setSelectedOutOfProgramToUpdate(null);
      setUpdateObs('');
    } catch (err: any) {
      console.error(err);
      alert("Error al actualizar lavado fuera de programa: " + err.message);
    }
  };

  const calculateOperationalHours = (shift: ShiftType, failureTime: string | null) => {
    if (!failureTime) return { theoretical: 12, operational: 12, deducted: 0 };
    
    const config = SHIFT_CONFIG[shift];
    const [failH, failM] = failureTime.split(':').map(Number);
    const [startH, startM] = config.start.split(':').map(Number);
    
    let hours = 0;
    if (shift === 'T39') {
       const totalMin = (failH * 60 + failM) - (startH * 60 + startM);
       hours = totalMin / 60;
    } else {
       let failTotal = failH * 60 + failM;
       let startTotal = startH * 60 + startM;
       if (failTotal < startTotal) failTotal += 24 * 60;
       hours = (failTotal - startTotal) / 60;
    }
    
    const operational = Math.max(0, Math.min(12, parseFloat(hours.toFixed(2))));
    return {
      theoretical: 12,
      operational,
      deducted: parseFloat((12 - operational).toFixed(2))
    };
  };

  const handleAction = async (program: WashingProgram, type: 'complete' | 'partial' | 'failed', data?: any) => {
    try {
      const opEmail = profile?.email || auth.currentUser?.email || '';
      const opName = profile?.displayName || 'Operador';
      const curDate = format(new Date(), 'yyyy-MM-dd');
      const curHour = format(new Date(), 'HH:mm');
      const curShift = profile?.assignedShift || 'T39';

      const recordData: any = {
        programId: program.id!,
        operatorEmail: opEmail,
        syncStatus: 'synced',
        registeredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        programmedQuantity: program.programmedQuantity
      };

      let programUpdate: any = {
        updatedAt: serverTimestamp(),
        lastUpdatedBy: opEmail
      };

      // Add actual run context for V2 late accomplishments
      if (program.date !== curDate) {
        programUpdate.lastRealizedDate = curDate;
        programUpdate.lastRealizedShift = curShift;
        programUpdate.lastRealizedOperator = opName;
        // if another truck is specified in data
        if (data?.truck) {
          programUpdate.lastRealizedTruck = data.truck;
        }
      }

      if (type === 'complete') {
        const completedCount = program.programmedQuantity;
        recordData.status = 'Completo';
        recordData.completed = completedCount;
        recordData.pending = 0;
        recordData.percentage = 100;
        
        programUpdate.status = 'Completo';
        programUpdate.completedCount = completedCount;
        programUpdate.pendingCount = 0;
        programUpdate.percentage = 100;
      } else if (type === 'partial') {
        // Incremental or relative pending
        const pendingInput = parseInt(data.pending);
        const newlyCompleted = program.programmedQuantity - (program.completedCount || 0) - pendingInput;
        const totalCompleted = (program.completedCount || 0) + Math.max(0, newlyCompleted);
        const actualPending = program.programmedQuantity - totalCompleted;

        recordData.status = actualPending === 0 ? 'Completo' : 'Parcial';
        recordData.completed = newlyCompleted;
        recordData.pending = actualPending;
        recordData.percentage = (totalCompleted / program.programmedQuantity) * 100;
        recordData.reason = data.reason;
        recordData.otherReason = data.otherReason;
        recordData.observation = data.observation;

        programUpdate.status = actualPending === 0 ? 'Completo' : 'Parcial';
        programUpdate.completedCount = totalCompleted;
        programUpdate.pendingCount = actualPending;
        programUpdate.percentage = recordData.percentage;
        programUpdate.reason = data.reason;
      } else {
        recordData.status = 'No realizado';
        recordData.completed = 0;
        recordData.pending = program.programmedQuantity;
        recordData.percentage = 0;
        recordData.reason = data.reason;
        recordData.otherReason = data.otherReason;
        recordData.observation = data.observation;
        recordData.notPerformedDetectedAt = data.notPerformedDetectedAt;
        recordData.notPerformedDetail = data.notPerformedDetail;

        programUpdate.status = 'No realizado';
        programUpdate.completedCount = 0;
        programUpdate.pendingCount = program.programmedQuantity;
        programUpdate.percentage = 0;
        programUpdate.reason = data.reason;
        programUpdate.notPerformedDetectedAt = data.notPerformedDetectedAt;
        programUpdate.notPerformedDetail = data.notPerformedDetail;

        // Register truck operational hours if failed
        const { theoretical, operational, deducted } = calculateOperationalHours(program.shift, data.notPerformedDetectedAt);
        
        const opHoursData: any = {
          date: program.date,
          shift: program.shift,
          truck: program.truck,
          operatorEmail: opEmail,
          washingOperator: program.washingOperator,
          theoreticalHours: theoretical,
          operationalHours: operational,
          deductedHours: deducted,
          failureDetectedAt: data.notPerformedDetectedAt,
          reason: data.reason,
          detail: data.notPerformedDetail || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        if (program.truck === 'REEMPLAZO') {
          opHoursData.truckId = 'REEMPLAZO';
          opHoursData.replacementTruckTag = program.replacementTruckTag || '';
          opHoursData.displayTruckName = program.displayTruckName || '';
        }

        const opHId = `${program.date}_${program.shift}_${program.truck.replace(/\s+/g, '_')}`;
        await setDoc(doc(db, 'truckOperatingHours', opHId), opHoursData);
      }

      await addDoc(collection(db, 'washingRecords'), recordData);
      await updateDoc(doc(db, 'washingPrograms', program.id!), programUpdate);
      
      setSelectedProgram(null);
      setAction(null);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, 'records/programs');
      } catch (err: any) {
        alert("Error al guardar registro: " + err.message);
      }
    }
  };

  // Open the Checklist runner
  const [loadingChecklist, setLoadingChecklist] = useState(false); // keep standard states clean if any
  const handleOpenChecklist = (program: WashingProgram) => {
    setChecklistProgram(program);
    setChecklistTruck(program.truck || '');
    setChecklistReplacementTruckTag(program.replacementTruckTag || '');
    // Prep list copies with default states or previously set completions
    setChecklistItems(program.items ? [...program.items] : []);
    setChecklistObservation(program.observation || '');
  };

  const handleToggleChecklistItem = (index: number) => {
    const opEmail = profile?.email || auth.currentUser?.email || '';
    const opName = profile?.displayName || 'Operador';
    const curDate = format(new Date(), 'yyyy-MM-dd');
    const curHour = format(new Date(), 'HH:mm');
    const curShift = profile?.assignedShift || 'T39';

    setChecklistItems(prev => {
      const next = [...prev];
      const item = next[index];
      if (item.done) {
        // undoing wash
        next[index] = {
          ...item,
          done: false,
          doneAt: undefined,
          doneHour: undefined,
          operatorEmail: undefined,
          operatorName: undefined,
          shift: undefined,
          truck: undefined
        };
      } else {
        // marking washed
        next[index] = {
          ...item,
          done: true,
          doneAt: curDate,
          doneHour: curHour,
          operatorEmail: opEmail,
          operatorName: opName,
          shift: curShift,
          truck: checklistTruck || checklistProgram?.truck,
          replacementTruckTag: checklistReplacementTruckTag || checklistProgram?.replacementTruckTag || '',
          displayTruckName: (checklistTruck || checklistProgram?.truck) === 'REEMPLAZO' && (checklistReplacementTruckTag || checklistProgram?.replacementTruckTag)
            ? `${(checklistReplacementTruckTag || checklistProgram?.replacementTruckTag || '').toUpperCase()} (Reemplazo)`
            : ''
        };
      }
      return next;
    });
  };

  const handleSaveChecklist = async () => {
    if (!checklistProgram) return;
    if (checklistTruck === 'REEMPLAZO' && !checklistReplacementTruckTag.trim()) {
      alert("Por favor ingrese el tag del camión de reemplazo.");
      return;
    }

    try {
      const activeItems = checklistItems.filter(it => it.active);
      const completedList = activeItems.filter(it => it.done);
      
      const totalCount = activeItems.length;
      const completedCount = completedList.length;
      const pendingCount = totalCount - completedCount;
      const percentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
      
      let status: 'Pendiente' | 'Parcial' | 'Completo' = 'Pendiente';
      if (completedCount === totalCount) {
        status = 'Completo';
      } else if (completedCount > 0) {
        status = 'Parcial';
      }

      if (completedCount < totalCount) {
        if (!checklistObservation.trim()) {
          alert("El checklist está incompleto. Debe ingresar una observación general obligatoria explicando el motivo (ej. sin acceso, falta de tiempo, camión no disponible, etc.).");
          return;
        }
      }

      const opEmail = profile?.email || auth.currentUser?.email || '';
      const curDate = format(new Date(), 'yyyy-MM-dd');
      const curShift = profile?.assignedShift || 'T39';

      // Map checkoff details
      const programUpdate: any = {
        items: checklistItems,
        completedCount,
        pendingCount,
        percentage,
        status,
        observation: checklistObservation,
        updatedAt: serverTimestamp(),
        lastUpdatedBy: opEmail,
        truck: checklistTruck || checklistProgram.truck
      };

      if (checklistTruck === 'REEMPLAZO') {
        programUpdate.truckId = 'REEMPLAZO';
        programUpdate.replacementTruckTag = checklistReplacementTruckTag.trim().toUpperCase();
        programUpdate.displayTruckName = `${checklistReplacementTruckTag.trim().toUpperCase()} (Reemplazo)`;
      } else {
        programUpdate.truckId = checklistTruck || checklistProgram.truck;
        programUpdate.replacementTruckTag = '';
        programUpdate.displayTruckName = checklistTruck || checklistProgram.truck;
      }

      // Create log audit
      const recordData = {
        programId: checklistProgram.id!,
        operatorEmail: opEmail,
        syncStatus: 'synced',
        status: status,
        completed: completedCount,
        pending: pendingCount,
        percentage: percentage,
        registeredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        programmedQuantity: totalCount,
        observation: checklistObservation || `Checklist cerrado con ${completedCount}/${totalCount} completado`
      };

      await addDoc(collection(db, 'washingRecords'), recordData);
      await updateDoc(doc(db, 'washingPrograms', checklistProgram.id!), programUpdate);

      setChecklistProgram(null);
    } catch (e) {
      alert("Error al guardar checklist: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Group programs by tabs:
  // Tab 'today' shows programs assigned to selectedDate (filtered by Shift)
  // Tab 'pending' shows programs with date prior to selectDate that are still open/not complete.
  const todayPrograms = allPrograms.filter(p => 
    p.date === selectedDate && 
    (selectedShift === 'all' || p.shift === selectedShift)
  );

  const pendingPrograms = allPrograms.filter(p => 
    p.date < selectedDate && 
    p.status !== 'Completo' &&
    (selectedShift === 'all' || p.shift === selectedShift)
  );

  const filteredOutOfProgramWashings = outOfProgramWashings.filter(p =>
    p.date === selectedDate &&
    (selectedShift === 'all' || p.shift === selectedShift)
  );

  const handleCreateOutOfProgramWashing = async (data: any) => {
    try {
      const opEmail = profile?.email || auth.currentUser?.email || '';
      const opName = profile?.displayName || 'Operador';

      const payload = {
        date: data.date,
        shift: data.shift as ShiftType,
        truck: data.truck,
        areaLocation: data.areaLocation.trim(),
        description: data.description.trim(),
        reason: data.reason === 'Otro' && data.customReason ? data.customReason.trim() : data.reason,
        requestedBy: data.requestedBy.trim(),
        detectionTime: data.detectionTime,
        status: data.status as 'Realizado' | 'Pendiente' | 'No realizado',
        operatorEmail: opEmail,
        createdBy: opName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      } as any;

      if (data.truck === 'REEMPLAZO') {
        payload.truckId = 'REEMPLAZO';
        payload.replacementTruckTag = data.replacementTruckTag.trim().toUpperCase();
        payload.displayTruckName = `${data.replacementTruckTag.trim().toUpperCase()} (Reemplazo)`;
      }

      if (data.quantity && data.quantity !== '') {
        payload.quantity = Number(data.quantity);
      }
      if (data.observation && data.observation.trim() !== '') {
        payload.observation = data.observation.trim();
      }

      await addDoc(collection(db, 'outOfProgramWashings'), payload);
      setShowOutOfProgramForm(false);
    } catch (e: any) {
      alert("Error al guardar lavado fuera de programa: " + e.message);
    }
  };

  const currentDisplayList = tab === 'today' ? todayPrograms : pendingPrograms;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans max-w-md mx-auto relative shadow-2xl overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900 px-6 py-4 text-white shadow-xl shadow-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Logo variant="light" compact className="h-auto" />
            <div className="border-l border-white/10 pl-2">
              <span className="text-[10px] sm:text-xs font-black tracking-tight leading-none uppercase text-indigo-300">OPERADOR</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 bg-white/10 px-2.5 py-1 rounded-full border border-white/10`}>
                <div className={`h-1.5 w-1.5 rounded-full ${pwaOnline ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`} />
                <span className="text-[9px] font-black uppercase tracking-widest leading-none">{pwaOnline ? 'Online' : 'Offline'}</span>
            </div>
            <button onClick={() => { setSelectedDate(format(new Date(), 'yyyy-MM-dd')); setSelectedProgram(null); setTab('today'); }} className="rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/20 transition-all">
              <Home size={20} />
            </button>
            <button onClick={logout} className="rounded-xl bg-red-500/20 p-2.5 text-red-400 hover:bg-red-500 hover:text-white transition-all">
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {/* Operator Profile Info */}
        <div className="mb-4 bg-white/5 rounded-2xl p-3 border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Operador Activo</p>
            <p className="text-sm font-black text-white">{profile?.displayName || 'Cargando...'}</p>
          </div>
          {profile?.assignedShift && (
            <div className="bg-blue-500/20 px-3 py-1 rounded-xl border border-blue-500/30">
              <span className="text-xs font-black text-blue-400 uppercase leading-none">Turno {profile.assignedShift}</span>
            </div>
          )}
        </div>

        {/* Date Selector */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10 mb-2">
            <div className="flex items-center gap-3">
                <CalendarIcon className="text-blue-400" size={18} />
                <div className="flex-1">
                    <p className="text-[8px] font-black uppercase tracking-widest text-blue-400 leading-none mb-1">Fecha de Operación</p>
                    <input 
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent text-white font-black text-sm outline-hidden w-full cursor-pointer"
                    />
                </div>
            </div>
        </div>
      </header>

      {/* Program List */}
      <div className="px-6 py-8 space-y-6">

        {currentDayOperation.status !== 'En ejecución' && (
          <div className={`border px-6 py-4 rounded-3xl shadow-sm flex flex-col gap-2 ${
            currentDayOperation.status === 'Detenido'
              ? 'bg-red-50 border-red-300 text-red-950'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-2xl shrink-0 mt-0.5 animate-pulse ${
                currentDayOperation.status === 'Detenido' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
              }`}>
                {currentDayOperation.status === 'Detenido' ? (
                  <X className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div>
                <h4 className={`text-xs font-black uppercase tracking-wider ${
                  currentDayOperation.status === 'Detenido' ? 'text-red-900' : 'text-amber-900'
                }`}>
                  Atención: {currentDayOperation.status}
                </h4>
                {currentDayOperation.reason && (
                  <p className="text-[11px] text-slate-700 font-bold mt-0.5 leading-relaxed">
                    Estado principal: <span className="text-slate-900 font-black">{currentDayOperation.reason}</span>.
                  </p>
                )}
                {currentDayOperation.observation && (
                  <p className={`text-[10px] italic mt-1 font-medium p-2 rounded-xl border ${
                    currentDayOperation.status === 'Detenido'
                      ? 'text-red-700 bg-red-100/30 border-red-100/50'
                      : 'text-amber-700 bg-amber-100/30 border-amber-100/50'
                  }`}>
                    "{currentDayOperation.observation}"
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Date scope tab toggles */}
        <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setTab('today')}
            className={`py-3 px-1 rounded-xl flex flex-col items-center justify-center font-black transition-all ${
              tab === 'today'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="text-[9px] uppercase tracking-wider text-center leading-tight">En Programa</span>
            <span className="text-sm leading-none mt-1 font-mono">{todayPrograms.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('pending')}
            className={`py-3 px-1 rounded-xl flex flex-col items-center justify-center font-black transition-all ${
              tab === 'pending'
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-100'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="text-[9px] uppercase tracking-wider text-center leading-tight">Por lavar</span>
            <span className="text-sm leading-none mt-1 font-mono">{pendingPrograms.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('out_of_program')}
            className={`py-3 px-1 rounded-xl flex flex-col items-center justify-center font-black transition-all ${
              tab === 'out_of_program'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="text-[9px] uppercase tracking-wider text-center leading-tight">Fuera Prog.</span>
            <span className="text-sm leading-none mt-1 font-mono">{filteredOutOfProgramWashings.length}</span>
          </button>
        </div>
        {/* Main List Rendering */}
        <div>
          {tab !== 'out_of_program' ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Hoja de Ruta</h2>
                  <p className="text-sm font-black text-slate-900 mt-0.5">
                      {tab === 'today' ? 'Tareas programadas hoy' : 'Tareas por lavar acumuladas'}
                  </p>
                </div>
              </div>

              {loading ? (
                 <div className="flex flex-col items-center justify-center py-24">
                    <div className="relative">
                        <RefreshCcw className="h-12 w-12 animate-spin text-blue-100" />
                        <Droplets className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-600" size={20} />
                    </div>
                    <p className="mt-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando registros...</p>
                 </div>
              ) : currentDisplayList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-3xl border border-slate-200 p-8">
                      <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                      </div>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight">¡Al día!</h3>
                      <p className="mt-1 text-xs font-semibold text-slate-500 max-w-[200px]">No hay programas pendientes en esta categoría.</p>
                  </div>
              ) : (
                  <div className="space-y-4">
                      {currentDisplayList.map(program => {
                        const isChecklist = program.controlType === 'checklist';
                        const displayPercent = program.percentage !== undefined ? Math.round(program.percentage) : 0;
                        
                        return (
                          <div 
                            key={program.id}
                            className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xs relative flex flex-col justify-between"
                          >
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${
                                  isChecklist 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                    : 'bg-indigo-50 text-indigo-75 border-indigo-100'
                                }`}>
                                  {isChecklist ? '📋 Checklist' : '🔢 Cantidad'}
                                </span>
                                {program.date !== selectedDate && (
                                  <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-100 animate-pulse">
                                    Pendiente ({program.date})
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-black text-slate-400 font-mono uppercase">{program.displayTruckName || program.truck}</span>
                            </div>

                            <h3 className="text-lg font-black text-slate-900 tracking-tight leading-tight mb-2">
                              {program.washingName}
                            </h3>
                            <p className="text-[10px] text-slate-500 font-bold mb-4 uppercase tracking-wider bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 self-start">
                              {program.areaName || program.line || 'Lavado'}
                            </p>

                            {/* Progress slider indicator */}
                            <div className="space-y-1.5 mb-6">
                              <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                <span>Avance</span>
                                <span className="font-mono">{displayPercent}%</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full transition-all duration-500 ${isChecklist ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                                  style={{ width: `${displayPercent}%` }}
                                />
                              </div>
                              <div className="text-[10px] text-slate-400 font-bold">
                                {isChecklist 
                                  ? `${program.completedCount || 0} de ${program.programmedQuantity} Equipos lavados`
                                  : `${program.completedCount || 0} de ${program.programmedQuantity} Tramos lavados`
                                }
                              </div>
                            </div>

                            {/* Action launcher */}
                            {isChecklist ? (
                              <button
                                type="button"
                                onClick={() => handleOpenChecklist(program)}
                                className="w-full py-4 rounded-2xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-[0.98] shadow-sm transition-all shadow-emerald-50"
                              >
                                <ListTodo size={16} />
                                Abrir Checklist
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedProgram(program);
                                  setAction(null);
                                }}
                                className="w-full py-4 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-[0.98] shadow-sm transition-all shadow-indigo-100"
                              >
                                <RefreshCcw size={14} />
                                Registrar Avance
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Trabajo Adicional</h2>
                  <p className="text-sm font-black text-slate-900 mt-0.5">Fuera de programa asignado</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOutOfProgramForm(true)}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 flex items-center gap-1.5"
                >
                  <Droplets size={14} />
                  Registrar
                </button>
              </div>

              {filteredOutOfProgramWashings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-3xl border border-slate-200 p-8">
                  <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                    <Droplets className="h-8 w-8 text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Sin registros</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500 max-w-[200px]">No se han registrado lavados fuera de programa para este día/turno.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOutOfProgramWashings.map(item => (
                    <div 
                      key={item.id}
                      className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xs relative flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-mono font-black uppercase tracking-widest bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-lg">
                            {item.displayTruckName || item.truck}
                          </span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${
                            item.status === 'Realizado'
                              ? 'bg-emerald-50 text-emerald-600'
                              : item.status === 'Pendiente'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-red-50 text-red-600'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                        <h4 className="text-base font-black text-slate-900 leading-snug">{item.areaLocation}</h4>
                        <p className="text-xs font-bold text-slate-500 mt-1">{item.description}</p>
                        
                        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100 text-[11px] font-bold text-slate-600">
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Motivo</span>
                            <span className="text-slate-800">{item.reason}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Solicitado Por</span>
                            <span className="text-slate-800">{item.requestedBy}</span>
                          </div>
                        </div>

                        {item.quantity !== undefined && (
                          <div className="mt-2 text-[11px] font-bold text-slate-600">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Cantidad</span>
                            <span className="text-slate-800">{item.quantity} lavados</span>
                          </div>
                        )}

                        {item.observation && (
                          <div className="mt-2 bg-slate-50 p-2.5 rounded-xl text-xs font-semibold text-slate-600 italic">
                            "{item.observation}"
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] font-semibold text-slate-400 font-mono">
                        <span>Minuto: {item.detectionTime}</span>
                        <span>Shift: {item.shift}</span>
                      </div>
                      
                      {item.status !== 'Realizado' ? (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => setSelectedOutOfProgramToUpdate(item)}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider py-2.5 transition-all shadow-xs"
                          >
                            Registrar Estado
                          </button>
                        </div>
                      ) : (
                        <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] font-semibold text-slate-500 font-mono flex flex-col gap-0.5">
                          <span>Realizado el: {item.completedDate} a las {item.completedTime} hrs</span>
                          <span>Por: {item.displayOperatorName || item.washingOperator || 'Operador'} ({item.operatorEmail ? item.operatorEmail.split('@')[0] : 'S/I'})</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-12 border-t border-slate-200 pt-8">
            <ReadingsForm />
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200">
          <button
            type="button"
            onClick={logout}
            className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-red-100"
          >
            <LogOut size={16} />
            Salir del Sistema
          </button>
        </div>
      </div>

      {/* Checklist View Overlay Modal */}
      {checklistProgram && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md overflow-hidden flex flex-col p-4 sm:p-6 justify-center items-center">
          <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-slate-100 text-center bg-slate-50/50">
              <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest border border-rose-100 bg-rose-50 px-2.5 py-1 rounded-md mb-2 inline-block">
                Controles de Checklist
              </span>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                {checklistProgram.washingName}
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                {checklistProgram.areaName}
              </p>
            </div>

            {/* Inputs in checklist */}
            <div className="px-8 pt-4 pb-2 bg-slate-50 border-b border-slate-100 flex flex-col gap-2">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Camión Utilizado</label>
                  <div className="relative">
                    <select
                      value={checklistTruck}
                      onChange={e => setChecklistTruck(e.target.value)}
                      className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-black text-slate-700 outline-hidden focus:border-emerald-500 transition-all cursor-pointer"
                    >
                      <option value="" disabled>Seleccionar camión...</option>
                      {['CM95', 'CM97', 'REEMPLAZO'].map(code => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="w-24 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200 text-center">
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block">Turno Activo</span>
                  <span className="text-xs font-black text-slate-700">{profile?.assignedShift || 'T39'}</span>
                </div>
              </div>

              {checklistTruck === 'REEMPLAZO' && (
                <div className="space-y-1 animate-fade-in">
                  <label className="text-[9px] font-bold text-amber-500 uppercase tracking-wider block">Tag del camión de reemplazo *</label>
                  <input
                    type="text"
                    required
                    value={checklistReplacementTruckTag}
                    onChange={e => setChecklistReplacementTruckTag(e.target.value.toUpperCase())}
                    placeholder="Ej. CM102"
                    className="w-full bg-white border border-amber-300 px-3 py-2 rounded-xl text-xs font-black text-slate-700 focus:border-amber-500 transition-all font-mono uppercase"
                  />
                </div>
              )}
            </div>

            {/* Checklist items list */}
            <div className="flex-1 overflow-y-auto px-8 py-4 space-y-3">
              {checklistItems.filter(it => it.active !== false).map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleToggleChecklistItem(idx)}
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-4 cursor-pointer transition-all ${
                    item.done 
                      ? 'border-emerald-200 bg-emerald-50/50' 
                      : 'border-slate-150 bg-white hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">
                      {item.done ? (
                        <CheckSquare className="text-emerald-600 w-5 h-5" />
                      ) : (
                        <Square className="text-slate-300 w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800 leading-snug">
                        {item.itemName}
                      </span>
                      {item.done && (
                        <span className="text-[8px] font-medium text-emerald-600 block mt-0.5 leading-none">
                          Lavado: {item.doneAt} c/ {item.displayTruckName || item.truck || 'N/A'} por {item.operatorName || 'Operador'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Checklist Observation Area */}
            <div className="px-8 py-4 border-t border-slate-100 bg-slate-50/20 space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                  Observación General 
                  {checklistItems.filter(it => it.done).length < checklistItems.length && (
                    <span className="text-rose-500 font-extrabold ml-1">(Obligatorio - Incompleto)</span>
                  )}
                </label>
                <textarea
                  rows={2}
                  value={checklistObservation}
                  onChange={(e) => setChecklistObservation(e.target.value)}
                  placeholder="Explicar motivos: sin acceso, falta de tiempo, camión no disponible, etc."
                  className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 outline-hidden focus:border-emerald-500 transition-all placeholder:text-slate-300 resize-none"
                />
              </div>

              {/* Suggestions */}
              <div className="space-y-1">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Sugerencias rápidas:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Sin acceso',
                    'Falta de tiempo',
                    'Camión no disponible',
                    'Prioridad operacional',
                    'Continuidad al día siguiente'
                  ].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setChecklistObservation(sug)}
                      className="text-[9px] font-extrabold bg-white border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 text-slate-500 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Checklist summary footer */}
            <div className="p-8 border-t border-slate-100 bg-slate-50/50 space-y-4">
              <div className="flex justify-between items-center text-xs font-black text-slate-600 uppercase tracking-wider">
                <span>Completado:</span>
                <span className="font-mono bg-white px-2.5 py-1 rounded-lg border border-slate-150">
                  {checklistItems.filter(it => it.done).length} de {checklistItems.length} ({
                    checklistItems.length > 0 
                      ? Math.round((checklistItems.filter(it => it.done).length / checklistItems.length) * 100)
                      : 0
                  }%)
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setChecklistProgram(null)}
                  className="flex-1 py-4 border border-slate-200 bg-white rounded-2xl text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                >
                  Regresar
                </button>
                <button
                  type="button"
                  onClick={handleSaveChecklist}
                  className="flex-1 py-4 bg-emerald-600 rounded-2xl text-xs font-black text-white uppercase tracking-widest hover:bg-emerald-700 active:scale-95 shadow-lg shadow-emerald-50 transition-all"
                >
                  Guardar Avance
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedProgram && !action && (
          <SelectionDrawer 
            program={selectedProgram} 
            onClose={() => setSelectedProgram(null)} 
            onAction={setAction}
          />
        )}
        
        {selectedProgram && action && (
            <ActionModal 
                key={`modal-${selectedProgram.id}-${action}`}
                program={selectedProgram}
                type={action}
                trucks={trucks}
                onClose={() => setAction(null)}
                onSubmit={(data) => handleAction(selectedProgram, action, data)}
            />
        )}

        {showOutOfProgramForm && (
            <OutOfProgramModal 
                onClose={() => setShowOutOfProgramForm(false)}
                onSubmit={handleCreateOutOfProgramWashing}
                operatorShift={profile?.assignedShift || null}
            />
        )}

        {selectedOutOfProgramToUpdate && (
          <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <span className="text-[9px] font-black text-indigo-700 uppercase tracking-widest border border-indigo-100 bg-indigo-50 px-2.5 py-1 rounded-full inline-block mb-1.5 animate-pulse">
                    Registrar Avance
                  </span>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Completar Lavado Eventual</h3>
                </div>
                <button 
                  type="button"
                  onClick={() => setSelectedOutOfProgramToUpdate(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <XCircle size={20} className="w-5 h-5 text-slate-400 hover:text-slate-600" />
                </button>
              </div>

              <form onSubmit={handleUpdateOutOfProgramWashing} className="p-8 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Estado de Lavado</label>
                  <select
                    value={updateStatus}
                    onChange={e => setUpdateStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all cursor-pointer text-indigo-600"
                  >
                    <option value="Realizado">Realizado</option>
                    <option value="Pendiente">Pendiente</option>
                    <option value="No realizado">No realizado</option>
                  </select>
                </div>

                {updateStatus === 'Realizado' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Fecha Real</label>
                        <input
                          type="date"
                          required
                          value={updateDate}
                          onChange={e => setUpdateDate(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all cursor-pointer font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-505 uppercase tracking-wider block">Hora Real</label>
                        <input
                          type="time"
                          required
                          value={updateTime}
                          onChange={e => setUpdateTime(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all cursor-pointer font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-505 uppercase tracking-wider block">Operador Lavador</label>
                        <select
                          value={updateOperator}
                          onChange={e => setUpdateOperator(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all cursor-pointer"
                        >
                          {WASHING_OPERATORS.map(op => (
                            <option key={op} value={op}>{op}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-505 uppercase tracking-wider block">Camión Utilizado</label>
                        <select
                          value={updateTruck}
                          onChange={e => setUpdateTruck(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all cursor-pointer font-mono font-bold text-indigo-600"
                        >
                          <option value="CM95">CM95</option>
                          <option value="CM97">CM97</option>
                          <option value="REEMPLAZO">REEMPLAZO</option>
                        </select>
                      </div>
                    </div>

                    {updateOperator === 'REEMPLAZO' && (
                      <div className="space-y-1 animate-fade-in mt-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 font-sans">Nombre real del operador de reemplazo *</label>
                        <input 
                          type="text"
                          required
                          value={updateReplacementOperatorName}
                          onChange={e => setUpdateReplacementOperatorName(e.target.value)}
                          placeholder="Ej. Juan Pérez"
                          className="w-full rounded-2xl border border-amber-350 bg-amber-50/20 py-3 px-4 text-sm font-bold text-slate-705 focus:bg-white focus:border-indigo-550 outline-hidden transition-all font-sans"
                        />
                      </div>
                    )}

                    {updateTruck === 'REEMPLAZO' && (
                      <div className="space-y-1 animate-fade-in mt-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Tag del camión de reemplazo *</label>
                        <input 
                          type="text"
                          required
                          value={updateReplacementTruckTag}
                          onChange={e => setUpdateReplacementTruckTag(e.target.value.toUpperCase())}
                          placeholder="Ej. CM102"
                          className="w-full rounded-2xl border border-amber-350 bg-amber-50/20 py-3 px-4 text-sm font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all uppercase font-mono"
                        />
                      </div>
                    )}
                  </>
                ) : null}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-505 uppercase tracking-wider block">
                    {updateStatus === 'Realizado' ? 'Observación (Opcional)' : 'Motivo / Detalle (Obligatorio)'}
                  </label>
                  <textarea
                    required={updateStatus !== 'Realizado'}
                    placeholder={updateStatus === 'Realizado' ? 'Ej: Se realizó sin novedades...' : 'Explique el motivo por el cual queda Pendiente o No realizado de forma obligatoria...'}
                    value={updateObs}
                    onChange={e => setUpdateObs(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all h-24 resize-none"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedOutOfProgramToUpdate(null)}
                    className="flex-1 bg-slate-100 border border-slate-200 text-slate-505 font-bold uppercase tracking-wider py-3 rounded-xl text-xs hover:bg-slate-200 transition-all font-sans"
                  >
                    Salir
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 border border-indigo-705 text-white font-black uppercase tracking-widest py-3 rounded-xl text-xs hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all font-sans"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SelectionDrawer({ program, onClose, onAction }: { program: WashingProgram, onClose: () => void, onAction: (a: any) => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/80 backdrop-blur-md p-0">
            <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-md rounded-t-[3rem] bg-white p-10 shadow-2xl relative"
            >
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-slate-200 cursor-pointer" onClick={onClose} />
                
                <div className="mb-10 mt-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Confirmación de Avance</h3>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-[1.1] mt-1">{program.washingName}</h2>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <ActionButton 
                        label="Lavado Completo" 
                        sub="Ejecución terminada al 100%"
                        icon={<CheckCircle2 className="text-emerald-500" />} 
                        onClick={() => onAction('complete')}
                        color="green"
                    />
                    <ActionButton 
                        label="Lavado Parcial" 
                        sub="Trabajo pendiente / en curso"
                        icon={<Clock className="text-amber-500" />} 
                        onClick={() => onAction('partial')}
                        color="yellow"
                    />
                    <ActionButton 
                        label="Tarea No Realizada" 
                        sub="Imposibilidad técnica de lavado"
                        icon={<XCircle className="text-red-500" />} 
                        onClick={() => onAction('failed')}
                        color="red"
                    />
                    
                    <button onClick={onClose} className="mt-6 w-full py-4 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-colors">
                        Ignorar Registro
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

function ActionButton({ label, sub, icon, onClick, color }: { label: string, sub: string, icon: any, onClick: () => void, color: string }) {
    const borders: Record<string, string> = {
        green: 'border-emerald-100 bg-emerald-50/50 hover:border-emerald-500',
        yellow: 'border-amber-100 bg-amber-50/50 hover:border-amber-500',
        red: 'border-red-100 bg-red-50/50 hover:border-red-500'
    };

    return (
        <button 
            onClick={onClick}
            className={`flex items-center gap-5 rounded-3xl border-2 p-6 text-left transition-all active:scale-95 group ${borders[color]}`}
        >
            <div className="rounded-2xl bg-white p-3 shadow-sm group-active:scale-90 transition-transform">{icon}</div>
            <div className="flex-1">
                <p className="text-lg font-black text-slate-900 tracking-tight">{label}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{sub}</p>
            </div>
            <ChevronRight className="text-slate-300 group-hover:text-slate-900 transition-colors" size={24} />
        </button>
    );
}

function ActionModal({ program, type, trucks, onClose, onSubmit }: { program: WashingProgram, type: string, trucks: any[], onClose: () => void, onSubmit: (d: any) => void, key?: React.Key }) {
    const defaultPending = String(program.programmedQuantity - (program.completedCount || 0));
    
    const [formData, setFormData] = useState({
        pending: defaultPending,
        reason: 'Sin acceso',
        otherReason: '',
        observation: '',
        notPerformedDetectedAt: format(new Date(), 'HH:mm'),
        notPerformedDetail: '',
        truck: program.truck || '',
        replacementTruckTag: program.replacementTruckTag || ''
    });

    const isPartial = type === 'partial';
    const isFailed = type === 'failed';
    const isComplete = type === 'complete';

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/90 p-6 backdrop-blur-xl">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="w-full max-w-sm rounded-[2.5rem] bg-white overflow-hidden shadow-2xl border border-slate-200"
            >
                <div className="p-8 text-center bg-slate-50/80 border-b border-slate-100">
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                        {isComplete ? 'Confirmar Éxito' : isPartial ? 'Informar Restante' : 'Notificar Incidencia'}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sincronización Obligatoria</p>
                </div>

                <div className="p-8 overflow-y-auto max-h-[65vh] space-y-6">
                    {isComplete ? (
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-50 text-emerald-500 mb-6 shadow-inner ring-4 ring-emerald-50">
                                <CheckCircle2 size={40} />
                            </div>
                            <p className="text-sm font-bold text-slate-600 leading-relaxed">
                                Estas por registrar el cumplimiento del <span className="text-emerald-600 font-black">100%</span> del programa:<br/>
                                <span className="bg-slate-100 px-3 py-1 rounded-lg text-slate-900 inline-block mt-3 font-black text-lg">
                                  {program.programmedQuantity - (program.completedCount || 0)} Tr. Pendientes
                                </span>
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {isPartial && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Cant. Pendiente Restante</label>
                                    <div className="relative">
                                        <input 
                                            type="text"
                                            inputMode="numeric"
                                            value={formData.pending}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val === '' || /^\d+$/.test(val)) {
                                                    setFormData(f => ({ ...f, pending: val }));
                                                }
                                            }}
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-2xl font-black text-slate-900 outline-hidden focus:bg-white focus:border-blue-500"
                                        />
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                            MAX: {program.programmedQuantity - (program.completedCount || 0) - 1}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Causa del Pendiente</label>
                                <select 
                                    value={formData.reason}
                                    onChange={e => setFormData(f => ({ ...f, reason: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 cursor-pointer"
                                >
                                    {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>

                            {isFailed && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Hora detección de no realización</label>
                                        <input 
                                            required
                                            type="time" 
                                            value={formData.notPerformedDetectedAt}
                                            onChange={e => setFormData(f => ({ ...f, notPerformedDetectedAt: e.target.value }))}
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Detalle de la Contingencia *</label>
                                        <textarea 
                                            required
                                            value={formData.notPerformedDetail}
                                            onChange={e => setFormData(f => ({ ...f, notPerformedDetail: e.target.value }))}
                                            className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 resize-none"
                                            rows={2}
                                            placeholder="Describa la falla mecánica, neumático, etc..."
                                        />
                                    </div>
                                </>
                            )}

                            {formData.reason === 'Otro' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Especificar Razón</label>
                                    <input 
                                        required
                                        type="text" 
                                        value={formData.otherReason}
                                        onChange={e => setFormData(f => ({ ...f, otherReason: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
                                        placeholder="Descripción mínima..."
                                    />
                                </div>
                            )}

                            {/* Option to change Camión if executing late on a pending item */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Camión Utilizado</label>
                                <select 
                                    value={formData.truck}
                                    onChange={e => setFormData(f => ({ ...f, truck: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 cursor-pointer"
                                >
                                    {['CM95', 'CM97', 'REEMPLAZO'].map(code => <option key={code} value={code}>{code}</option>)}
                                </select>
                            </div>

                            {formData.truck === 'REEMPLAZO' && (
                                <div className="space-y-2 animate-fade-in">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 ml-1">Tag del camión de reemplazo *</label>
                                    <input 
                                        type="text"
                                        required
                                        value={formData.replacementTruckTag}
                                        onChange={e => setFormData(f => ({ ...f, replacementTruckTag: e.target.value.toUpperCase() }))}
                                        placeholder="Ej. CM102"
                                        className="w-full rounded-2xl border border-amber-300 bg-amber-50/20 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-amber-500 font-mono uppercase"
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Observaciones en Terreno</label>
                                <textarea 
                                    value={formData.observation}
                                    onChange={e => setFormData(f => ({ ...f, observation: e.target.value }))}
                                    className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 resize-none"
                                    rows={3}
                                    placeholder="Detalles técnicos..."
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Confirm section */}
                <div className="p-8 border-t border-slate-100 flex gap-4">
                    <button onClick={onClose} className="flex-1 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-colors">Atrás</button>
                    <button 
                        onClick={() => {
                            if (formData.truck === 'REEMPLAZO' && !formData.replacementTruckTag.trim()) {
                                alert("Por favor ingrese el tag del camión de reemplazo.");
                                return;
                            }
                            onSubmit(formData);
                        }}
                        className={`flex-1 rounded-[1.25rem] py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-[0.98] ${
                            isComplete ? 'bg-emerald-600 shadow-emerald-100' : 
                            isPartial ? 'bg-amber-600 shadow-amber-100' : 'bg-red-600 shadow-red-100'
                        }`}
                    >
                        Sincronizar
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

function OutOfProgramModal({
  onClose,
  onSubmit,
  operatorShift
}: {
  onClose: () => void;
  onSubmit: (data: any) => void;
  operatorShift: ShiftType | null;
}) {
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    shift: operatorShift || 'T39',
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
    status: 'Realizado'
  });

  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.areaLocation.trim()) return setError('El área o ubicación es requerida');
    if (!formData.description.trim()) return setError('La descripción es requerida');
    if (!formData.requestedBy.trim()) return setError('Solicitado por es requerido');
    if (formData.reason === 'Otro' && !formData.customReason.trim()) return setError('Especifique el otro motivo');
    if (formData.truck === 'REEMPLAZO' && !formData.replacementTruckTag.trim()) return setError('El tag del camión de reemplazo es requerido');

    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/90 p-6 backdrop-blur-xl overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-[2.5rem] bg-white overflow-hidden shadow-2xl border border-slate-200 my-8"
      >
        <div className="p-8 text-center bg-indigo-50/50 border-b border-indigo-100">
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Lavado Fuera de Programa</h3>
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Registro de Trabajo Adicional</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-4 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Fecha</label>
            <input 
              type="date" 
              required
              value={formData.date}
              onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-indigo-600 transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Turno</label>
            <div className="w-full rounded-2xl border border-slate-200 bg-slate-100 py-3 px-4 text-sm font-black text-slate-600">
              Turno {formData.shift}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Camión</label>
            <select 
              value={formData.truck}
              onChange={e => setFormData(p => ({ ...p, truck: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-indigo-600 transition-all font-mono"
            >
              <option value="CM95">CM95</option>
              <option value="CM97">CM97</option>
              <option value="REEMPLAZO">REEMPLAZO</option>
            </select>
          </div>

          {formData.truck === 'REEMPLAZO' && (
            <div className="space-y-1 animate-fade-in">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Tag del camión de reemplazo *</label>
              <input 
                type="text"
                required
                value={formData.replacementTruckTag}
                onChange={e => setFormData(p => ({ ...p, replacementTruckTag: e.target.value.toUpperCase() }))}
                placeholder="Ej. CM102"
                className="w-full rounded-2xl border border-amber-350 bg-amber-50/20 py-3 px-4 text-sm font-bold text-slate-705 focus:bg-white focus:border-indigo-505 outline-hidden transition-all uppercase font-mono"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Área o Ubicación</label>
            <input 
              type="text" 
              required
              placeholder="Ej. Patio de estanques"
              value={formData.areaLocation}
              onChange={e => setFormData(p => ({ ...p, areaLocation: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-indigo-600 transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Descripción del lavado</label>
            <input 
              type="text" 
              required
              placeholder="Ej. Lavado de aislación s-90"
              value={formData.description}
              onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-indigo-600 transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Motivo</label>
            <select 
              value={formData.reason}
              onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-indigo-600 transition-all"
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

          {formData.reason === 'Otro' && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Especifique motivo</label>
              <input 
                type="text" 
                required
                placeholder="Escriba el motivo aquí..."
                value={formData.customReason}
                onChange={e => setFormData(p => ({ ...p, customReason: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-indigo-600 transition-all"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Solicitado Por</label>
            <input 
              type="text" 
              required
              placeholder="Ej. Juan Pérez (Supervisor)"
              value={formData.requestedBy}
              onChange={e => setFormData(p => ({ ...p, requestedBy: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-indigo-600 transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Hora de Solicitud/Detección</label>
            <input 
              type="time" 
              required
              value={formData.detectionTime}
              onChange={e => setFormData(p => ({ ...p, detectionTime: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-indigo-600 transition-all font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Cantidad (si aplica)</label>
            <input 
              type="number" 
              placeholder="Ej. 1"
              value={formData.quantity}
              onChange={e => setFormData(p => ({ ...p, quantity: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-indigo-600 transition-all font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex justify-between">
              <span>Observación</span>
              <span className="text-slate-300 font-normal normal-case">Opcional</span>
            </label>
            <textarea 
              placeholder="Comentarios adicionales..."
              value={formData.observation}
              onChange={e => setFormData(p => ({ ...p, observation: e.target.value }))}
              rows={2}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-indigo-600 transition-all resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-1">Estado</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Realizado', 'Pendiente', 'No realizado'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, status: st }))}
                  className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-center border transition-all ${
                    formData.status === st
                      ? st === 'Realizado'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : st === 'Pendiente'
                        ? 'bg-amber-50 border-amber-50 text-white'
                        : 'bg-red-500 border-red-500 text-white'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {st.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 border border-slate-200 bg-white rounded-2xl text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-4 bg-indigo-600 rounded-2xl text-xs font-black text-white uppercase tracking-widest hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-50 transition-all"
            >
              Registrar
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
