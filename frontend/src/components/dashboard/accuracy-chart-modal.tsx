"use client";

import { useEffect, useRef } from "react";
import { X, Download } from "lucide-react";
import type { GradeCountsOut } from "@/lib/types";
import { apiUrlWithWorkspace } from "@/lib/api/client";

// plotperfect constants
const PALETTE = ["#2A79DB", "#DE8F05", "#029E73", "#D55E00", "#CC78BC", "#CA9161", "#FBAFE4", "#949494", "#ECE133", "#56B4E9"];
const HATCH_COLOR = "#FFFFFF";
const BAR_EDGE_WIDTH = 1.5;
const COLOR_GRID = "#E0E0E0";
const COLOR_SPINE = "#333333";
const COLOR_BG = "#FFFFFF";
const COLOR_ANNOT = "#333333";
const FONT_SIZE = 14;
const ANNOT_SIZE = 11;

const SERIES_COLORS = [PALETTE[0], PALETTE[1], PALETTE[3]]; // blue, orange, red
const SERIES_LABELS = ["Correct", "Partial", "Wrong"];

interface RunData {
  label: string;
  gradeCounts: GradeCountsOut;
}

interface Props {
  open: boolean;
  onClose: () => void;
  runs: RunData[];
  runIds: number[];
}

function drawHatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, patternIdx: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = HATCH_COLOR;
  ctx.lineWidth = 1;

  const spacing = 6;
  if (patternIdx === 0) {
    // diagonal lines ////
    for (let i = -h; i < w + h; i += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + h, y);
      ctx.stroke();
    }
  } else if (patternIdx === 1) {
    // dots ....
    for (let dx = spacing / 2; dx < w; dx += spacing) {
      for (let dy = spacing / 2; dy < h; dy += spacing) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = HATCH_COLOR;
        ctx.fill();
      }
    }
  } else {
    // cross xxxx
    for (let i = -h; i < w + h; i += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + h, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + h, y + h);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawChart(canvas: HTMLCanvasElement, runs: RunData[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const isSingle = runs.length === 1;
  // Measure longest label to size the canvas
  const maxLabelLen = isSingle ? 0 : Math.max(...runs.map((r) => r.label.length));
  const perGroup = Math.max(120, maxLabelLen * 9 + 40);
  const W = isSingle ? 700 : Math.max(700, runs.length * perGroup + 120);
  const bottomMargin = 80;
  const H = 450;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.scale(dpr, dpr);

  // Clear
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, W, H);

  const margin = { top: 50, right: 30, bottom: bottomMargin, left: 60 };
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;

  // Compute max value for y-axis
  let maxVal = 0;
  for (const r of runs) {
    maxVal = Math.max(maxVal, r.gradeCounts.correct, r.gradeCounts.partial, r.gradeCounts.wrong);
  }
  maxVal = Math.ceil(maxVal * 1.25) || 1;

  // Draw grid
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 0.8;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = margin.top + plotH - (i / gridLines) * plotH;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + plotW, y);
    ctx.stroke();

    // Y tick labels
    ctx.fillStyle = COLOR_ANNOT;
    ctx.font = `${FONT_SIZE - 2}px "DM Sans", sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.round((i / gridLines) * maxVal)), margin.left - 8, y);
  }

  // Draw spines
  ctx.strokeStyle = COLOR_SPINE;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(margin.left + plotW, margin.top + plotH);
  ctx.stroke();

  // Title
  ctx.fillStyle = COLOR_SPINE;
  ctx.font = `bold ${FONT_SIZE}px "DM Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const title = isSingle ? `Accuracy — ${runs[0].label}` : "Accuracy Comparison";
  ctx.fillText(title, W / 2, 15);

  // Y label
  ctx.save();
  ctx.translate(15, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `bold ${FONT_SIZE}px "DM Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Count", 0, 0);
  ctx.restore();

  if (isSingle) {
    // 3 bars: Correct, Partial, Wrong
    const gc = runs[0].gradeCounts;
    const values = [gc.correct, gc.partial, gc.wrong];
    const barW = Math.min(plotW / 5, 80);
    const gap = (plotW - barW * 3) / 4;

    for (let i = 0; i < 3; i++) {
      const x = margin.left + gap + i * (barW + gap);
      const barH = (values[i] / maxVal) * plotH;
      const y = margin.top + plotH - barH;

      ctx.fillStyle = SERIES_COLORS[i];
      ctx.fillRect(x, y, barW, barH);
      drawHatch(ctx, x, y, barW, barH, i);
      ctx.strokeStyle = HATCH_COLOR;
      ctx.lineWidth = BAR_EDGE_WIDTH;
      ctx.strokeRect(x, y, barW, barH);

      // Annotation
      const pct = gc.total > 0 ? ((values[i] / gc.total) * 100).toFixed(1) : "0.0";
      ctx.fillStyle = COLOR_ANNOT;
      ctx.font = `${ANNOT_SIZE}px "DM Sans", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${pct}%`, x + barW / 2, y - 4);
      ctx.fillText(`(${values[i]}/${gc.total})`, x + barW / 2, y - 4 - ANNOT_SIZE - 2);

      // X label
      ctx.fillStyle = COLOR_SPINE;
      ctx.font = `${FONT_SIZE - 2}px "DM Sans", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(SERIES_LABELS[i], x + barW / 2, margin.top + plotH + 8);
    }
  } else {
    // Grouped bars: each run is a group, 3 bars per group
    const nGroups = runs.length;
    const groupW = plotW / (nGroups + 1);
    const barW = Math.min(groupW / 4.5, 35);
    const innerGap = barW * 0.15;

    for (let g = 0; g < nGroups; g++) {
      const gc = runs[g].gradeCounts;
      const values = [gc.correct, gc.partial, gc.wrong];
      const groupCenter = margin.left + (g + 1) * groupW;
      const groupStart = groupCenter - (3 * barW + 2 * innerGap) / 2;

      for (let s = 0; s < 3; s++) {
        const x = groupStart + s * (barW + innerGap);
        const barH = (values[s] / maxVal) * plotH;
        const y = margin.top + plotH - barH;

        ctx.fillStyle = SERIES_COLORS[s];
        ctx.fillRect(x, y, barW, barH);
        drawHatch(ctx, x, y, barW, barH, s);
        ctx.strokeStyle = HATCH_COLOR;
        ctx.lineWidth = BAR_EDGE_WIDTH;
        ctx.strokeRect(x, y, barW, barH);

        // Annotation
        ctx.fillStyle = COLOR_ANNOT;
        ctx.font = `${ANNOT_SIZE}px "DM Sans", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(String(values[s]), x + barW / 2, y - 4);
      }

      // Group label — horizontal
      ctx.fillStyle = COLOR_SPINE;
      ctx.font = `${FONT_SIZE - 2}px "DM Sans", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(runs[g].label, groupCenter, margin.top + plotH + 8);
    }
  }

  // Legend at bottom
  const legendY = H - 25;
  const legendItemW = 100;
  const legendStartX = W / 2 - (3 * legendItemW) / 2;
  for (let i = 0; i < 3; i++) {
    const lx = legendStartX + i * legendItemW;
    const boxSize = 14;

    ctx.fillStyle = SERIES_COLORS[i];
    ctx.fillRect(lx, legendY - boxSize / 2, boxSize, boxSize);
    drawHatch(ctx, lx, legendY - boxSize / 2, boxSize, boxSize, i);
    ctx.strokeStyle = HATCH_COLOR;
    ctx.lineWidth = BAR_EDGE_WIDTH;
    ctx.strokeRect(lx, legendY - boxSize / 2, boxSize, boxSize);

    ctx.fillStyle = COLOR_SPINE;
    ctx.font = `${FONT_SIZE - 2}px "DM Sans", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(SERIES_LABELS[i], lx + boxSize + 6, legendY);
  }
}

export function AccuracyChartModal({ open, onClose, runs, runIds }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (open && canvasRef.current) {
      drawChart(canvasRef.current, runs);
    }
  }, [open, runs]);

  if (!open) return null;

  const handleDownloadHD = () => {
    const url = apiUrlWithWorkspace(`/api/charts/accuracy?run_ids=${runIds.join(",")}`);
    window.open(url, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-lg max-w-[90vw] w-fit mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-brand-dark">Accuracy Chart</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex justify-center overflow-x-auto">
          <canvas ref={canvasRef} />
        </div>
        <div className="flex mt-4 justify-end">
          <button
            onClick={handleDownloadHD}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-brand text-white hover:bg-brand/90"
          >
            <Download className="w-4 h-4" /> Download HD
          </button>
        </div>
      </div>
    </div>
  );
}
