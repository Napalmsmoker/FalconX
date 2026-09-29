import React, { useState, useEffect } from 'react';
import BoundingBoxCanvas from './components/BoundingBoxCanvas';
import CandidateCard from './components/CandidateCard';
import TelemetryBar from './components/TelemetryBar';
import {
  ShieldCheck, AlertTriangle, Download, Sliders, Play,
  RotateCcw, Sparkles, Layers, FileSpreadsheet, Check
} from 'lucide-react';

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [bbox, setBbox] = useState({ x: 50, y: 50, w: 280, h: 190 });
  const [threshold, setThreshold] = useState(0.72);
  const [topK, setTopK] = useState(10);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [latency, setLatency] = useState(null);
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [activeTab, setActiveTab] = useState('single'); // 'single' | 'batch'

  // Проверка доступности реального Python бэкенда в фоне
  useEffect(() => {
    fetch('/api/v1/health')
      .then(res => res.ok && setIsBackendOnline(true))
      .catch(() => setIsBackendOnline(false));
  }, []);

  const handleSearch = async (forcedScenario = null) => {
    if (!selectedFile && !forcedScenario) {
      window.alert('Выберите кадр и выделите автомобиль.');
      return;
    }
    setLoading(true);
    const startTime = performance.now();

    // 1. Попытка выполнить реальный запрос на бэкенд
    if (isBackendOnline && selectedFile && !forcedScenario) {
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('x', bbox.x);
        formData.append('y', bbox.y);
        formData.append('w', bbox.w);
        formData.append('h', bbox.h);
        formData.append('threshold', threshold);
        formData.append('top_k', topK);

        const resp = await fetch('/api/v1/search', { method: 'POST', body: formData });
        if (resp.ok) {
          const data = await resp.json();
          setLatency(Math.round(performance.now() - startTime));
          setResults(data);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('Search request failed', e);
      }
    }

    if (selectedFile && !forcedScenario) {
      setLoading(false);
      window.alert('Сервис недоступен или отклонил запрос. Проверьте BBox и состояние API.');
      return;
    }

    // 2. Демонстрационный движок (для питча и автономной работы без интернета)
    setTimeout(() => {
      const isRefusalTest = forcedScenario === 'refusal' || (forcedScenario !== 'match' && threshold > 0.78);
      const topScore = isRefusalTest ? 0.61 : 0.884;
      const isRefusal = topScore < threshold;

      setLatency(null);

      if (isRefusal) {
        setResults({
          demo: true,
          status: 'refusal',
          threshold,
          best_score: topScore,
          candidates: [],
        });
      } else {
        const angles = ['Фронт (Камера 04)', 'Правый борт (Камера 12)', 'Корма (Камера 08)', '3/4 Фронт (Камера 19)', 'Левый борт (Камера 02)'];
        const mockCandidates = Array.from({ length: topK }).map((_, i) => {
          const score = Number((topScore - i * 0.043).toFixed(4));
          const isCar = i % 2 === 0;

          // Автономный SVG высокого качества
          const carSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="100%" height="100%" fill="%23090d16"/><rect x="60" y="70" width="280" height="150" rx="18" fill="%231e293b" stroke="%2338bdf8" stroke-width="2"/><circle cx="120" cy="220" r="28" fill="%230284c7"/><circle cx="280" cy="220" r="28" fill="%230284c7"/><rect x="90" y="100" width="80" height="60" rx="8" fill="%23334155"/><rect x="230" y="100" width="80" height="60" rx="8" fill="%23334155"/><text x="50%" y="36%" dominant-baseline="middle" text-anchor="middle" fill="%2338bdf8" font-size="18" font-weight="bold" font-family="sans-serif">Кандидат #${i + 1}</text><text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="13" font-family="sans-serif">ReID Score: ${score}</text></svg>`;

          // Grad-CAM слой внимания (активация характерных признаков кузова)
          const camSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="100%" height="100%" fill="transparent"/><circle cx="130" cy="140" r="65" fill="%23ef4444" opacity="0.75"/><circle cx="270" cy="140" r="65" fill="%23ef4444" opacity="0.75"/><ellipse cx="200" cy="165" rx="100" ry="45" fill="%23eab308" opacity="0.6"/><text x="50%" y="88%" dominant-baseline="middle" text-anchor="middle" fill="%23f43f5e" font-size="16" font-weight="bold" font-family="sans-serif">Grad-CAM Активация</text></svg>`;

          return {
            rank: i + 1,
            vehicle_id: `veh_msk_${9412 + i * 23}`,
            camera_id: `CAM_MKAD_${108 + i * 4}`,
            score: score,
            timestamp: `14:3${i}:2${i}`,
            view_angle: angles[i % angles.length],
            image_url: carSvg,
            heatmap_url: camSvg,
          };
        });

        setResults({
          demo: true,
          status: 'matched',
          threshold,
          best_score: topScore,
          candidates: mockCandidates,
        });
      }
      setLoading(false);
    }, 400);
  };

  // Interactive searches do not contain the full ordered test split.
  const exportArtifact = (type) => {
    window.alert(`${type}.csv для сдачи формируется по всему тестовому набору. Используйте файл из папки artifacts после запуска generate_submission.py — инструкция в README.`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#070a12] text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Шапка системы */}
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md px-6 py-3.5 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 to-cyan-500 flex items-center justify-center font-black text-white shadow-lg shadow-blue-500/20 text-base">
            Ф
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider uppercase text-slate-100">
                ФАЛЬКОН // СЕРВИС ЦИФРОВОГО ПРИЗНАКА ТС
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 font-mono">
                Open-set ReID
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Повторная идентификация автомобиля на непересекающихся камерах без использования ГРЗ
            </p>
          </div>
        </div>

        {/* Быстрые демо-сценарии для защиты перед жюри */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 hidden sm:inline mr-1 font-mono">Демо-сценарии:</span>
          <button
            onClick={() => { setThreshold(0.72); handleSearch('match'); }}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" /> Совпадение (Top-1)
          </button>
          <button
            onClick={() => { setThreshold(0.85); handleSearch('refusal'); }}
            className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Режим отказа (TNR)
          </button>
        </div>
      </header>

      {/* Основная рабочая область */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto p-5 flex flex-col gap-4">
        {/* Панель системной телеметрии */}
        <TelemetryBar latency={latency} isOnline={isBackendOnline} />

        <div className="grid grid-cols-12 gap-5 flex-1">
          {/* Левая колонка: Кадр, Разметка BBox и Параметры */}
          <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
            <BoundingBoxCanvas onImageSelect={setSelectedFile} bbox={bbox} setBbox={setBbox} />

            {/* Настройки порога и отсечения */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 backdrop-blur shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  Параметры векторного отсечения (Refusal)
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold">
                  τ = {threshold}
                </span>
              </div>

              <div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.01"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 bg-slate-800 h-2 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>0.0 (Выдавать всё)</span>
                  <span className="text-cyan-400">Оптимум валидации: 0.72 - 0.75</span>
                  <span>1.0 (Строгий отбор)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Размер выдачи (Top-N):</span>
                  <select
                    value={topK}
                    onChange={(e) => setTopK(parseInt(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none"
                  >
                    <option value={5}>Top 5 кандидатов</option>
                    <option value={10}>Top 10 (по стандарту ТЗ)</option>
                  </select>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Метрика близости:</span>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-mono">
                    Cosine (L2-norm)
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleSearch()}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs transition duration-150 shadow-lg shadow-blue-500/20 cursor-pointer mt-1"
              >
                <Play className="w-4 h-4 fill-white" />
                {loading ? 'Извлечение признака и ANN-поиск...' : 'Сформировать признак и сопоставить'}
              </button>
            </div>
          </div>

          {/* Правая колонка: Результаты поиска и Экспорт */}
          <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col backdrop-blur">
              {/* Шапка панели выдачи */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Ранжирование галереи объектов
                  </h2>
                </div>

                {/* Кнопки скачивания артефактов сдачи ТЗ */}
                {results && results.candidates && results.candidates.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => exportArtifact('submission')}
                      className="bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 border border-slate-800 font-mono transition cursor-pointer"
                      title="Как получить submission.csv для полного тестового набора"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-400" />
                      О submission.csv
                    </button>
                    <button
                      onClick={() => exportArtifact('candidates')}
                      className="bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 border border-slate-800 font-mono transition cursor-pointer"
                      title="Как получить candidates.csv для полного тестового набора"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      О candidates.csv
                    </button>
                  </div>
                )}
              </div>

              {results?.demo && (
                <div className="mb-3 text-amber-300 text-xs">Демонстрационный сценарий: изображения и оценки синтетические.</div>
              )}
              {/* Баннер: Успешное сопоставление */}
              {results && results.status === 'matched' && (
                <div className="mb-3.5 p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1 rounded bg-emerald-500/20 text-emerald-400">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold">Найдены кандидаты по сходству</span>
                      <span className="text-slate-400 block text-[11px]">Лучшее косинусное сходство: <b>{results.best_score.toFixed(3)}</b>. Это не вероятность идентичности.</span>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-500/20">
                    Top-1 ≥ порог
                  </span>
                </div>
              )}

              {/* Баннер: Режим отказа (Refusal) */}
              {results && results.status === 'refusal' && (
                <div className="mb-3.5 p-4 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-300 text-xs flex flex-col gap-1.5">
                  <div className="font-bold text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    АКТИВИРОВАН РЕЖИМ ОТКАЗА (Refusal Mode)
                  </div>
                  <div className="text-slate-300 text-[11px] leading-relaxed">
                    Максимальная схожесть ближайшего объекта в галерее (score: <span className="font-mono text-amber-400 font-bold">{results.best_score}</span>)
                    находится ниже обоснованного порога отсечения (τ = <span className="font-mono text-cyan-400 font-bold">{results.threshold}</span>).
                    Сервис аргументированно возвращает пустой ответ, предотвращая ложноположительное сопоставление (TNR-валидация).
                  </div>
                </div>
              )}

              {/* Сетка кандидатов с Grad-CAM инспекцией */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 overflow-y-auto max-h-[620px] pr-1">
                {results && results.candidates && results.candidates.length > 0 ? (
                  results.candidates.map((cand) => (
                    <CandidateCard key={cand.rank} candidate={cand} threshold={threshold} />
                  ))
                ) : (
                  <div className="col-span-2 text-center py-28 text-slate-500 text-xs flex flex-col items-center gap-2">
                    <Layers className="w-8 h-8 text-slate-700 stroke-[1.5]" />
                    <span>Ожидание запуска. Загрузите кадр или нажмите быстрый демо-сценарий в шапке.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
