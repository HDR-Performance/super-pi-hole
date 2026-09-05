import { createRoot } from 'react-dom/client';
import { NetworkConsole } from '../components/network-console';
import { SessionGate } from '../components/session-gate';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<SessionGate><NetworkConsole /></SessionGate>);
