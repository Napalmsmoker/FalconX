import React, { useRef, useState, useEffect } from 'react';
import { Upload, Crosshair } from 'lucide-react';

export default function BoundingBoxCanvas({ onImageSelect, bbox, setBbox }) {
  const [imageSrc, setImageSrc] = useState(null);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target.result);
      onImageSelect(file);
    };
    reader.readAsDataURL(file);
  };

  const drawBox = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.naturalWidth) return;

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = img.clientWidth / img.naturalWidth;
    const scaleY = img.clientHeight / img.naturalHeight;

    if (bbox.w > 0 && bbox.h > 0) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.strokeRect(bbox.x * scaleX, bbox.y * scaleY, bbox.w * scaleX, bbox.h * scaleY);
      ctx.fillRect(bbox.x * scaleX, bbox.y * scaleY, bbox.w * scaleX, bbox.h * scaleY);
    }
  };

  useEffect(() => {
    drawBox();
  }, [bbox, imageSrc]);

  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    setStartPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setIsDrawing(true);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currX = e.clientX - rect.left;
    const currY = e.clientY - rect.top;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(startPos.x, startPos.y, currX - startPos.x, currY - startPos.y);
  };

  const handleMouseUp = (e) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const rect = canvasRef.current.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    const rx = Math.min(startPos.x, endX) * scaleX;
    const ry = Math.min(startPos.y, endY) * scaleY;
    const rw = Math.abs(endX - startPos.x) * scaleX;
    const rh = Math.abs(endY - startPos.y) * scaleY;

    if (rw > 20 && rh > 20) {
      setBbox({
        x: Math.round(rx),
        y: Math.round(ry),
        w: Math.round(rw),
        h: Math.round(rh),
      });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Crosshair className="w-4 h-4 text-blue-400" />
          Разметка Bounding Box
        </span>
        <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition">
          <Upload className="w-3.5 h-3.5" />
          Выбрать кадр
          <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </label>
      </div>

      <div className="relative border border-slate-800 bg-slate-950 rounded-lg min-h-[300px] flex items-center justify-center overflow-hidden">
        {imageSrc ? (
          <div className="relative inline-block">
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Query Frame"
              className="max-h-[460px] object-contain block select-none pointer-events-none"
              onLoad={drawBox}
            />
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="absolute inset-0 cursor-crosshair"
            />
          </div>
        ) : (
          <p className="text-xs text-slate-500">Загрузите кадр для выбора транспортного средства</p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 text-[11px] font-mono">
        <div className="bg-slate-950 p-2 rounded border border-slate-800 text-slate-400">
          X: <span className="text-cyan-400 font-bold">{bbox.x}</span>
        </div>
        <div className="bg-slate-950 p-2 rounded border border-slate-800 text-slate-400">
          Y: <span className="text-cyan-400 font-bold">{bbox.y}</span>
        </div>
        <div className="bg-slate-950 p-2 rounded border border-slate-800 text-slate-400">
          W: <span className="text-cyan-400 font-bold">{bbox.w}</span>
        </div>
        <div className="bg-slate-950 p-2 rounded border border-slate-800 text-slate-400">
          H: <span className="text-cyan-400 font-bold">{bbox.h}</span>
        </div>
      </div>
    </div>
  );
}