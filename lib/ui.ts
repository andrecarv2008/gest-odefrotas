// Avisos e confirmações dentro da própria página (o visualizador do Claude bloqueia alert/confirm).
function host(): HTMLElement {
  let h = document.getElementById('gm-ui-host');
  if (!h) { h = document.createElement('div'); h.id = 'gm-ui-host'; document.body.appendChild(h); }
  return h;
}

export function notify(msg: string, ms = 4200) {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:300;background:#0b1c30;color:#fff;padding:12px 18px;border-radius:10px;font:600 13px Manrope,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:min(92vw,520px)';
  el.textContent = msg;
  host().appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function askConfirm(message: string, okLabel = 'Confirmar'): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(10,14,13,.55);display:flex;align-items:center;justify-content:center;padding:20px';
    const box = document.createElement('div');
    box.setAttribute('role', 'alertdialog');
    box.style.cssText = 'background:#fff;color:#0b1c30;border-radius:14px;max-width:440px;width:100%;padding:22px;font:500 14px/1.5 Manrope,system-ui,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.35)';
    const p = document.createElement('p'); p.style.cssText = 'margin:0 0 18px;font-weight:600'; p.textContent = message;
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
    const mk = (label: string, primary: boolean, val: boolean) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.style.cssText = 'font:700 13px Manrope,system-ui,sans-serif;padding:9px 16px;border-radius:8px;cursor:pointer;border:1px solid ' + (primary ? '#ab0b1c;background:#ab0b1c;color:#fff' : '#c9d0cd;background:#fff;color:#27302d');
      b.onclick = () => { wrap.remove(); resolve(val); };
      return b;
    };
    const cancel = mk('Cancelar', false, false), ok = mk(okLabel, true, true);
    row.append(cancel, ok); box.append(p, row); wrap.append(box); host().appendChild(wrap);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) { wrap.remove(); resolve(false); } });
    ok.focus();
  });
}
