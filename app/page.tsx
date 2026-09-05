import { NetworkConsole } from '@/components/network-console';
import { SessionGate } from '@/components/session-gate';
export default function Home() {
  return <SessionGate><NetworkConsole /></SessionGate>;
}
