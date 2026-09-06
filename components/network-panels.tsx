'use client';
import { useState } from 'react';
import { recordId } from '@/lib/record-id';
import {
  Globe2,
  Plus,
  Pencil,
  Trash2,
  Pause,
  Play,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  useReview,
  Header,
  Field,
  TextField,
  Choice,
  Toggle,
  Empty,
  TargetChoice,
  useTargets,
} from './review-context';
import { countries } from '@/lib/countries';
import { validateNetwork } from '@/lib/network-policy';
import type { Device, Rule, Schedule } from '@/lib/network-policy';
import { normalizeDomain } from '@/lib/parental-policy';
export type Confirmation = {
  title: string;
  description: string;
  action: () => void;
};
export function ConfirmAction({
  value,
  onClose,
}: {
  value: Confirmation | null;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={!!value}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{value?.title}</AlertDialogTitle>
          <AlertDialogDescription>{value?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              value?.action();
              onClose();
            }}
          >
            Confirm review change
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
export function CountriesPanel() {
  const r = useReview(),
    { state } = r;
  const [query, setQuery] = useState(''),
    [onlySelected, setOnlySelected] = useState(false),
    [requestedPage, setPage] = useState(0);
  const filtered = countries.filter(
    (c) =>
      (!onlySelected || state.countries.blocked.includes(c.code)) &&
      `${c.name} ${c.code}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 36)),
    page = Math.min(requestedPage, pages - 1);
  return (
    <>
      <Header
        title="Country controls"
        description="Choose the DNS answer locations your policies should restrict."
      />
      <section className="panel"><h2>Connection countries: unavailable</h2><p>Pi-hole records DNS questions, not inbound Internet connections. No router flow collector or GeoIP enforcement is connected. Country flags and byte totals cannot be inferred from domain names.</p><label className="sph-check"><Switch disabled checked={false} />Enforce US-only connections · requires a gateway connector</label><p>The country checklist below is a policy design tool, not a live firewall.</p>
        <Button variant="outline" onClick={() => r.change({ ...state, countries: { ...state.countries, enabled: true, blocked: countries.filter(c => c.code !== 'US').map(c => c.code), unknown: 'block' } })}>Prepare US-only policy in simulator</Button>
      </section>
      <div className="nc-two">
        <section className="panel">
          <Toggle
            label="Country policy enabled"
            checked={state.countries.enabled}
            onChange={(enabled) =>
              r.change({ ...state, countries: { ...state.countries, enabled } })
            }
            description="Local policy tests only; live GeoIP lookup is not connected."
          />
          <TargetChoice
            value={state.countries.target}
            onChange={(target) =>
              r.change({ ...state, countries: { ...state.countries, target } })
            }
          />
          <Choice
            label="Unknown location"
            value={state.countries.unknown}
            options={[
              { value: 'allow', label: 'Allow and keep location unknown' },
              { value: 'block', label: 'Block unknown locations' },
            ]}
            onChange={(unknown) =>
              r.change({
                ...state,
                countries: {
                  ...state.countries,
                  unknown: unknown as 'allow' | 'block',
                },
              })
            }
          />
        </section>
        <section className="panel nc-explainer">
          <Globe2 />
          <h2>{state.countries.blocked.length} selected locations</h2>
          <p>
            The tester uses the country you supply, not a live geolocation
            database. An endpoint’s country is not evidence of spying.
          </p>
          <p>
            Real DNS integration still needs IPv4/IPv6, caching, and
            mixed-country answer handling.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="nc-toolbar">
          <TextField
            label="Search countries or codes"
            id="country-search"
            value={query}
            placeholder="Search country or territory…"
            onChange={(v) => {
              setQuery(v);
              setPage(0);
            }}
          />
          <Toggle
            label="Selected only"
            checked={onlySelected}
            onChange={(v) => {
              setOnlySelected(v);
              setPage(0);
            }}
          />
          <Button
            variant="outline"
            disabled={!filtered.length}
            onClick={() =>
              r.change({
                ...state,
                countries: {
                  ...state.countries,
                  blocked: [
                    ...new Set([
                      ...state.countries.blocked,
                      ...filtered.map((c) => c.code),
                    ]),
                  ],
                },
              })
            }
          >
            Select results
          </Button>
          <Button
            variant="ghost"
            disabled={!state.countries.blocked.length}
            onClick={() =>
              r.change({
                ...state,
                countries: { ...state.countries, blocked: [] },
              })
            }
          >
            Clear selection
          </Button>
        </div>
        <p className="nc-helper">
          {filtered.length} results · {countries.length} country/territory
          identifiers. Checked means blocked when this policy applies.
        </p>
        <div className="nc-country-grid">
          {filtered.slice(page * 36, (page + 1) * 36).map((c) => (
            <label
              className={
                'nc-country ' +
                (state.countries.blocked.includes(c.code) ? 'selected' : '')
              }
              key={c.code}
            >
              <Checkbox
                aria-label={`Block ${c.name} (${c.code})`}
                checked={state.countries.blocked.includes(c.code)}
                onCheckedChange={(checked) =>
                  r.change({
                    ...state,
                    countries: {
                      ...state.countries,
                      blocked: checked
                        ? [...state.countries.blocked, c.code]
                        : state.countries.blocked.filter((v) => v !== c.code),
                    },
                  })
                }
              />
              <span>
                {c.name}
                <small>{c.code}</small>
              </span>
            </label>
          ))}
        </div>
        {!filtered.length && <Empty>No matching locations.</Empty>}
        <div className="nc-pagination">
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous countries
          </Button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button
            variant="outline"
            disabled={page + 1 === pages}
            onClick={() => setPage(page + 1)}
          >
            Next countries
          </Button>
        </div>
      </section>
    </>
  );
}
export function RuleEditor({
  value,
  onChange,
}: {
  value: Rule | null;
  onChange: (v: Rule | null) => void;
}) {
  const r = useReview();
  return (
    <Dialog
      open={!!value}
      onOpenChange={(v) => {
        if (!v) onChange(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Website rule</DialogTitle>
          <DialogDescription>
            Includes subdomains. Changes the review policy only.
          </DialogDescription>
        </DialogHeader>
        {value && (
          <form
            className="nc-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              r.perform(() => {
                const row = { ...value, domain: normalizeDomain(value.domain) },
                  next = {
                    ...r.state,
                    rules: [
                      ...r.state.rules.filter((v) => v.id !== row.id),
                      row,
                    ],
                  };
                validateNetwork(next);
                r.change(next);
                onChange(null);
              });
            }}
          >
            <TextField
              label="Rule domain"
              id="rule-domain"
              value={value.domain}
              onChange={(domain) => onChange({ ...value, domain })}
            />
            <Choice
              label="Rule action"
              value={value.action}
              options={[
                { value: 'block', label: 'Block domain' },
                { value: 'allow', label: 'Allow domain' },
              ]}
              onChange={(action) =>
                onChange({ ...value, action: action as Rule['action'] })
              }
            />
            <TargetChoice
              value={value.target}
              onChange={(target) => onChange({ ...value, target })}
            />
            <Button type="submit">Keep website rule</Button>
            {r.error && (
              <p className="pc-error" role="alert">
                {r.error}
              </p>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function DevicesPanel() {
  const r = useReview(),
    { state } = r,
    targets = useTargets();
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [edit, setEdit] = useState<Device | null>(null),
    [rule, setRule] = useState<Rule | null>(null),
    [groupName, setGroupName] = useState(''),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const visible = state.devices.filter(
    (d) =>
      (filter === 'all' || d.groupId === filter) &&
      `${d.name} ${d.address}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Header
        title="Devices & website rules"
        description="Friendly names, shared groups, and clear allow/block decisions."
      >
        <Button
          onClick={() => {
            r.setError('');
            setEdit({
              id: recordId(),
              name: '',
              address: '',
              kind: 'other',
              groupId: state.groups[0].id,
              paused: false,
            });
          }}
        >
          <Plus />
          Add review device
        </Button>
      </Header>
      <section className="panel">
        <div className="nc-toolbar">
          <TextField
            label="Find a device"
            id="device-search"
            value={query}
            placeholder="Name or address…"
            onChange={setQuery}
          />
          <Choice
            label="Device group"
            value={filter}
            options={[
              { value: 'all', label: 'All groups' },
              ...state.groups.map((g) => ({ value: g.id, label: g.name })),
            ]}
            onChange={setFilter}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Family profile</TableHead>
              <TableHead>Review policy</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <strong>{d.name}</strong>
                  <small>
                    {d.address} · {d.kind}
                  </small>
                </TableCell>
                <TableCell>
                  {state.groups.find((g) => g.id === d.groupId)?.name}
                </TableCell>
                <TableCell>
                  {state.parental.profiles.find((p) => p.devices.includes(d.id))
                    ?.name ?? 'No family profile'}
                </TableCell>
                <TableCell>
                  <span className={'badge ' + (d.paused ? 'amber' : '')}>
                    {d.paused ? 'Paused in review' : 'Assigned rules'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="nc-row-actions">
                    <Button
                      variant="ghost"
                      aria-label={`Edit ${d.name}`}
                      onClick={() => {
                        r.setError('');
                        setEdit({ ...d });
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        r.change({
                          ...state,
                          devices: state.devices.map((item) =>
                            item.id === d.id
                              ? { ...item, paused: !item.paused }
                              : item,
                          ),
                        })
                      }
                    >
                      {d.paused ? <Play /> : <Pause />}
                      {d.paused ? 'Resume' : 'Pause'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        r.setFocusDevice(d.id);
                        r.setSection('Activity');
                      }}
                    >
                      Activity
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={`Remove device ${d.name}`}
                      onClick={() =>
                        setConfirmation({
                          title: 'Remove this review device?',
                          description:
                            'Its device-specific rules and schedules will also be removed. Saved synthetic activity remains. Live Pi-hole is unaffected.',
                          action: () =>
                            r.change({
                              ...state,
                              devices: state.devices.filter(
                                (v) => v.id !== d.id,
                              ),
                              rules: state.rules.filter(
                                (v) =>
                                  v.target.type !== 'device' ||
                                  v.target.id !== d.id,
                              ),
                              schedules: state.schedules.filter(
                                (v) =>
                                  v.target.type !== 'device' ||
                                  v.target.id !== d.id,
                              ),
                              countries: {
                                ...state.countries,
                                ...(state.countries.target.type === 'device' &&
                                state.countries.target.id === d.id
                                  ? {
                                      enabled: false,
                                      target: { type: 'all' as const, id: '' },
                                    }
                                  : {}),
                              },
                              parental: {
                                ...state.parental,
                                profiles: state.parental.profiles.map((p) => ({
                                  ...p,
                                  devices: p.devices.filter((v) => v !== d.id),
                                })),
                              },
                            }),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!visible.length && <Empty>No devices match these filters.</Empty>}
      </section>
      <div className="nc-two">
        <section className="panel">
          <h2>Device groups</h2>
          {state.groups.map((g) => (
            <div className="nc-summary-line" key={g.id}>
              <TextField
                label="Group name"
                id={'group-' + g.id}
                value={g.name}
                onChange={(name) =>
                  r.change({
                    ...state,
                    groups: state.groups.map((v) =>
                      v.id === g.id ? { ...v, name } : v,
                    ),
                  })
                }
              />
              <span>
                {state.devices.filter((d) => d.groupId === g.id).length} devices
              </span>
            </div>
          ))}
          <form
            className="nc-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              r.perform(() => {
                const next = {
                  ...state,
                  groups: [
                    ...state.groups,
                    { id: recordId(), name: groupName.trim() },
                  ],
                };
                validateNetwork(next);
                r.change(next);
                setGroupName('');
              });
            }}
          >
            <TextField
              label="New group name"
              id="new-group"
              value={groupName}
              onChange={setGroupName}
            />
            <Button type="submit">Add group</Button>
          </form>
        </section>
        <section className="panel nc-explainer">
          <Monitor />
          <h2>Recognizable, not invasive</h2>
          <p>
            These are review identities—not discovered devices. A later
            connector must verify actual client addresses and stable identity.
          </p>
          <p>
            DNS exposes requested hostnames, not full page URLs or the
            application process that requested them.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="section-head">
          <h2>Website rules</h2>
          <Button
            onClick={() => {
              r.setError('');
              setRule({
                id: recordId(),
                domain: '',
                action: 'block',
                target: { type: 'all', id: '' },
                enabled: true,
              });
            }}
          >
            <Plus />
            Add website rule
          </Button>
        </div>
        <p className="nc-helper">
          Includes subdomains. Deny rules win over allow rules. Security,
          country, pause, and schedule restrictions take priority.
        </p>
        {!state.rules.length ? (
          <Empty>No custom website rules yet.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.rules.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <code>{item.domain}</code>
                  </TableCell>
                  <TableCell>{item.action}</TableCell>
                  <TableCell>{targets.label(item.target)}</TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`Enable rule ${item.domain}`}
                      checked={item.enabled}
                      onCheckedChange={(enabled) =>
                        r.change({
                          ...state,
                          rules: state.rules.map((v) =>
                            v.id === item.id ? { ...v, enabled } : v,
                          ),
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      aria-label={`Edit rule ${item.domain}`}
                      onClick={() => setRule({ ...item })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={`Remove rule ${item.domain}`}
                      onClick={() =>
                        setConfirmation({
                          title: 'Remove this website rule?',
                          description:
                            item.domain +
                            ' will be removed from the review configuration.',
                          action: () =>
                            r.change({
                              ...state,
                              rules: state.rules.filter(
                                (v) => v.id !== item.id,
                              ),
                            }),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <Dialog
        open={!!edit}
        onOpenChange={(v) => {
          if (!v) setEdit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {state.devices.some((d) => d.id === edit?.id)
                ? 'Edit review device'
                : 'Add review device'}
            </DialogTitle>
            <DialogDescription>
              No discovery or network changes are performed.
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <form
              className="nc-dialog"
              onSubmit={(e) => {
                e.preventDefault();
                r.perform(() => {
                  const next = {
                    ...state,
                    devices: [
                      ...state.devices.filter((d) => d.id !== edit.id),
                      {
                        ...edit,
                        name: edit.name.trim(),
                        address: edit.address.trim(),
                      },
                    ],
                  };
                  validateNetwork(next);
                  r.change(next);
                  setEdit(null);
                });
              }}
            >
              <TextField
                label="Device name"
                id="device-name"
                value={edit.name}
                onChange={(name) => setEdit({ ...edit, name })}
              />
              <TextField
                label="Address or review identifier"
                id="device-address"
                value={edit.address}
                placeholder="192.0.2.25"
                onChange={(address) => setEdit({ ...edit, address })}
              />
              <Choice
                label="Device type"
                value={edit.kind}
                options={['tablet', 'tv', 'printer', 'computer', 'other'].map(
                  (value) => ({ value, label: value }),
                )}
                onChange={(kind) =>
                  setEdit({ ...edit, kind: kind as Device['kind'] })
                }
              />
              <Choice
                label="Assigned group"
                value={edit.groupId}
                options={state.groups.map((g) => ({
                  value: g.id,
                  label: g.name,
                }))}
                onChange={(groupId) => setEdit({ ...edit, groupId })}
              />
              <Button type="submit">Keep device changes</Button>
              {r.error && (
                <p className="pc-error" role="alert">
                  {r.error}
                </p>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
      <RuleEditor value={rule} onChange={setRule} />
      <ConfirmAction
        value={confirmation}
        onClose={() => setConfirmation(null)}
      />
    </>
  );
}
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function SchedulesPanel() {
  const r = useReview(),
    { state } = r,
    targets = useTargets();
  const [edit, setEdit] = useState<Schedule | null>(null),
    [domains, setDomains] = useState(''),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  function create() {
    r.setError('');
    setEdit({
      id: recordId(),
      name: 'Social media hours',
      domains: [],
      target: { type: 'group', id: state.groups[0].id },
      window: {
        enabled: true,
        start: '16:00',
        end: '18:00',
        days: [1, 2, 3, 4, 5],
      },
      timezone: state.settings.timezone,
      mode: 'allow-during',
    });
    setDomains('social.example');
  }
  return (
    <>
      <Header
        title="Website schedules"
        description="Limit selected sites by time, weekday, and device or group."
      >
        <Button onClick={create}>
          <Plus />
          Add schedule
        </Button>
      </Header>
      <div className="nc-schedule-grid">
        {state.schedules.map((s) => (
          <section className="panel" key={s.id}>
            <div className="section-head">
              <h2>{s.name}</h2>
              <Switch
                aria-label={`Enable schedule ${s.name}`}
                checked={s.window.enabled}
                onCheckedChange={(enabled) =>
                  r.change({
                    ...state,
                    schedules: state.schedules.map((v) =>
                      v.id === s.id
                        ? { ...v, window: { ...v.window, enabled } }
                        : v,
                    ),
                  })
                }
              />
            </div>
            <div className="nc-time">
              {s.window.start}
              <span>—</span>
              {s.window.end}
            </div>
            <p>
              {s.mode === 'allow-during'
                ? 'Allow only during this window'
                : 'Block during this window'}
            </p>
            <div className="nc-day-labels">
              {days.map((d, i) => (
                <span key={d} className={s.window.days.includes(i) ? 'on' : ''}>
                  {d}
                </span>
              ))}
            </div>
            <p className="nc-helper">
              {s.timezone} · {targets.label(s.target)}
            </p>
            <div className="nc-domain-tags">
              {s.domains.map((d) => (
                <code key={d}>{d}</code>
              ))}
            </div>
            <div className="nc-row-actions">
              <Button
                variant="outline"
                onClick={() => {
                  r.setError('');
                  setEdit(structuredClone(s));
                  setDomains(s.domains.join('\n'));
                }}
              >
                <Pencil />
                Edit schedule
              </Button>
              <Button
                variant="ghost"
                aria-label={`Remove schedule ${s.name}`}
                onClick={() =>
                  setConfirmation({
                    title: 'Remove this schedule?',
                    description:
                      'This removes only the review policy after the next save.',
                    action: () =>
                      r.change({
                        ...state,
                        schedules: state.schedules.filter((v) => v.id !== s.id),
                      }),
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>
          </section>
        ))}
      </div>
      {!state.schedules.length && (
        <section className="panel">
          <Empty>
            No website schedules yet. Add an allowed-hours or blocked-hours
            window.
          </Empty>
          <Button variant="outline" onClick={create}>
            Create your first schedule
          </Button>
        </section>
      )}
      <section className="panel">
        <h2>Bedtime & homework routines</h2>
        <p>
          Family routines stay with each parental profile. Both routines and
          website schedules participate in the complete policy tester.
        </p>
        <Button
          variant="outline"
          onClick={() => r.setSection('Parental Controls')}
        >
          Open parental controls
        </Button>
        <p className="nc-helper">
          Overnight windows belong to their starting weekday. Allowed hours do
          not bypass other restrictions. DNS counts are not screen time.
        </p>
      </section>
      <Dialog
        open={!!edit}
        onOpenChange={(v) => {
          if (!v) setEdit(null);
        }}
      >
        <DialogContent className="nc-schedule-dialog">
          <DialogHeader>
            <DialogTitle>Website schedule</DialogTitle>
            <DialogDescription>
              Overnight windows use their starting weekday. Ending time is
              exclusive.
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <form
              className="nc-dialog"
              onSubmit={(e) => {
                e.preventDefault();
                r.perform(() => {
                  const row = {
                      ...edit,
                      name: edit.name.trim(),
                      domains: [
                        ...new Set(
                          domains
                            .split(/[\s,]+/)
                            .filter(Boolean)
                            .map(normalizeDomain),
                        ),
                      ],
                    },
                    next = {
                      ...state,
                      schedules: [
                        ...state.schedules.filter((s) => s.id !== row.id),
                        row,
                      ],
                    };
                  validateNetwork(next);
                  r.change(next);
                  setEdit(null);
                });
              }}
            >
              <TextField
                label="Schedule name"
                id="schedule-name"
                value={edit.name}
                onChange={(name) => setEdit({ ...edit, name })}
              />
              <Choice
                label="Schedule behavior"
                value={edit.mode}
                options={[
                  {
                    value: 'allow-during',
                    label: 'Allow these sites only during the window',
                  },
                  {
                    value: 'block-during',
                    label: 'Block these sites during the window',
                  },
                ]}
                onChange={(mode) =>
                  setEdit({ ...edit, mode: mode as Schedule['mode'] })
                }
              />
              <TargetChoice
                value={edit.target}
                onChange={(target) => setEdit({ ...edit, target })}
              />
              <div className="nc-form-grid">
                <TextField
                  label="Window starts"
                  id="schedule-start"
                  type="time"
                  value={edit.window.start}
                  onChange={(start) =>
                    setEdit({ ...edit, window: { ...edit.window, start } })
                  }
                />
                <TextField
                  label="Window ends"
                  id="schedule-end"
                  type="time"
                  value={edit.window.end}
                  onChange={(end) =>
                    setEdit({ ...edit, window: { ...edit.window, end } })
                  }
                />
              </div>
              <fieldset className="nc-check-row">
                <legend>Starting weekdays</legend>
                {days.map((d, i) => (
                  <label key={d}>
                    <Checkbox
                      aria-label={`Schedule ${d}`}
                      checked={edit.window.days.includes(i)}
                      onCheckedChange={(checked) =>
                        setEdit({
                          ...edit,
                          window: {
                            ...edit.window,
                            days: checked
                              ? [...edit.window.days, i].sort((a, b) => a - b)
                              : edit.window.days.filter((v) => v !== i),
                          },
                        })
                      }
                    />
                    {d}
                  </label>
                ))}
              </fieldset>
              <TextField
                label="Schedule time zone"
                id="schedule-timezone"
                value={edit.timezone}
                onChange={(timezone) => setEdit({ ...edit, timezone })}
              />
              <Field label="Scheduled domains" id="schedule-domains">
                <Textarea
                  id="schedule-domains"
                  rows={3}
                  value={domains}
                  onChange={(e) => setDomains(e.target.value)}
                />
              </Field>
              <Button type="submit">Keep schedule</Button>
              {r.error && (
                <p className="pc-error" role="alert">
                  {r.error}
                </p>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmAction
        value={confirmation}
        onClose={() => setConfirmation(null)}
      />
    </>
  );
}
