import React, { useState } from 'react';
import { Eye, Flame, MapPin, Clock, Camera, CheckCircle2, XCircle } from 'lucide-react';

export default function CandidateCard({ candidate, threshold, onInspect }) {
  const [camOpacity, setCamOpacity] = useState(0);
  const isAccepted = candidate.score >= threshold;

  return (
    <div className={`bg-slate-950/80 border rounded-xl p-3.5 flex flex-col gap-3 transition-all duration-200 backdrop-blur ${
      isAccepted
        ? 'border-slate-800 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10'
        : 'border-rose-950/40 opacity-75 hover:opacity-100'
    }`}>
      {/* Шапка карточки */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-mono font-bold text-[11px]">
            {candidate.rank}
          </span>
          <span className="font-mono text-slate-300 font-semibold">{candidate.vehicle_id ?? candidate.image_id}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono">
          <span className="text-[10px] text-slate-500">Сходство:</span>
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
            isAccepted ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
          }`}>
            {(candidate.score * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Контейнер снимка с наложением Grad-CAM */}
      <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-900 h-40 flex items-center justify-center group">
        {/* Базовое фото автомобиля */}
        <img
          src={candidate.image_url}
          alt="Candidate"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Слой Grad-CAM с управляемой прозрачностью */}
        {candidate.heatmap_url && <img
          src={candidate.heatmap_url}
          alt="Grad-CAM"
          style={{ opacity: camOpacity }}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-150 mix-blend-screen"
        />}

        {/* Плашка ракурса и кросс-камеры */}
        <div className="absolute top-2 left-2 flex gap-1">
          <span className="bg-slate-900/80 backdrop-blur text-[10px] text-cyan-300 px-2 py-0.5 rounded border border-slate-700 font-mono">
            {candidate.view_angle || 'Ракурс неизвестен'}
          </span>
        </div>

        {/* Статус отсечения */}
        <div className="absolute top-2 right-2">
          {isAccepted ? (
            <span className="flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 text-[10px] px-2 py-0.5 rounded-full backdrop-blur">
              <CheckCircle2 className="w-3 h-3" /> Принят
            </span>
          ) : (
            <span className="flex items-center gap-1 bg-rose-950/80 text-rose-400 border border-rose-500/40 text-[10px] px-2 py-0.5 rounded-full backdrop-blur">
              <XCircle className="w-3 h-3" /> Отсечен
            </span>
          )}
        </div>

        {/* Быстрое управление Grad-CAM прямо на карточке */}
        {candidate.heatmap_url && <div className="absolute bottom-2 inset-x-2 bg-slate-950/80 backdrop-blur rounded-md p-1.5 border border-slate-800 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Flame className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={camOpacity}
            onChange={(e) => setCamOpacity(parseFloat(e.target.value))}
            className="w-full h-1 bg-slate-800 rounded accent-purple-500 cursor-pointer"
            title="Прозрачность Grad-CAM"
          />
          <span className="text-[10px] font-mono text-purple-300 shrink-0">
            {Math.round(camOpacity * 100)}%
          </span>
        </div>}
      </div>

      {/* Метаданные съемки */}
      <div className="grid grid-cols-2 text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-900">
        <span className="flex items-center gap-1">
          <Camera className="w-3 h-3 text-slate-500" /> {candidate.camera_id ?? 'Камера неизвестна'}
        </span>
        <span className="flex items-center gap-1 justify-end">
          <Clock className="w-3 h-3 text-slate-500" /> {candidate.timestamp ?? 'Время неизвестно'}
        </span>
      </div>
    </div>
  );
}
