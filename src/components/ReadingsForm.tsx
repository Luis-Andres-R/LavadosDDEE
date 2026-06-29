import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { ShiftType, WASHING_OPERATORS, OperationalReading, TruckInfo, WASHING_TRUCKS } from '../types';
import { Save, Thermometer, Droplets, Gauge, Truck, CheckCircle2 } from 'lucide-react';

export default function ReadingsForm() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [trucks, setTrucks] = useState<TruckInfo[]>([]);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 'T39' as ShiftType,
    washingOperator: WASHING_OPERATORS[0],
    truck: '',
    replacementTruckTag: '',
    readings: {
      TKA: { us: '', temperature: '', level: '' },
      TKC: { us: '', temperature: '', level: '' },
      TKE: { us: '', temperature: '', level: '' },
      potableWater: { us: '', temperature: '', level: '' },
      truckTank: { us: '', temperature: '', level: '' }
    }
  });

  useEffect(() => {
    if (profile?.assignedShift) {
      setFormData(prev => ({ ...prev, shift: profile.assignedShift }));
    }
  }, [profile]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'trucks'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckInfo));
      // Always include CM95 and CM97 regardless of status or active state, as per guidelines
      const activeTrucks = data.filter(t => WASHING_TRUCKS.includes(t.code));
      
      const virtualReplacementTruck: TruckInfo = {
        code: 'REEMPLAZO',
        status: 'Disponible',
        active: true,
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
      };
      
      const finalTrucks: TruckInfo[] = [];
      WASHING_TRUCKS.forEach(code => {
        const found = activeTrucks.find(t => t.code === code);
        if (found) {
          finalTrucks.push(found);
        } else {
          finalTrucks.push({
            code,
            status: 'Disponible',
            active: true,
            updatedAt: new Date().toISOString(),
            updatedBy: 'system'
          });
        }
      });
      finalTrucks.push(virtualReplacementTruck);

      setTrucks(finalTrucks);
      if (finalTrucks.length > 0 && (!formData.truck || !finalTrucks.some(t => t.code === formData.truck))) {
        setFormData(p => ({ ...p, truck: finalTrucks[0].code }));
      }
    });
    return () => unsub();
  }, []);

  const handleInputChange = (tank: string, field: string, value: string) => {
    // Normalize separator while typing to allow both comma and dot
    const normalizedValue = value.replace(',', '.');
    
    setFormData(prev => ({
      ...prev,
      readings: {
        ...prev.readings,
        [tank]: {
          ...prev.readings[tank as keyof typeof prev.readings],
          [field]: normalizedValue
        }
      }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.truck === 'REEMPLAZO' && !formData.replacementTruckTag.trim()) {
      alert("Por favor ingrese el tag del camión de reemplazo.");
      return;
    }

    setLoading(true);
    try {
      // Parse values only on submit
      const parsedReadings: Record<string, { us: number, temperature: number, level: number }> = {};
      
      Object.entries(formData.readings).forEach(([tank, fields]: [string, any]) => {
        parsedReadings[tank] = {
          us: parseFloat(fields.us.toString()) || 0,
          temperature: parseFloat(fields.temperature.toString()) || 0,
          level: parseFloat(fields.level.toString()) || 0
        };
      });

      // Keep TKD for old records compatibility
      parsedReadings['TKD'] = parsedReadings['TKE'];

      const data: any = {
        ...formData,
        readings: parsedReadings as any,
        operatorEmail: profile?.email || auth.currentUser?.email || 'unknown',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (formData.truck === 'REEMPLAZO') {
        data.truckId = 'REEMPLAZO';
        data.replacementTruckTag = formData.replacementTruckTag.trim().toUpperCase();
        data.displayTruckName = `${formData.replacementTruckTag.trim().toUpperCase()} (Reemplazo)`;
      }
      
      await addDoc(collection(db, 'operationalReadings'), data);
      
      setSuccess(true);
      // Reset form partially but keep truck/shift
      setFormData(prev => ({
        ...prev,
        readings: {
          TKA: { us: '', temperature: '', level: '' },
          TKC: { us: '', temperature: '', level: '' },
          TKE: { us: '', temperature: '', level: '' },
          potableWater: { us: '', temperature: '', level: '' },
          truckTank: { us: '', temperature: '', level: '' }
        }
      }));
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving readings:", error);
      alert("Error al guardar los datos operacionales.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Registro Operacional</h2>
        <p className="text-sm font-black text-slate-900 mt-0.5">Temperaturas y Conductividad</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Camión y Turno */}
        <div className="bg-slate-900 rounded-[2rem] p-6 shadow-xl mb-6 text-white">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                <Truck size={12} className="text-blue-400" />
                Camión
              </label>
              <select 
                required
                value={formData.truck}
                onChange={e => setFormData(p => ({ ...p, truck: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 px-4 text-sm font-bold text-white outline-hidden focus:bg-white/10 focus:border-blue-500"
              >
                <option value="" disabled className="bg-slate-900">Seleccionar...</option>
                {trucks.map(t => <option key={t.code} value={t.code} className="bg-slate-900">{t.code}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                <Gauge size={12} className="text-blue-400" />
                Turno
              </label>
              <div className="w-full rounded-xl border border-white/10 bg-white/5 py-3 px-4 text-sm font-bold text-slate-400">
                {formData.shift}
              </div>
            </div>
          </div>
          
          <div className="mt-4 space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Lavador / Operador</label>
            <select 
              value={formData.washingOperator}
              onChange={e => setFormData(p => ({ ...p, washingOperator: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-white/5 py-3 px-4 text-sm font-bold text-white outline-hidden focus:bg-white/10 focus:border-blue-500"
            >
              {WASHING_OPERATORS.map(o => <option key={o} value={o} className="bg-slate-900">{o}</option>)}
            </select>
          </div>

          {formData.truck === 'REEMPLAZO' && (
            <div className="mt-4 space-y-2 animate-fade-in">
              <label className="text-[9px] font-black text-amber-400 uppercase tracking-widest ml-1">Tag del camión de reemplazo *</label>
              <input 
                type="text"
                required
                value={formData.replacementTruckTag}
                onChange={e => setFormData(p => ({ ...p, replacementTruckTag: e.target.value.toUpperCase() }))}
                placeholder="Ej. CM102"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 px-4 text-sm font-bold text-white outline-hidden focus:bg-white/10 focus:border-blue-500 uppercase font-mono"
              />
            </div>
          )}
        </div>

        {/* Estanques */}
        <TankSection title="Estanque TKA" id="TKA" value={formData.readings.TKA} onChange={handleInputChange} />
        <TankSection title="Estanque TKC" id="TKC" value={formData.readings.TKC} onChange={handleInputChange} />
        <TankSection title="Estanque TKE" id="TKE" value={formData.readings.TKE} onChange={handleInputChange} />
        <TankSection title="Agua Potable" id="potableWater" value={formData.readings.potableWater} onChange={handleInputChange} isPotable />
        {formData.truck && (
          <TankSection 
            title={`Estanque del Camión (${formData.truck})`} 
            id="truckTank" 
            value={formData.readings.truckTank} 
            onChange={handleInputChange} 
          />
        )}

        <button 
          type="submit"
          disabled={loading || success || !formData.truck}
          className={`w-full py-5 rounded-[2rem] text-sm font-black uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
            success 
              ? 'bg-emerald-500 text-white shadow-emerald-200' 
              : 'bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700'
          }`}
        >
          {loading ? (
            <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : success ? (
            <>
              <CheckCircle2 size={20} />
              Guardado Exitosamente
            </>
          ) : (
            <>
              <Save size={20} />
              Guardar Datos Operacionales
            </>
          )}
        </button>
      </form>
    </div>
  );
}

const TankSection = ({ title, id, value, onChange, isPotable = false }: { title: string, id: string, value: any, onChange: (tank: string, field: string, val: string) => void, isPotable?: boolean }) => {
  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm mb-4">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-xl ${isPotable ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
           <Droplets size={20} />
        </div>
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{title}</h3>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">µS</label>
          <input 
            type="text"
            inputMode="decimal"
            required
            value={value.us}
            onChange={(e) => onChange(id, 'us', e.target.value)}
            placeholder="0.0"
            className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900 outline-hidden focus:bg-white focus:border-blue-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">T°</label>
          <input 
            type="text"
            inputMode="decimal"
            required
            value={value.temperature}
            onChange={(e) => onChange(id, 'temperature', e.target.value)}
            placeholder="0.0"
            className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900 outline-hidden focus:bg-white focus:border-blue-500"
          />
        </div>
        <div className="space-y-1 relative">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Nivel</label>
          <div className="relative">
            <input 
              type="text"
              inputMode="decimal"
              required={!isPotable}
              value={value.level}
              onChange={(e) => onChange(id, 'level', e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-slate-100 bg-slate-50 pl-3 pr-8 py-3 text-sm font-bold text-slate-900 outline-hidden focus:bg-white focus:border-blue-500"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
