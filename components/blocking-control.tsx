'use client';
import { useEffect, useState } from 'react';
import { Pause, Play, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Choice, Field } from './review-context';
import type { Pending } from './live-pihole';
import {
  durationLabel,
  pauseSelection,
  remainingSeconds,
} from '@/lib/blocking-control.mjs';

export function BlockingControl({
  state,
  snapshotId,
  locked,
  confirm,
  refresh,
}: {
  state?: { blocking: string; timer: number | null };
  snapshotId: string;
  locked: boolean;
  confirm: (pending: Pending) => void;
  refresh: () => void;
}) {
  const [duration, setDuration] = useState('300');
  const [amount, setAmount] = useState('15');
  const [unit, setUnit] = useState('minutes');
  const [countdown, setCountdown] = useState<{ snapshotId: string; value: number } | null>(null);
  const remaining = countdown?.snapshotId === snapshotId ? countdown.value : null;
  const timer =
    typeof state?.timer === 'number' &&
    Number.isFinite(state.timer) &&
    state.timer >= 0
      ? state.timer
      : null;
  const known = state?.blocking === 'enabled' || state?.blocking === 'disabled';
  const enabled = state?.blocking === 'enabled';
  const selection = pauseSelection(duration, amount, unit);

  useEffect(() => {
    if (timer === null) return;
    const started = performance.now();
    let requested = false;
    const tick = () => {
      const next = remainingSeconds(timer, performance.now() - started);
      setCountdown({ snapshotId, value: next });
      // Ask the engine; never change DNS or assume the timer succeeded locally.
      if (next === 0 && timer > 0 && !requested) {
        requested = true;
        refresh();
      }
    };
    const initial = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [snapshotId, timer, refresh]);

  return (
    <section
      className={
        'panel sph-blocking ' +
        (enabled ? 'sph-blocking-on' : 'sph-blocking-off')
      }
      aria-labelledby="dns-blocking-title"
    >
      <div className="section-head">
        <h2 id="dns-blocking-title">
          {enabled ? <ShieldCheck /> : <ShieldOff />} DNS blocking
        </h2>
        <span className={'badge ' + (enabled ? 'green' : 'amber')}>
          {!known
            ? 'Status unavailable'
            : enabled
              ? 'Blocking enabled'
              : timer === null
                ? 'Paused indefinitely'
                : 'Blocking paused'}
        </span>
      </div>
      <output className="sph-blocking-status" aria-live="off">
        {!known
          ? 'Refresh to read the DNS engine’s current status.'
          : timer !== null
            ? remaining === 0
              ? 'Timer finished; checking the DNS engine’s current state…'
              : `${enabled ? 'Scheduled state change' : 'Blocking resumes'} in approximately ${durationLabel(remaining ?? timer)}.`
            : enabled
              ? 'Pi-hole is applying its configured rules.'
              : 'Blocking stays off until you select Resume blocking. DNS resolution still works.'}
      </output>
      <div className="sph-actions">
        <Button
          disabled={locked || !known || (enabled && timer === null)}
          onClick={() =>
            confirm({
              title: enabled
                ? 'Keep DNS blocking enabled?'
                : 'Resume DNS blocking now?',
              description:
                'Enable Pi-hole’s configured rules for every client using this DNS engine and cancel its current timer.',
              body: { action: 'blocking', blocking: true, timer: null },
            })
          }
        >
          <Play />
          {enabled ? 'Keep blocking enabled' : 'Resume blocking'}
        </Button>
        <Choice
          label="Pause duration"
          value={duration}
          onChange={setDuration}
          options={[
            { value: '10', label: '10 seconds' },
            { value: '30', label: '30 seconds' },
            { value: '60', label: '1 minute' },
            { value: '300', label: '5 minutes' },
            { value: '1800', label: '30 minutes' },
            { value: '3600', label: '1 hour' },
            { value: 'custom', label: 'Custom duration' },
            { value: 'indefinite', label: 'Indefinitely (until resumed)' },
          ]}
        />
        {duration === 'custom' && (
          <>
            <Field label="Custom duration" id="blocking-duration-amount">
              <Input
                id="blocking-duration-amount"
                type="number"
                min="1"
                step="1"
                max={unit === 'hours' ? 24 : unit === 'minutes' ? 1440 : 86400}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={'error' in selection}
                aria-describedby="blocking-duration-help"
              />
            </Field>
            <Choice
              label="Duration unit"
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'seconds', label: 'Seconds' },
                { value: 'minutes', label: 'Minutes' },
                { value: 'hours', label: 'Hours' },
              ]}
            />
          </>
        )}
        <Button
          variant="outline"
          disabled={locked || !known || 'error' in selection}
          onClick={() => {
            if ('error' in selection) return;
            confirm({
              title:
                selection.timer === null
                  ? 'Pause DNS blocking indefinitely?'
                  : `Pause DNS blocking for ${selection.label}?`,
              description:
                selection.timer === null
                  ? 'Blocking will stay off until you resume it manually. This cancels any existing timer and affects every client using this DNS engine.'
                  : `Pause blocking for ${selection.label}, replacing any existing timer. Pi-hole will resume blocking automatically, even if you close this page. This affects every client using this DNS engine.`,
              body: {
                action: 'blocking',
                blocking: false,
                timer: selection.timer,
              },
            });
          }}
        >
          <Pause />
          {selection && !('error' in selection) && selection.timer === null
            ? 'Pause indefinitely'
            : 'Pause blocking'}
        </Button>
      </div>
      {duration === 'custom' && (
        <p
          id="blocking-duration-help"
          className={'error' in selection ? 'pc-error' : 'nc-muted'}
        >
          {'error' in selection
            ? selection.error
            : 'Choose 1 second to 24 hours. The DNS engine owns the timer.'}
        </p>
      )}
      <p className="nc-muted">
        Network-wide control, not a per-device pause. Your rules, lists and
        device assignments are kept.
      </p>
    </section>
  );
}
