'use client';

import { useEffect, useId, useState } from 'react';
import { recordId } from '@/lib/record-id';
import {
  UsersRound,
  ShieldCheck,
  Plus,
  Pause,
  Play,
  Download,
  Save,
  FlaskConical,
  LockKeyhole,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
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
  categories,
  presetNames,
  createProfile,
  applyPreset,
  normalizeDomain,
  evaluate,
  validateDraft,
  assignDevice,
} from '@/lib/parental-policy';
import type {
  Category,
  Preset,
  Profile,
  Draft,
  Window,
  Decision,
} from '@/lib/parental-policy';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type TestResult = Decision & {
  domain: string;
  profileId: string;
  category: Category | 'unknown';
  instant: string;
};
type Request = {
  id: string;
  profileId: string;
  domain: string;
  category: Category | 'unknown';
  status: 'pending' | 'approved' | 'denied';
};

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="pc-field">
      <span>{label}</span>
      <Select
        value={value}
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
            <SelectItem value={o.value} key={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Toggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const controlId = useId();
  return (
    <label className="pc-toggle" htmlFor={controlId}>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <Switch
        id={controlId}
        checked={checked}
        onCheckedChange={onChange}
        aria-label={title}
      />
    </label>
  );
}
function Schedule({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: Window;
  onChange: (window: Window) => void;
}) {
  const scheduleId = useId();
  return (
    <section className="pc-section">
      <Toggle
        title={title}
        description={description}
        checked={value.enabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
      />
      <div className="pc-inline">
        <label className="pc-field" htmlFor={`${scheduleId}-start`}>
          Starts
          <Input
            id={`${scheduleId}-start`}
            type="time"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
          />
        </label>
        <label className="pc-field" htmlFor={`${scheduleId}-end`}>
          Ends
          <Input
            id={`${scheduleId}-end`}
            type="time"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
          />
        </label>
      </div>
      <fieldset className="pc-days">
        <legend>Starting weekdays</legend>
        {dayNames.map((name, day) => (
          <label key={day}>
            <Checkbox
              aria-label={`${title}: ${name}`}
              checked={value.days.includes(day)}
              onCheckedChange={(checked) =>
                onChange({
                  ...value,
                  days: checked
                    ? [...value.days, day].sort((a, b) => a - b)
                    : value.days.filter((d) => d !== day),
                })
              }
            />
            {name}
          </label>
        ))}
      </fieldset>
      <small>
        Overnight windows continue into the next day. The ending time is not
        included.
      </small>
    </section>
  );
}

export function ParentalControls({
  value,
  onChange,
  onSave,
  devices,
  timezone,
}: {
  value: Draft;
  onChange: (value: Draft) => void;
  onSave: () => Promise<void>;
  devices: { id: string; name: string; address: string }[];
  timezone: string;
}) {
  const draft = value,
    setDraft = onChange;
  const [selected, setSelected] = useState('child-example');
  const [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState(
      'Local review settings. Use example identities; no network enforcement.',
    ),
    [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const [newOpen, setNewOpen] = useState(false),
    [newName, setNewName] = useState(''),
    [newPreset, setNewPreset] = useState<Preset>('child');
  const [removeOpen, setRemoveOpen] = useState(false);
  const [domain, setDomain] = useState(''),
    [ruleType, setRuleType] = useState('deny');
  const [grantDomain, setGrantDomain] = useState(''),
    [grantMinutes, setGrantMinutes] = useState('30');
  const [testDomain, setTestDomain] = useState('social.example'),
    [testCategory, setTestCategory] = useState<Category | 'unknown'>('social'),
    [testAt, setTestAt] = useState('');
  const [result, setResult] = useState<TestResult | null>(null),
    [history, setHistory] = useState<TestResult[]>([]),
    [requests, setRequests] = useState<Request[]>([]);
  const profile =
    draft.profiles.find((p) => p.id === selected) ?? draft.profiles[0];
  useEffect(() => {
    const timestamp = Date.now();
    // oxlint-disable-next-line react/react-compiler -- Initialize a client-clock-dependent test after hydration.
    setNow(timestamp);
    setTestAt(new Date(timestamp).toISOString().slice(0, -1));
    setReady(true);
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  function change(next: Draft) {
    setDraft(next);
    setDirty(true);
    setError('');
    setResult(null);
    setMessage('Settings changed. Save the review configuration or export it.');
  }
  function update(patch: Partial<Profile>) {
    change({
      ...draft,
      profiles: draft.profiles.map((p) =>
        p.id === profile.id ? { ...p, ...patch } : p,
      ),
    });
  }
  async function perform(action: () => void | Promise<void>) {
    try {
      setError('');
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'The action could not be completed.',
      );
    }
  }
  function save() {
    perform(async () => {
      validateDraft(
        draft,
        devices.map((d) => d.id),
      );
      await onSave();
      setDirty(false);
      setMessage(
        'Family settings saved in the local review database. Live Pi-hole is unchanged.',
      );
    });
  }
  function exportDraft() {
    perform(() => {
      const valid = validateDraft(
        draft,
        devices.map((d) => d.id),
      );
      const blob = new Blob([JSON.stringify(valid, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'super-pi-hole-parental-draft.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        'Exported a configuration draft. It is not an active Pi-hole configuration.',
      );
    });
  }
  function addRule() {
    perform(() => {
      const normalized = normalizeDomain(domain);
      const list = ruleType === 'allow' ? 'allow' : 'deny';
      update({ [list]: [...new Set([...profile[list], normalized])] });
      setDomain('');
    });
  }
  function grant(
    input: string,
    profileId = profile.id,
    duration = Number(grantMinutes),
  ) {
    const normalized = normalizeDomain(input),
      timestamp = Date.now();
    const target = draft.profiles.find((p) => p.id === profileId);
    if (!target) throw new Error('This profile no longer exists.');
    change({
      ...draft,
      profiles: draft.profiles.map((p) =>
        p.id === profileId
          ? {
              ...p,
              grants: [
                ...p.grants.filter(
                  (g) => g.expiresAt > timestamp && g.domain !== normalized,
                ),
                {
                  id: recordId(),
                  domain: normalized,
                  startsAt: timestamp,
                  expiresAt: timestamp + duration * 60000,
                },
              ],
            }
          : p,
      ),
    });
    setNow(timestamp);
    setGrantDomain('');
  }
  function testPolicy() {
    perform(() => {
      validateDraft(
        draft,
        devices.map((d) => d.id),
      );
      const at = new Date(testAt + 'Z');
      const decision = evaluate(profile, testDomain, testCategory, at);
      const next = {
        ...decision,
        domain: normalizeDomain(testDomain),
        category: testCategory,
        profileId: profile.id,
        instant: at.toISOString(),
      };
      setResult(next);
      setHistory((old) => [next, ...old].slice(0, 20));
    });
  }
  const paused = !!(
    profile.pause &&
    now >= profile.pause.startsAt &&
    now < profile.pause.expiresAt
  );
  const activeGrants = profile.grants.filter((g) => g.expiresAt > now);
  return (
    <div className="parental">
      <div className="section-head">
        <div>
          <p className="eyebrow">FAMILY & ACCESS</p>
          <h1>Parental controls</h1>
          <p>One profile. Every device they use.</p>
        </div>
        <div className="pc-actions">
          <Button variant="outline" disabled={!ready} onClick={exportDraft}>
            <Download />
            Export draft
          </Button>
          <Button disabled={!ready} onClick={save}>
            <Save />
            {dirty ? 'Save family changes' : 'Save family settings'}
          </Button>
        </div>
      </div>
      <div className="notice">
        <ShieldCheck />
        <div>
          <strong>Family policies · local review</strong>
          <p>
            Profiles, category choices, routines, approvals, and the tester work
            locally and save to the review database. No family traffic is
            collected. Parent sign-in and live DNS integration are release
            requirements, not active features of this review build.
          </p>
        </div>
      </div>
      <output className="pc-feedback" aria-live="polite">
        {message}
      </output>
      {error && (
        <p className="pc-error" role="alert">
          {error}
        </p>
      )}
      <div className="pc-layout">
        <aside className="panel pc-profiles">
          <div className="section-head">
            <h2>Family profiles</h2>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Add family profile"
              disabled={!ready || draft.profiles.length >= 30}
              onClick={() => setNewOpen(true)}
            >
              <Plus />
            </Button>
          </div>
          <div className="pc-profile-list">
            {draft.profiles.map((p) => (
              <button
                type="button"
                key={p.id}
                aria-pressed={p.id === profile.id}
                className={
                  'pc-profile ' + (p.id === profile.id ? 'selected' : '')
                }
                onClick={() => {
                  setSelected(p.id);
                  setResult(null);
                  setDomain('');
                  setGrantDomain('');
                }}
              >
                <span className="device-icon">
                  <UsersRound />
                </span>
                <span>
                  <strong>{p.name || 'Unnamed profile'}</strong>
                  <small>
                    {p.devices.length} example device
                    {p.devices.length === 1 ? '' : 's'} ·{' '}
                    {presetNames[p.preset]}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <div className="pc-footnote">
            <LockKeyhole />
            <p>
              Children cannot be identified from DNS alone. Each device belongs
              to one profile; shared devices need a shared policy.
            </p>
          </div>
          <Button
            variant="outline"
            className="pc-wide"
            disabled={!ready}
            onClick={() => {
              const timestamp = Date.now();
              change({
                ...draft,
                profiles: draft.profiles.map((p) => ({
                  ...p,
                  pause: {
                    startsAt: timestamp,
                    expiresAt: timestamp + 30 * 60000,
                  },
                })),
              });
              setNow(timestamp);
            }}
          >
            <Pause />
            Draft family pause · 30 min
          </Button>
        </aside>
        <section className="panel pc-editor">
          <div className="section-head">
            <div>
              <h2>{profile.name || 'Unnamed profile'}</h2>
              <p>
                {profile.blockedCategories.length} categories selected ·{' '}
                {profile.allow.length + profile.deny.length} website rules
              </p>
            </div>
            <div className="pc-actions">
              <span className={'badge ' + (paused ? 'amber' : '')}>
                {paused ? 'Draft DNS pause' : 'Draft profile'}
              </span>
              <Button
                variant="outline"
                disabled={!ready}
                onClick={() => {
                  const timestamp = Date.now();
                  update({
                    pause: paused
                      ? null
                      : {
                          startsAt: timestamp,
                          expiresAt: timestamp + 30 * 60000,
                        },
                  });
                  setNow(timestamp);
                }}
              >
                {paused ? <Play /> : <Pause />}
                {paused ? 'Resume draft' : 'Pause draft · 30 min'}
              </Button>
            </div>
          </div>
          {paused && (
            <p className="pc-helper">
              Draft pause expires{' '}
              {new Date(profile.pause!.expiresAt).toLocaleTimeString()}. A DNS
              pause only affects new lookups, not cached addresses or existing
              connections.
            </p>
          )}
          <Tabs defaultValue="filters">
            <TabsList className="pc-tabs" variant="line">
              <TabsTrigger value="filters">Filters & devices</TabsTrigger>
              <TabsTrigger value="routines">Routines</TabsTrigger>
              <TabsTrigger value="websites">Websites & approvals</TabsTrigger>
              <TabsTrigger value="privacy">Reports & privacy</TabsTrigger>
            </TabsList>
            <TabsContent value="filters">
              <div className="pc-inline">
                <label className="pc-field" htmlFor="pc-profile-name">
                  Profile name
                  <Input
                    id="pc-profile-name"
                    maxLength={60}
                    value={profile.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </label>
                <Choice
                  label="Content preset"
                  value={profile.preset}
                  options={Object.entries(presetNames).map(
                    ([value, label]) => ({ value, label }),
                  )}
                  onChange={(v) => update(applyPreset(profile, v as Preset))}
                />
              </div>
              <p className="pc-helper">
                Changing the preset replaces category and search settings,
                keeping schedules and exceptions. Presets are editable starting
                points, not age-safety guarantees.
              </p>
              <section className="pc-section">
                <h3>Assigned devices</h3>
                <div className="pc-device-checks">
                  {devices.map((d) => (
                    <label key={d.id}>
                      <Checkbox
                        checked={profile.devices.includes(d.id)}
                        onCheckedChange={(checked) =>
                          change(
                            assignDevice(
                              draft,
                              profile.id,
                              d.id,
                              checked,
                              devices.map((item) => item.id),
                            ),
                          )
                        }
                        aria-label={`Assign ${d.name}`}
                      />
                      <span>
                        {d.name}
                        <small>
                          {d.address} · example
                          {draft.profiles.some(
                            (p) =>
                              p.id !== profile.id && p.devices.includes(d.id),
                          )
                            ? ' · moves from another profile'
                            : ''}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
              <section className="pc-section">
                <h3>Blocked categories</h3>
                <p className="pc-helper">
                  A checked category would be blocked. No live category feed is
                  loaded; the tester uses the category you select.
                </p>
                <div className="pc-categories">
                  {categories.map((c) => (
                    <label key={c.id}>
                      <Checkbox
                        checked={profile.blockedCategories.includes(c.id)}
                        onCheckedChange={(checked) =>
                          update({
                            blockedCategories: checked
                              ? [...profile.blockedCategories, c.id]
                              : profile.blockedCategories.filter(
                                  (id) => id !== c.id,
                                ),
                          })
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
                <p className="pc-helper">
                  Blocking known proxy sites does not prevent all VPNs,
                  encrypted DNS, or cellular-data bypass.
                </p>
              </section>
              <Toggle
                title="Approved sites only"
                description="Requests need an approved-domain rule or temporary parent approval."
                checked={profile.approvedOnly}
                onChange={(approvedOnly) => update({ approvedOnly })}
              />
              <Toggle
                title="SafeSearch"
                description="Draft intent for supported Google and Bing searches; not a general web-content guarantee."
                checked={profile.safeSearch}
                onChange={(safeSearch) => update({ safeSearch })}
              />
              <Choice
                label="YouTube Restricted Mode"
                value={profile.youtube}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'moderate', label: 'Moderate' },
                  { value: 'strict', label: 'Strict' },
                ]}
                onChange={(v) => update({ youtube: v as Profile['youtube'] })}
              />
              <p className="pc-helper">
                Provider DNS mappings and per-profile enforcement still require
                integration. This cannot filter individual videos or remove all
                YouTube ads.
              </p>
            </TabsContent>
            <TabsContent value="routines">
              <label className="pc-field" htmlFor="pc-profile-timezone">
                Profile time zone
                <Input
                  id="pc-profile-timezone"
                  value={profile.timezone}
                  onChange={(e) => update({ timezone: e.target.value })}
                  list="pc-timezones"
                />
                <datalist id="pc-timezones">
                  {[
                    'America/Phoenix',
                    'America/New_York',
                    'America/Chicago',
                    'America/Denver',
                    'America/Los_Angeles',
                    'Europe/London',
                    'Australia/Sydney',
                    'UTC',
                  ].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </datalist>
              </label>
              <p className="pc-helper">
                Use an IANA time zone. Rules follow local wall time, including
                daylight-saving changes.
              </p>
              <Schedule
                title="Bedtime"
                description="Block new DNS lookups during this window, including permanently approved sites."
                value={profile.bedtime}
                onChange={(bedtime) => update({ bedtime })}
              />
              <Schedule
                title="Homework time"
                description="Block social media, gaming, and streaming during this window."
                value={profile.homework}
                onChange={(homework) => update({ homework })}
              />
              <div className="pc-future">
                <h3>Daily screen-time budgets · later integration</h3>
                <p>
                  Accurate active-use time and per-app limits need a device
                  agent or gateway telemetry. DNS counts will not be presented
                  as time spent online.
                </p>
              </div>
            </TabsContent>
            <TabsContent value="websites">
              <h3>Website rules</h3>
              <p className="pc-helper">
                Rules match a domain and its subdomains. Enter domains, not full
                URLs. Approved sites still respect bedtime, homework, and DNS
                pauses.
              </p>
              <form
                className="pc-inline"
                onSubmit={(e) => {
                  e.preventDefault();
                  addRule();
                }}
              >
                <label className="pc-field" htmlFor="pc-rule-domain">
                  Domain
                  <Input
                    id="pc-rule-domain"
                    placeholder="school.example"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  />
                </label>
                <Choice
                  label="Rule"
                  value={ruleType}
                  options={[
                    { value: 'deny', label: 'Block domain' },
                    { value: 'allow', label: 'Approve domain' },
                  ]}
                  onChange={setRuleType}
                />
                <Button type="submit">Add rule</Button>
              </form>
              {!profile.allow.length && !profile.deny.length && (
                <p className="pc-empty">
                  No custom website rules for this profile.
                </p>
              )}
              {(['deny', 'allow'] as const).flatMap((list) =>
                profile[list].map((d) => (
                  <div className="pc-rule" key={list + d}>
                    <span
                      className={'badge ' + (list === 'deny' ? 'red' : 'green')}
                    >
                      {list === 'deny' ? 'Block' : 'Approve'}
                    </span>
                    <code>{d}</code>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${list} rule for ${d}`}
                      onClick={() =>
                        update({ [list]: profile[list].filter((v) => v !== d) })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )),
              )}
              <section className="pc-section">
                <h3>Temporary parent approval</h3>
                <p className="pc-helper">
                  A timed approval can override website, category, and routine
                  restrictions. Known malware blocks and an active DNS pause
                  still win. SafeSearch stays enabled.
                </p>
                <form
                  className="pc-inline"
                  onSubmit={(e) => {
                    e.preventDefault();
                    perform(() => grant(grantDomain));
                  }}
                >
                  <label className="pc-field" htmlFor="pc-grant-domain">
                    Domain
                    <Input
                      id="pc-grant-domain"
                      placeholder="school.example"
                      value={grantDomain}
                      onChange={(e) => setGrantDomain(e.target.value)}
                    />
                  </label>
                  <Choice
                    label="Allow for"
                    value={grantMinutes}
                    options={['15', '30', '60'].map((value) => ({
                      value,
                      label: value + ' minutes',
                    }))}
                    onChange={setGrantMinutes}
                  />
                  <Button type="submit" disabled={!ready}>
                    Add draft approval
                  </Button>
                </form>
                {!activeGrants.length && (
                  <p className="pc-empty">No unexpired temporary approvals.</p>
                )}
                {activeGrants.map((g) => (
                  <div className="pc-rule" key={g.id}>
                    <span>
                      <code>{g.domain}</code>
                      <small>
                        Expires {new Date(g.expiresAt).toLocaleString()}
                      </small>
                    </span>
                    <Button
                      variant="outline"
                      onClick={() =>
                        update({
                          grants: profile.grants.filter((v) => v.id !== g.id),
                        })
                      }
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
              </section>
              <section className="pc-section">
                <h3>Access requests · simulation</h3>
                <p className="pc-helper">
                  Create an example request from a blocked policy test below.
                  These are not requests from children’s devices.
                </p>
                {!requests.filter((r) => r.profileId === profile.id).length && (
                  <p className="pc-empty">
                    No example requests for this profile.
                  </p>
                )}
                {requests
                  .filter((r) => r.profileId === profile.id)
                  .map((r) => (
                    <div className="pc-rule" key={r.id}>
                      <span>
                        <code>{r.domain}</code>
                        <small>{r.status}</small>
                      </span>
                      {r.status === 'pending' && (
                        <div className="pc-actions">
                          <Button
                            variant="outline"
                            disabled={
                              r.category === 'malware' &&
                              profile.blockedCategories.includes('malware')
                            }
                            onClick={() =>
                              perform(() => {
                                grant(r.domain, r.profileId, 30);
                                setRequests((old) =>
                                  old.map((item) =>
                                    item.id === r.id
                                      ? { ...item, status: 'approved' }
                                      : item,
                                  ),
                                );
                              })
                            }
                          >
                            Approve 30 min
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setRequests((old) =>
                                old.map((item) =>
                                  item.id === r.id
                                    ? { ...item, status: 'denied' }
                                    : item,
                                ),
                              )
                            }
                          >
                            Deny
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
              </section>
            </TabsContent>
            <TabsContent value="privacy">
              <div className="pc-future">
                <h3>Parent-only administration · deployment requirement</h3>
                <p>
                  The standalone test server has administrator sign-in and
                  expiring sessions; the loopback-only development preview does
                  not. Family-specific roles, recovery, and an administrative
                  audit trail remain future work. These parental policies are
                  not enforced on your network yet.
                </p>
              </div>
              <Toggle
                title="In-app parental alerts"
                description="Draft preference for policy changes and access requests. No live alerts are sent."
                checked={draft.alerts}
                onChange={(alerts) => change({ ...draft, alerts })}
              />
              <Choice
                label="Future DNS report retention"
                value={String(draft.retentionDays)}
                options={[
                  { value: '0', label: 'No domain history' },
                  { value: '7', label: '7 days' },
                  { value: '30', label: '30 days' },
                ]}
                onChange={(v) =>
                  change({
                    ...draft,
                    retentionDays: Number(v) as Draft['retentionDays'],
                  })
                }
              />
              <p className="pc-helper">
                A production retention setting must also control the underlying
                Pi-hole logs. This draft does not change their current
                retention. Store family data locally on TrueNAS, not in a hosted
                demo.
              </p>
              <section className="pc-section">
                <div className="section-head">
                  <h3>Policy tests this session</h3>
                  <Button
                    variant="ghost"
                    disabled={!history.length}
                    onClick={() => setHistory([])}
                  >
                    Clear test history
                  </Button>
                </div>
                <p className="pc-helper">
                  Synthetic decisions, not browsing history. Up to 20 tests are
                  kept in memory and disappear on reload.
                </p>
                {!history.length && (
                  <p className="pc-empty">
                    Run a policy test to see its decision and reason.
                  </p>
                )}
                {history.map((item, index) => (
                  <div className="pc-rule" key={index}>
                    <span>
                      <code>{item.domain}</code>
                      <small>
                        {item.instant} ·{' '}
                        {draft.profiles.find((p) => p.id === item.profileId)
                          ?.name ?? 'Removed profile'}
                      </small>
                      <small>{item.reason}</small>
                    </span>
                    <span
                      className={
                        'badge ' + (item.action === 'block' ? 'red' : 'green')
                      }
                    >
                      {item.action}
                    </span>
                  </div>
                ))}
              </section>
              <Button
                variant="outline"
                disabled={draft.profiles.length === 1}
                onClick={() => setRemoveOpen(true)}
              >
                <Trash2 />
                Remove this draft profile
              </Button>
            </TabsContent>
          </Tabs>
        </section>
      </div>
      <section className="panel pc-tester">
        <div className="section-head">
          <div>
            <h2>
              <FlaskConical />
              Test a policy decision
            </h2>
            <p>
              What would happen for {profile.name || 'this profile'}? No DNS
              lookup is made.
            </p>
          </div>
          <span className="badge">Simulation only</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            testPolicy();
          }}
        >
          <div className="pc-inline">
            <label className="pc-field" htmlFor="pc-test-domain">
              Requested domain
              <Input
                id="pc-test-domain"
                value={testDomain}
                onChange={(e) => {
                  setTestDomain(e.target.value);
                  setResult(null);
                }}
              />
            </label>
            <Choice
              label="Assumed category"
              value={testCategory}
              options={[
                { value: 'unknown', label: 'Unknown / not classified' },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
              onChange={(v) => {
                setTestCategory(v as Category | 'unknown');
                setResult(null);
              }}
            />
            <label className="pc-field" htmlFor="pc-test-time">
              Test instant (UTC)
              <Input
                id="pc-test-time"
                type="datetime-local"
                step="0.001"
                value={testAt}
                onChange={(e) => {
                  setTestAt(e.target.value);
                  setResult(null);
                }}
              />
            </label>
          </div>
          <div className="pc-actions">
            <Button type="submit" disabled={!ready}>
              <FlaskConical />
              Test selected profile
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setTestAt(new Date().toISOString().slice(0, -1));
                setResult(null);
              }}
            >
              Use current time
            </Button>
          </div>
        </form>
        {result && (
          <section
            className={'pc-result ' + result.action}
            aria-label="Policy decision"
            aria-live="polite"
          >
            <strong>
              {result.action === 'block'
                ? 'Would block'
                : result.action === 'restricted'
                  ? 'Would allow with restrictions'
                  : 'No parental block'}
              : {result.domain}
            </strong>
            <p>{result.reason}</p>
            {!!result.restrictions.length && (
              <p>{result.restrictions.join(' · ')}</p>
            )}
            <small>
              This is this module’s decision only. Country rules and existing
              Pi-hole rules may still block it.
            </small>
            {result.action === 'block' && (
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    requests.some(
                      (r) =>
                        r.profileId === result.profileId &&
                        r.domain === result.domain &&
                        r.status === 'pending',
                    )
                  ) {
                    setMessage(
                      'An example request for that domain is already pending.',
                    );
                    return;
                  }
                  setRequests((old) =>
                    [
                      {
                        id: recordId(),
                        profileId: result.profileId,
                        domain: result.domain,
                        category: result.category,
                        status: 'pending' as const,
                      },
                      ...old,
                    ].slice(0, 50),
                  );
                  setMessage(
                    'Added an example request under Websites & approvals.',
                  );
                }}
              >
                Create example access request
              </Button>
            )}
          </section>
        )}
      </section>
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a family profile</DialogTitle>
            <DialogDescription>
              Use an example name. You can assign devices and customize the
              preset next.
            </DialogDescription>
          </DialogHeader>
          <form
            className="pc-dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              perform(() => {
                if (!newName.trim() || newName.trim().length > 60)
                  throw new Error('Enter a profile name of 1–60 characters.');
                const p = createProfile(
                  recordId(),
                  newName.trim(),
                  newPreset,
                );
                p.timezone = timezone;
                change({ ...draft, profiles: [...draft.profiles, p] });
                setSelected(p.id);
                setNewOpen(false);
                setNewName('');
              });
            }}
          >
            <label className="pc-field" htmlFor="pc-new-profile-name">
              Profile name
              <Input
                id="pc-new-profile-name"
                required
                maxLength={60}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <Choice
              label="Starting preset"
              value={newPreset}
              options={Object.entries(presetNames).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={(v) => setNewPreset(v as Preset)}
            />
            <Button type="submit">Create draft profile</Button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {profile.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes its draft rules and releases its example devices.
              Live Pi-hole is unaffected. Export the draft first if you want a
              backup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep profile</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const remaining = draft.profiles.filter(
                  (p) => p.id !== profile.id,
                );
                change({ ...draft, profiles: remaining });
                setSelected(remaining[0].id);
                setRequests((old) =>
                  old.filter((r) => r.profileId !== profile.id),
                );
                setRemoveOpen(false);
              }}
            >
              Remove draft profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
