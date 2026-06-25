import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark';
  compact?: boolean;
}

export default function Logo({ className = "", variant = 'dark', compact = false }: LogoProps) {
  const isLight = variant === 'light';

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* SQM Seal Icon - Direct, transparent background, no borders or circles */}
      <img
        src="/logo-sqm.png"
        alt="SQM Logo"
        className="h-8 w-8 sm:h-9 sm:w-9 object-contain shrink-0"
        referrerPolicy="no-referrer"
      />

      {/* Typography Block */}
      <div className="flex flex-col justify-center min-w-0">
        <span 
          className={`font-black tracking-tight leading-tight text-[13px] sm:text-sm whitespace-nowrap ${
            isLight ? 'text-white' : 'text-slate-900'
          }`}
        >
          Programa de Lavados SQM
        </span>
        
        {!compact && (
          <span 
            className={`font-semibold uppercase tracking-wider text-[10px] mt-0.5 whitespace-nowrap ${
              isLight ? 'text-indigo-200' : 'text-indigo-600'
            }`}
          >
            Control de Lavados DDEE
          </span>
        )}
      </div>
    </div>
  );
}
