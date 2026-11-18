import * as XLSX from 'xlsx';
import { notify } from './ui';

export type SaveStatus = 'saved' | 'declined' | 'fallback' | 'error';

/** Salva um arquivo: usa a capacidade "downloads" do Claude quando existe, senão o download normal do navegador. */
export async function saveFile(filename: string, data: Blob | string): Promise<SaveStatus> {
  try {
    const c = (window as any).claude;
    const dl = c && c.use ? await c.use('downloads') : null;
    if (dl) {
      await dl.save({ filename, data });
      notify('Arquivo salvo: ' + filename);
      return 'saved';
    }
  } catch (e: any) {
    if (e && e.code === 'declined') { notify('Download cancelado.'); return 'declined'; }
    if (e && e.code && e.code !== 'unavailable' && e.code !== 'not_granted') {
      notify('Não foi possível salvar o arquivo (' + e.code + ').');
      return 'error';
    }
  }
  try {
    const blob = typeof data === 'string' ? new Blob([data]) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    notify('Download iniciado: ' + filename);
    return 'fallback';
  } catch {
    notify('Não foi possível gerar o download.');
    return 'error';
  }
}

export function saveWorkbook(wb: XLSX.WorkBook, filename: string) {
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return saveFile(filename, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export function saveRowsXlsx(filename: string, sheet: string, rows: (string | number)[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet.slice(0, 31));
  return saveWorkbook(wb, filename);
}
