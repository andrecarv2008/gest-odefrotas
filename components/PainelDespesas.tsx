'use client';
import React from 'react';
import { Chart, registerables } from 'chart.js';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas-pro';
import markup from './despesas/panel.html?raw';
import css from './despesas/panel.css?raw';
import dadosRaw from './despesas/dados.json?raw';
import run from './despesas/panel.js';
import { kvGet, kvSet } from '@/lib/idbkv';

Chart.register(...registerables);

export default function PainelDespesas() {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let dead = false;
    const w = window as any;
    w.Chart = Chart; w.XLSX = XLSX; w.html2canvas = html2canvas;
    w.__dspRaw = dadosRaw;
    w.__dspPersist = (d: any) => { kvSet('despesas', d); };
    if (!document.getElementById('dsp-plex')) {
      const l = document.createElement('link');
      l.id = 'dsp-plex'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap';
      document.head.appendChild(l);
    }
    (async () => {
      if (!w.__dspCur) {
        let saved = await kvGet('despesas');
        if (!saved) {
          // base salva pela versão anterior (banco próprio)
          try {
            saved = await new Promise<any>(res => {
              const r = indexedDB.open('gm_despesas', 1);
              r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
              r.onsuccess = () => { try { const q = r.result.transaction('kv').objectStore('kv').get('base'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch { res(null); } };
              r.onerror = () => res(null);
            });
          } catch { saved = null; }
        }
        if (saved && saved.cols && saved.dic) w.__dspCur = saved;
      }
      if (dead) return;
      run();
    })();
    return () => { dead = true; };
  }, []);
  return (
    <>
      <style>{css}</style>
      <div id="dsp" ref={ref} dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}
