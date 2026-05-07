import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark';
}

export default function Logo({ className = "h-8", variant = 'dark' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-2 group">
        <div className="flex flex-col">
            <span className={`text-[12px] font-black tracking-tight leading-none ${variant === 'light' ? 'text-white' : 'text-slate-900'}`}>
              CONTROL DE LAVADOS DDEE
            </span>
            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
              SQM
            </span>
        </div>
      </div>
    </div>
  );
}
