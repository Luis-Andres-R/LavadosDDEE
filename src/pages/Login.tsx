import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo';

export default function Login() {
  const { login } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4 font-sans">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="bg-white p-10 text-center">
          <div className="flex justify-center mb-6">
            <Logo className="h-16" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">DDEE Lavados</h1>
          <p className="mt-2 text-sm font-medium text-slate-400 uppercase tracking-widest">Sistema de Gestión Minera</p>
        </div>

        <div className="p-10">
          <div className="mb-10 flex items-center gap-4 rounded-2xl bg-blue-50 p-5 text-blue-900 border border-blue-100">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <ShieldCheck size={24} />
            </div>
            <p className="text-xs font-bold uppercase tracking-wide leading-relaxed">Acceso restringido para personal autorizado.</p>
          </div>

          <button
            onClick={login}
            className="flex w-full items-center justify-center gap-4 rounded-2xl border-2 border-slate-100 bg-white py-4.5 font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-200 hover:shadow-md active:scale-95"
          >
            <img 
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
              alt="Google" 
              className="h-6 w-6"
            />
            Iniciar sesión con Google
          </button>
          
          <div className="mt-12 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">© 2026 Operaciones Mineras DDEE</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
