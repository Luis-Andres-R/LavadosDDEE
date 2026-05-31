import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { WashingProgramTemplate } from '../../types';
import { Plus, Edit2, Trash2, Search, Filter, X, Check, RefreshCw, Layers, CheckSquare, ListTodo, PlusCircle, Trash } from 'lucide-react';
import { INITIAL_WASHING_TEMPLATES } from '../../data/washingTemplates';

const AREAS = [
  'Equipos críticos CS',
  'Interior planta CS',
  'Equipos críticos en periferia',
  'Lavado periferia'
] as const;

export default function Catalog() {
  const { profile } = useAuth();
  const [items, setItems] = useState<WashingProgramTemplate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [formData, setFormData] = useState({
    areaName: 'Equipos críticos CS' as typeof AREAS[number],
    packageName: '',
    controlType: 'cantidad' as 'checklist' | 'cantidad',
    quantity: 1,
    active: true
  });

  // Checklist items list for the template modal form
  const [formChecklistItems, setFormChecklistItems] = useState<{ itemName: string; order: number; active: boolean }[]>([]);
  const [newItemName, setNewItemName] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'washingProgramTemplates'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WashingProgramTemplate));
      setItems(data);

      // Auto-seed if empty
      if (snapshot.empty && !isSyncing) {
        setIsSyncing(false); // we handle seeding on-demand or automatically
      }
    });
    return () => unsubscribe();
  }, []);

  const handleEdit = (item: WashingProgramTemplate) => {
    setEditingId(item.id!);
    setFormData({
      areaName: item.areaName,
      packageName: item.packageName,
      controlType: item.controlType,
      quantity: item.quantity || 1,
      active: item.active
    });
    setFormChecklistItems(
      item.items ? item.items.map(it => ({ itemName: it.itemName, order: it.order, active: it.active })) : []
    );
    setShowForm(true);
  };

  const handleAddChecklistItem = () => {
    if (!newItemName.trim()) return;
    setFormChecklistItems(prev => [
      ...prev,
      { itemName: newItemName.trim(), order: prev.length + 1, active: true }
    ]);
    setNewItemName('');
  };

  const handleRemoveChecklistItem = (index: number) => {
    setFormChecklistItems(prev => prev.filter((_, i) => i !== index).map((it, idx) => ({ ...it, order: idx + 1 })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.packageName.trim()) {
      alert("Por favor ingrese el nombre del paquete.");
      return;
    }

    try {
      const payload: any = {
        areaName: formData.areaName,
        packageName: formData.packageName.trim(),
        controlType: formData.controlType,
        active: formData.active,
        updatedAt: serverTimestamp()
      };

      if (formData.controlType === 'cantidad') {
        payload.quantity = Number(formData.quantity);
        payload.items = [];
      } else {
        payload.quantity = formChecklistItems.length;
        payload.items = formChecklistItems;
      }

      if (editingId) {
        await updateDoc(doc(db, 'washingProgramTemplates', editingId), payload);
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, 'washingProgramTemplates'), payload);
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
    setFormData({
      areaName: 'Equipos críticos CS',
      packageName: '',
      controlType: 'cantidad',
      quantity: 1,
      active: true
    });
    setFormChecklistItems([]);
    setNewItemName('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Desea eliminar este paquete del catálogo?")) return;
    try {
      await deleteDoc(doc(db, 'washingProgramTemplates', id));
    } catch (error) {
      console.error(error);
      alert("Error al eliminar.");
    }
  };

  const handleSyncInitial = async () => {
    if (!confirm("¿Desea restaurar/sincronizar el catálogo maestro oficial con los 4 áreas y paquetes iniciales?")) return;
    setIsSyncing(true);
    try {
      for (const entry of INITIAL_WASHING_TEMPLATES) {
        // Look up if already exists to avoid duplication
        const duplicate = items.find(existing => existing.packageName === entry.packageName && existing.areaName === entry.areaName);
        if (!duplicate) {
          await addDoc(collection(db, 'washingProgramTemplates'), {
            ...entry,
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }
      alert("Catálogo oficial sincronizado de forma exitosa.");
    } catch (error) {
      console.error(error);
      alert("Error de sincronización.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Filters
  const filteredItems = items.filter(item => {
    const matchesSearch = item.packageName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.areaName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesArea = selectedAreaFilter === 'all' || item.areaName === selectedAreaFilter;
    return matchesSearch && matchesArea;
  });

  return (
    <div className="space-y-12">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Catálogo de Paquetes <span className="text-blue-600">V2</span></h2>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Estructura Oficial de Lavados por Turno</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSyncInitial}
            disabled={isSyncing}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all font-sans"
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            Cargar Catálogo Oficial
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-xs font-black text-white hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-100 transition-all font-sans"
          >
            <Plus size={16} />
            Crear Paquete
          </button>
        </div>
      </div>

      {/* Filter and search controllers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar paquete..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm font-bold text-slate-700 placeholder-slate-400 outline-hidden focus:border-blue-500 focus:bg-white transition-all"
          />
        </div>
        <div className="relative">
          <select
            value={selectedAreaFilter}
            onChange={e => setSelectedAreaFilter(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:border-blue-500 transition-all cursor-pointer"
          >
            <option value="all">Todas las Áreas Principales</option>
            {AREAS.map(area => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid List */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-3xl border border-slate-100">
          <Layers className="h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-black text-slate-900">Catálogo vacío</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-[280px]">Sincronice el catálogo oficial usando el menú de arriba para cargar el estándar de planta.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition-all hover:shadow-md"
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      item.controlType === 'checklist'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                    }`}>
                      {item.controlType === 'checklist' ? '📋 Checklist' : `🔢 Cantidad (${item.quantity})`}
                    </span>
                    {!item.active && (
                      <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <h4 className="text-lg font-black text-slate-900 leading-tight">
                    {item.packageName}
                  </h4>
                </div>
                <div className="flex gap-1.5 opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(item)}
                    className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-900 border border-slate-100 hover:bg-slate-100 transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id!)}
                    className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-rose-600 border border-slate-100 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Área Operativa CS
                </span>
                <span className="text-xs font-bold text-slate-700">
                  {item.areaName}
                </span>
              </div>

              {item.controlType === 'checklist' && item.items && (
                <div className="mt-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Equipamiento ({item.items.length})
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-[60px] overflow-hidden truncate">
                    {item.items.map((it, i) => (
                      <span key={i} className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-normal">
                        {it.itemName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal form for Catalog templates */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-8 py-5 bg-slate-50">
              <h3 className="text-xl font-black text-slate-900">
                {editingId ? 'Editar Paquete' : 'Crear Paquete'}
              </h3>
              <button onClick={resetForm} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 overflow-y-auto space-y-6 flex-1">
              <div className="space-y-4">
                
                {/* Area primary */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Área Principal</label>
                  <select
                    value={formData.areaName}
                    onChange={e => setFormData(p => ({ ...p, areaName: e.target.value as any }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-4 text-xs font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
                  >
                    {AREAS.map(area => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                </div>

                {/* Package Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nombre del Paquete</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. SW28 a PTS"
                    value={formData.packageName}
                    onChange={e => setFormData(p => ({ ...p, packageName: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-4 text-xs font-bold text-slate-705 outline-hidden focus:bg-white focus:border-blue-500 transition-all font-sans"
                  />
                </div>

                {/* Control Type toggler */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tipo de Control</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, controlType: 'cantidad' }))}
                      className={`py-3.5 rounded-xl border text-xs font-black transition-all ${
                        formData.controlType === 'cantidad'
                          ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                      }`}
                    >
                      🔢 Registro Cantidad / Tramos
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, controlType: 'checklist' }))}
                      className={`py-3.5 rounded-xl border text-xs font-black transition-all ${
                        formData.controlType === 'checklist'
                          ? 'bg-emerald-50 border-emerald-250 text-emerald-700 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                      }`}
                    >
                      📋 Checklist Equipos Internos
                    </button>
                  </div>
                </div>

                {/* Sub configuration options based on chosen controlType */}
                {formData.controlType === 'cantidad' ? (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cantidad Recomendada (Tramos)</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={formData.quantity}
                      onChange={e => setFormData(p => ({ ...p, quantity: parseInt(e.target.value) || 1 }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-4 text-xs font-bold text-slate-705 outline-hidden focus:bg-white focus:border-blue-500 transition-all"
                    />
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Equipos del Checklist ({formChecklistItems.length})
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nuevo equipo (Ej. Muffas NPT1)..."
                        value={newItemName}
                        onChange={e => setNewItemName(e.target.value)}
                        className="flex-1 rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-bold text-slate-700 outline-hidden"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddChecklistItem(); } }}
                      />
                      <button
                        type="button"
                        onClick={handleAddChecklistItem}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 text-xs font-black flex items-center justify-center"
                      >
                        <PlusCircle size={14} className="mr-1" />
                        Añadir
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto mt-2 pr-1">
                      {formChecklistItems.length === 0 ? (
                        <p className="text-[11px] text-slate-450 italic py-2 text-center">Falta añadir equipamiento al checklist.</p>
                      ) : (
                        formChecklistItems.map((item, index) => (
                          <div key={index} className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-150">
                            <span className="text-xs font-bold text-slate-700 font-mono text-[11px]">{index + 1}. {item.itemName}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveChecklistItem(index)}
                              className="text-slate-400 hover:text-red-500 p-1"
                            >
                              <Trash size={12} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* State Active / inactive */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="active"
                    checked={formData.active}
                    onChange={e => setFormData(p => ({ ...p, active: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="active" className="text-xs font-bold text-slate-650 cursor-pointer user-select-none">
                    Paquete Habilitado para Programación
                  </label>
                </div>

              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3.5 text-xs font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-blue-600 py-3.5 text-xs font-black text-white hover:bg-blue-700 transition-colors uppercase tracking-wider shadow-lg shadow-blue-100"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
