import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { DefaultWashing, LineType } from '../../types';
import { Plus, Edit2, Trash2, Search, Filter, Hash, MapPin, X, Check, RefreshCw } from 'lucide-react';
import { INITIAL_CATALOG } from '../../data/initialCatalog';

export default function Catalog() {
  const { profile } = useAuth();
  const [items, setItems] = useState<DefaultWashing[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [formData, setFormData] = useState({
    line: '110 kV' as LineType,
    segmentName: '',
    defaultQuantity: 1,
    active: true
  });

  useEffect(() => {
    const q = query(collection(db, 'defaultWashings'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DefaultWashing));
      setItems(data);

      // Auto-seed if exactly empty (not loading)
      if (snapshot.empty && !isSyncing) {
        setIsSyncing(true);
        try {
          for (const entry of INITIAL_CATALOG) {
            await addDoc(collection(db, 'defaultWashings'), {
              ...entry,
              active: true,
              createdAt: serverTimestamp(),
              createdBy: 'system-auto',
              updatedAt: serverTimestamp()
            });
          }
        } catch (e) {
          console.error("Auto-seeding error:", e);
        } finally {
          setIsSyncing(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleEdit = (item: DefaultWashing) => {
    setEditingId(item.id!);
    setFormData({
      line: item.line,
      segmentName: item.segmentName,
      defaultQuantity: item.defaultQuantity,
      active: item.active
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, 'defaultWashings', editingId), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'defaultWashings'), {
          ...formData,
          createdAt: serverTimestamp(),
          createdBy: profile?.email,
          updatedAt: serverTimestamp()
        });
      }
      resetForm();
    } catch (error) {
      console.error(error);
      alert("Error al guardar.");
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ line: '110 kV', segmentName: '', defaultQuantity: 1, active: true });
  };

  const handleSync = async () => {
    if (!confirm("¿Desea cargar los datos base del catálogo? Esto agregará los registros que no existan.")) return;
    
    setIsSyncing(true);
    try {
      const recordsToIdMap = new Map(items.map(item => [`${item.line}-${item.segmentName}`, item.id]));
      
      let addedCount = 0;
      for (const entry of INITIAL_CATALOG) {
        const key = `${entry.line}-${entry.segmentName}`;
        if (!recordsToIdMap.has(key)) {
          await addDoc(collection(db, 'defaultWashings'), {
            ...entry,
            active: true,
            createdAt: serverTimestamp(),
            createdBy: profile?.email || 'system',
            updatedAt: serverTimestamp()
          });
          addedCount++;
        }
      }
      alert(`Sincronización completada. Se agregaron ${addedCount} registros nuevos.`);
    } catch (error) {
      console.error(error);
      alert("Error al sincronizar.");
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredItems = items.filter(item => 
    item.segmentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.line.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar tramo o línea..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm font-medium focus:border-blue-500 focus:bg-white transition-all outline-hidden"
          />
        </div>
        <div className="flex items-center gap-3">
          <button 
            disabled={isSyncing}
            onClick={handleSync}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 px-6 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100 transition-all active:scale-95 border border-blue-100 disabled:opacity-50"
          >
            {isSyncing ? <RefreshCw size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            Cargar Datos Base
          </button>
          <button 
            onClick={() => setShowForm(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
          >
            <Plus size={18} />
            Agregar Nueva Línea/Tramo
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Línea</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Tramo/Equipo</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cant. Defecto</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Estado</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 uppercase tracking-widest border border-blue-100">
                      {item.line}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-900 tracking-tight">{item.segmentName}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-black text-slate-600">{item.defaultQuantity}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${item.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                      {item.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleEdit(item)} 
                        className="p-2 rounded-xl bg-slate-50 text-slate-400 border border-slate-100 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-100 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Edit2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6 bg-slate-50/50">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">{editingId ? 'Editar Tramo Base' : 'Agregar Nuevo Tramo'}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Configuración de Líneas y Tramos</p>
              </div>
              <button onClick={resetForm} className="rounded-xl p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all border border-transparent hover:border-slate-200"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Línea</label>
                <select
                  value={formData.line}
                  onChange={e => setFormData(p => ({ ...p, line: e.target.value as LineType }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
                >
                  <option value="110 kV">110 kV</option>
                  <option value="33 kV">33 kV</option>
                  <option value="23 kV">23 kV</option>
                  <option value="6,6 kV">6,6 kV</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Tramo/Equipo</label>
                <input
                  type="text"
                  required
                  value={formData.segmentName}
                  onChange={e => setFormData(p => ({ ...p, segmentName: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
                  placeholder="Ej. Sector norte poste 1 al 20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Cantidad por Defecto</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formData.defaultQuantity}
                  onChange={e => setFormData(p => ({ ...p, defaultQuantity: parseInt(e.target.value) }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
                />
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={resetForm} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-black text-slate-500 hover:bg-slate-50 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-black text-white hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
