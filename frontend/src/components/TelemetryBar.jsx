import React from 'react';
import { Cpu, Zap, Database, Server } from 'lucide-react';

export default function TelemetryBar({ latency, isOnline }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-xs font-mono backdrop-blur">
      <div className="flex items-center gap-2.5 px-2">
        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Zap className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase">Время запроса</div>
          <div className="text-slate-200 font-bold">{latency == null ? 'Нет измерения' : `${latency} мс`}</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-2">
        <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          <Cpu className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase">Признак (Embedding)</div>
          <div className="text-slate-200 font-bold">512-D Float32</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-2">
        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
          <Database className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase">Индекс галереи</div>
          <div className="text-slate-200 font-bold">FAISS IndexFlatIP</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-2">
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Server className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase">Статус сервиса</div>
          <div className={`font-bold flex items-center gap-1 ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className="w-1.5 h-1.5 rounded-full animate-ping bg-current"></span>
            {isOnline ? 'REST API Подключен' : 'Локальный режим'}
          </div>
        </div>
      </div>
    </div>
  );
}
