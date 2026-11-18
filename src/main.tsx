declare const __VIEWER__: boolean;
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { installLocalServer } from './localServer';
import Home from '../app/page';

installLocalServer();
createRoot(document.getElementById('root')!).render(<Home />);

try { if (__VIEWER__) document.documentElement.classList.add('gm-viewer'); } catch {}
