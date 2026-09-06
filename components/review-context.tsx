'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { initialNetwork, validateNetwork } from '@/lib/network-policy';
import type {
  NetworkState,
  NetworkDecision,
  Scenario,
  Target,
} from '@/lib/network-policy';
import { normalizeDomain } from '@/lib/parental-policy';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSession } from './session-gate';
export type ReviewEvent = {
  id: number;
  scenario: Scenario;
  decision: NetworkDecision;
  createdAt: string;
  acknowledged: boolean;
  notification: boolean;
};
export type Snapshot = {
  state: NetworkState;
  revision: number;
  savedAt: string;
  events: ReviewEvent[];
  canRestore: boolean;
};
export async function api(path: string, body?: unknown) {
  const response = await fetch(
    '/review-api/' + path,
    body === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Super-Pihole-Review': '1',
          },
          body: JSON.stringify(body),
        },
  );
  if (response.status === 401) window.dispatchEvent(new Event('super-pi-hole-session-expired'));
  const result = (await response.json()) as Partial<Snapshot> & {
    error?: string;
    decision?: NetworkDecision;
  };
  if (!response.ok)
    throw new Error(
      result.error ??
        'The local review service could not complete this request.',
    );
  if (
    !result ||
    !Number.isInteger(result.revision) ||
    !Array.isArray(result.events) ||
    typeof result.savedAt !== 'string' ||
    typeof result.canRestore !== 'boolean'
  )
    throw new Error(
      'The review service returned an incomplete response. Settings were not loaded.',
    );
  const validated = validateNetwork(result.state);
  return { ...result, state: validated } as Snapshot & {
    decision?: NetworkDecision;
  };
}
export const nowInput = () => new Date().toISOString().slice(0, -1);
function useReviewStore() {
  const session = useSession();
  const editVersion = useRef(0);
  const [state, setState] = useState(initialNetwork),
    [revision, setRevision] = useState(0),
    [events, setEvents] = useState<ReviewEvent[]>([]),
    [savedAt, setSavedAt] = useState(''),
    [canRestore, setCanRestore] = useState(false);
  const [section, setSection] = useState(session.mode === 'server-test' ? 'Live Pi-hole' : 'Overview'),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState('Loading local review settings…'),
    [error, setError] = useState('');
  const [focusDevice, setFocusDevice] = useState('all');
  function accept(data: Snapshot, expectedEdit = editVersion.current) {
    // A response must never discard edits entered while its request was in flight.
    if (editVersion.current === expectedEdit) {
      setState(data.state);
      setDirty(false);
    }
    setRevision(data.revision);
    setEvents(data.events);
    setSavedAt(data.savedAt);
    setCanRestore(data.canRestore);
    setReady(true);
  }
  useEffect(() => {
    let mounted = true;
    api('state')
      .then((data) => {
        if (mounted) {
          accept(data);
          setMessage(
            'Review settings loaded from this app’s database. Live Pi-hole settings are separate.',
          );
        }
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      });
    return () => {
      mounted = false;
    };
  }, []);
  function change(next: NetworkState) {
    editVersion.current += 1;
    setState(next);
    setDirty(true);
    setError('');
    setMessage('Unsaved review changes. No network settings have changed.');
  }
  async function perform(action: () => void | Promise<void>) {
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review action failed.');
    }
  }
  async function save() {
    validateNetwork(state);
    const savingEdit = editVersion.current;
    const result: Snapshot = await api('save', { state, revision });
    accept(result, savingEdit);
    setMessage(
      editVersion.current === savingEdit
        ? 'Saved in the local database. Live Pi-hole is unchanged.'
        : 'Earlier changes saved. Your newer edits are still unsaved.',
    );
    return result;
  }
  async function saveClick() {
    setBusy(true);
    await perform(async () => {
      await save();
    });
    setBusy(false);
  }
  async function test(scenario: Scenario) {
    const testingEdit = editVersion.current;
    const saved = dirty ? await save() : { revision };
    const result = await api('test', {
      scenario: {
        ...scenario,
        domain: normalizeDomain(scenario.domain),
        at: new Date(
          scenario.at.endsWith('Z') ? scenario.at : scenario.at + 'Z',
        ).toISOString(),
      },
      revision: saved.revision,
    });
    accept(result, testingEdit);
    setMessage('Synthetic policy test recorded. No DNS request was made.');
    if (!result.decision) throw new Error('No policy decision was returned.');
    return result.decision;
  }
  function exportState() {
    perform(() => {
      validateNetwork(state);
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(state, null, 2)], {
            type: 'application/json',
          }),
        ),
        link = document.createElement('a');
      link.href = url;
      link.download = 'super-pi-hole-review-settings.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Exported review settings—not a Pi-hole deployment file.');
    });
  }
  return {
    state,
    revision,
    events,
    savedAt,
    canRestore,
    section,
    setSection,
    ready,
    busy,
    setBusy,
    dirty,
    message,
    setMessage,
    error,
    setError,
    focusDevice,
    setFocusDevice,
    accept,
    change,
    perform,
    save,
    saveClick,
    test,
    exportState,
    setEvents,
  };
}
const Context = createContext<ReturnType<typeof useReviewStore> | null>(null);
export function ReviewProvider({ children }: { children: ReactNode }) {
  const value = useReviewStore();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useReview() {
  const value = useContext(Context);
  if (!value) throw new Error('Review provider missing.');
  return value;
}
export function Field({
  label,
  children,
  id,
}: {
  label: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className="nc-field">
      {id ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}
      {children}
    </div>
  );
}
export function TextField({
  label,
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <Field label={label} id={id}>
      <Input
        id={id}
        value={value}
        type={type}
        step={type === 'datetime-local' ? '0.001' : undefined}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(v) => {
          if (v !== null) onChange(v);
        }}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue>
            {options.find((o) => o.value === value)?.label ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <div className="nc-toggle">
      <div>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </div>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
export function Header({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-head nc-heading">
      <div>
        <p className="eyebrow">SUPER PI HOLE / LOCAL REVIEW</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="nc-empty">{children}</p>;
}
export function ResultBadge({ action }: { action: string }) {
  return (
    <span
      className={
        'badge ' +
        (action === 'block' ? 'red' : action === 'allow' ? 'green' : 'amber')
      }
    >
      {action === 'block'
        ? 'Would block'
        : action === 'allow'
          ? 'Would allow'
          : 'Restricted'}
    </span>
  );
}
export function useTargets() {
  const { state } = useReview();
  const options = [
    { value: 'all:', label: 'All devices' },
    ...state.groups.map((g) => ({
      value: 'group:' + g.id,
      label: 'Group: ' + g.name,
    })),
    ...state.devices.map((d) => ({
      value: 'device:' + d.id,
      label: 'Device: ' + d.name,
    })),
  ];
  return {
    options,
    label: (t: Target) =>
      options.find((o) => o.value === t.type + ':' + t.id)?.label ??
      'Unknown target',
  };
}
export function TargetChoice({
  value,
  onChange,
}: {
  value: Target;
  onChange: (t: Target) => void;
}) {
  const { options } = useTargets();
  return (
    <Choice
      label="Applies to"
      value={value.type + ':' + value.id}
      options={options}
      onChange={(v) => {
        const i = v.indexOf(':');
        onChange({ type: v.slice(0, i) as Target['type'], id: v.slice(i + 1) });
      }}
    />
  );
}
