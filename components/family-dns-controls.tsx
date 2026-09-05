'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Checkbox } from './ui/checkbox';
import { liveApi, useData, QueryLog } from './live-pihole';
import { socialServices, validateFamily } from '@/lib/family-dns.mjs';
import { recordId } from '@/lib/record-id';

type Schedule = {
  id: string;
  enabled: boolean;
  days: number[];
  start: string;
  end: string;
  mode: 'block-during' | 'allow-during';
  services: string[];
  domains: string[];
};
type Profile = {
  groupId: number;
  name: string;
  timezone: string;
  blocked: string[];
  schedules: Schedule[];
};
type Config = {
  version: number;
  paused: boolean;
  detailDays: number;
  profiles: Profile[];
};
type Event = {
  id: number;
  at: number;
  severity: string;
  message: string;
  acknowledged: number;
};
export type FamilyState = {
  revision: number;
  config: Config;
  status: string;
  error: string | null;
  checkedAt: number | null;
  blocking: string | null;
  writeEnabled: boolean;
  busy: boolean;
  unread: number;
  events: Event[];
  daily: { day: string; changes: number; errors: number }[];
};
type Inventory = {
  groups: { id: number; name: string; enabled: boolean }[];
  clients: { client: string; groups: number[]; comment: string | null }[];
  devices: { hwaddr: string; ips: { ip: string; name: string | null }[] }[];
};
function useFamily() {
  const [revision, refresh] = useState(0);
  const result = useData<FamilyState>('family/state', revision);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) refresh((n) => n + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  return { ...result, refresh: () => refresh((n) => n + 1) };
}
export function FamilyDnsControls() {
  const family = useFamily();
  const inventory = useData<Inventory>('devices', family.data?.revision ?? 0);
  return (
    <section className="sph-family-live">
      <div className="section-head">
        <div>
          <p className="eyebrow">CONNECTED DNS CONTROLS</p>
          <h1>Family & social controls</h1>
          <p>
            One profile per Pi-hole group. Shared here, in Schedules and in
            Blocklists.
          </p>
        </div>
        <Button variant="outline" onClick={family.refresh}>
          Refresh status
        </Button>
      </div>
      {(family.error || inventory.error) && (
        <p role="alert" className="pc-error">
          {family.error || inventory.error}
        </p>
      )}
      {family.data && inventory.data ? (
        <FamilyEditor
          key={family.data.revision}
          value={family.data}
          inventory={inventory.data}
          refresh={family.refresh}
        />
      ) : (
        <p>Loading saved controls and connected groups…</p>
      )}
    </section>
  );
}
function FamilyEditor({
  value,
  inventory,
  refresh,
}: {
  value: FamilyState;
  inventory: Inventory;
  refresh: () => void;
}) {
  const [draft, setDraft] = useState(value.config),
    [selected, setSelected] = useState(value.config.profiles[0]?.groupId ?? -1);
  const [group, setGroup] = useState(''),
    [history, setHistory] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const profile = draft.profiles.find((p) => p.groupId === selected);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value.config);
  const locked =
    busy || value.busy || !value.writeEnabled || value.status === 'attention';
  const update = (next: Profile) =>
    setDraft((d) => ({
      ...d,
      profiles: d.profiles.map((p) => (p.groupId === next.groupId ? next : p)),
    }));
  const run = async (action: string, body: unknown) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await liveApi<FamilyState>(
        'family/' + action,
        undefined,
        body,
      );
      setMessage(
        result.status === 'applied'
          ? 'Managed DNS rules verified in Pi-hole.'
          : 'Settings retained; inspect the control status below.',
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
      refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="panel">
        <div className="section-head">
          <h2>{dirty ? 'Unsaved family changes' : 'Family controller'}</h2>
          <span
            className={`badge ${value.status === 'applied' && value.blocking === 'enabled' ? '' : 'amber'}`}
          >
            {value.status === 'applied'
              ? value.blocking === 'enabled'
                ? 'DNS rules verified'
                : 'Global DNS blocking off'
              : value.status}
          </span>
        </div>
        <p>
          DNS requests only—not a firewall. Existing connections, cached
          answers, VPNs, private/encrypted DNS and direct IPs may bypass
          filtering. Pi-hole allow rules still take precedence. Removing one of
          our blocks does not override other policies.
        </p>
        <small>
          Schedule checks run on the server every 30 seconds, even when this
          browser is closed. Last engine check:{' '}
          {value.checkedAt
            ? new Date(value.checkedAt).toLocaleString()
            : 'Not yet applied'}
          . If this app stops, the last engine rules remain until it recovers.
        </small>
        {value.error && (
          <p role="alert" className="pc-error">
            {value.error}
          </p>
        )}
        {value.status === 'attention' && (
          <>
            <p>
              Automatic family writes are stopped. Review current Domain rules
              under Live Pi-hole. Retry explicitly restores only rules marked
              “Super Pi Hole family v1” to the saved policy. Other settings are
              untouched.
            </p>
            <Button
              disabled={busy || !value.writeEnabled}
              variant="outline"
              onClick={() => {
                if (
                  window.confirm(
                    'I reviewed the current managed rules. Reconcile those rules with the saved family policy? Existing unrelated rules will not be overwritten.',
                  )
                )
                  void run('retry', {
                    revision: value.revision,
                    confirmed: true,
                    acknowledgement: 'RECONCILE MANAGED RULES',
                  });
              }}
            >
              Reconcile reviewed family rules
            </Button>
          </>
        )}
        <div className="sph-family-master">
          <Switch
            id="family-master-dns"
            disabled={locked || !draft.profiles.length}
            checked={draft.paused}
            onCheckedChange={(paused) => setDraft((d) => ({ ...d, paused }))}
          />
          <label htmlFor="family-master-dns">
            <strong>Pause DNS for every registered family group</strong>
            <small>
              Blocks new domain lookups with a catch-all rule. This cannot shut
              down all Internet traffic or override allowlists.
            </small>
          </label>
        </div>
        <div className="sph-actions">
          <Button
            disabled={locked || !dirty}
            onClick={() => {
              try {
                validateFamily(draft);
              } catch (e) {
                setError((e as Error).message);
                return;
              }
              if (
                window.confirm(
                  `Apply family DNS rules for ${draft.profiles.length} groups? ${draft.paused ? 'The family-wide DNS pause is ON. ' : ''}These are live engine changes. Other allowlists and filtering rules remain in effect.`,
                )
              )
                void run('save', {
                  revision: value.revision,
                  config: draft,
                  confirmed: true,
                });
            }}
          >
            {busy ? 'Applying…' : 'Apply family DNS changes'}
          </Button>
          <Button
            variant="outline"
            disabled={busy || !dirty}
            onClick={() => setDraft(value.config)}
          >
            Discard draft
          </Button>
        </div>
        {(error || message) && (
          <p
            role={error ? 'alert' : 'status'}
            className={error ? 'pc-error' : 'pc-feedback'}
          >
            {error || message}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Registered family groups</h2>
        <p>
          Create dedicated groups in Live Pi-hole → Groups, then register them
          here. In Devices, click a device and assign its family group. Avoid
          sharing a group between family and infrastructure devices.
        </p>
        <div className="sph-actions">
          {draft.profiles.map((p) => (
            <Button
              key={p.groupId}
              variant={selected === p.groupId ? 'default' : 'outline'}
              onClick={() => {
                setSelected(p.groupId);
                setHistory('');
              }}
            >
              {p.name}
            </Button>
          ))}
        </div>
        <div className="sph-actions">
          <label>
            Pi-hole group
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Select a dedicated group</option>
              {inventory.groups
                .filter(
                  (g) =>
                    g.id > 0 &&
                    g.enabled &&
                    !draft.profiles.some((p) => p.groupId === g.id),
                )
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={locked || !group}
            onClick={() => {
              const g = inventory.groups.find((g) => g.id === Number(group));
              if (!g) return;
              setDraft((d) => ({
                ...d,
                profiles: [
                  ...d.profiles,
                  {
                    groupId: g.id,
                    name: g.name,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    blocked: [],
                    schedules: [],
                  },
                ],
              }));
              setSelected(g.id);
              setGroup('');
            }}
          >
            Register group
          </Button>
        </div>
      </section>
      {profile && (
        <>
          <section className="panel">
            <div className="section-head">
              <h2>{profile.name}</h2>
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => {
                  if (
                    window.confirm(
                      'Unregister this group and remove only its managed family blocks when you apply? Its existing Pi-hole assignments remain.',
                    )
                  ) {
                    setDraft((d) => ({
                      ...d,
                      profiles: d.profiles.filter(
                        (p) => p.groupId !== profile.groupId,
                      ),
                    }));
                    setSelected(-1);
                  }
                }}
              >
                Unregister group
              </Button>
            </div>
            <div className="sph-form-grid">
              <label>
                Profile name
                <input
                  disabled={locked}
                  value={profile.name}
                  onChange={(e) => update({ ...profile, name: e.target.value })}
                />
              </label>
              <label>
                Schedule time zone
                <input
                  disabled={locked}
                  value={profile.timezone}
                  placeholder="America/Los_Angeles"
                  onChange={(e) =>
                    update({ ...profile, timezone: e.target.value })
                  }
                />
              </label>
            </div>
            <h3>Assigned clients and history</h3>
            <p>
              These are explicit Pi-hole client assignments, not proof that each
              client is online. Use Devices to change assignments. Query history
              can reveal sensitive household activity.
            </p>
            <div className="sph-actions">
              {inventory.clients
                .filter((c) => c.groups.includes(profile.groupId))
                .map((c) => (
                  <Button
                    key={c.client}
                    variant="outline"
                    onClick={() => {
                      const mac = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(
                        c.client,
                      );
                      const observed = inventory.devices.find(
                        (d) =>
                          d.hwaddr.toLowerCase() === c.client.toLowerCase() ||
                          d.ips.some((a) => a.name === c.client),
                      )?.ips[0]?.ip;
                      const ip =
                        observed ??
                        (!mac &&
                        !c.client.includes('/') &&
                        (/^\d+\.\d+\.\d+\.\d+$/.test(c.client) ||
                          c.client.includes(':'))
                          ? c.client
                          : null);
                      if (ip) setHistory(ip);
                      else
                        setError(
                          'No individual IP is available for this assignment. Open Devices and choose its observed address for history.',
                        );
                    }}
                  >
                    {c.comment || c.client} · DNS history
                  </Button>
                ))}
            </div>
            {!inventory.clients.some((c) =>
              c.groups.includes(profile.groupId),
            ) && <p>No explicitly assigned clients in this group yet.</p>}
          </section>
          <section className="panel">
            <div className="section-head">
              <h2>Social platforms</h2>
              <Button
                variant="outline"
                disabled={locked}
                onClick={() =>
                  update({
                    ...profile,
                    blocked: socialServices.map((s) => s.id),
                  })
                }
              >
                Block all listed platforms
              </Button>
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => update({ ...profile, blocked: [] })}
              >
                Clear platform blocks
              </Button>
            </div>
            <p>
              Switch on to block the listed hostnames and their subdomains. This
              is a compact reviewed starter catalog, not every platform or every
              regional endpoint. Schedules can add blocks independently.
            </p>
            <div className="sph-social-grid">
              {socialServices.map((s) => (
                <article key={s.id}>
                  <div className="sph-family-master">
                    <Switch
                      id={'social-' + s.id}
                      disabled={locked}
                      checked={profile.blocked.includes(s.id)}
                      onCheckedChange={(block) =>
                        update({
                          ...profile,
                          blocked: block
                            ? [...profile.blocked, s.id]
                            : profile.blocked.filter((id) => id !== s.id),
                        })
                      }
                    />
                    <label htmlFor={'social-' + s.id}>
                      <strong>{s.name}</strong>
                      <small>
                        {profile.blocked.includes(s.id)
                          ? 'Block selected'
                          : 'No permanent family block'}
                      </small>
                    </label>
                  </div>
                  <details>
                    <summary>{s.domains.length} domain suffixes</summary>
                    <p>{s.domains.join(', ')}</p>
                    {s.warning && <small>{s.warning}</small>}
                  </details>
                </article>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="section-head">
              <h2>Website & platform schedules</h2>
              <Button
                variant="outline"
                disabled={locked || profile.schedules.length >= 20}
                onClick={() =>
                  update({
                    ...profile,
                    schedules: [
                      ...profile.schedules,
                      {
                        id: recordId(),
                        enabled: true,
                        days: [1, 2, 3, 4, 5],
                        start: '21:00',
                        end: '07:00',
                        mode: 'block-during',
                        services: [],
                        domains: [],
                      },
                    ],
                  })
                }
              >
                Add schedule
              </Button>
            </div>
            <p>
              Overnight rules belong to the day they start. “Access window” adds
              blocks outside the window; it never bypasses other rules or
              permanent social switches.
            </p>
            {profile.schedules.map((s) => (
              <ScheduleEditor
                key={s.id}
                value={s}
                disabled={locked}
                update={(next) =>
                  update({
                    ...profile,
                    schedules: profile.schedules.map((x) =>
                      x.id === s.id ? next : x,
                    ),
                  })
                }
                remove={() =>
                  update({
                    ...profile,
                    schedules: profile.schedules.filter((x) => x.id !== s.id),
                  })
                }
              />
            ))}
            {!profile.schedules.length && (
              <p>No live schedules for this group.</p>
            )}
          </section>
          {history && (
            <QueryLog
              key={history}
              revision={value.revision}
              initial={{ client_ip: history }}
              prepareRule={async (domain, type) => {
                if (
                  !window.confirm(
                    `${type === 'deny' ? 'Block' : 'Allow'} ${domain} for ${profile.name}? An allow rule can override family blocks.`,
                  )
                )
                  return;
                try {
                  await liveApi('action', undefined, {
                    action: 'domain-add',
                    domain,
                    type,
                    kind: 'exact',
                    groups: [profile.groupId],
                    enabled: true,
                    comment: 'Family history manual rule',
                    confirmed: true,
                  });
                  setMessage('Manual domain rule submitted and read back.');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          )}
        </>
      )}
      <section className="panel">
        <h2>Privacy & retention</h2>
        <label>
          Family notification detail retention (0–30 days)
          <input
            type="number"
            min={0}
            max={30}
            disabled={locked}
            value={draft.detailDays}
            onChange={(e) =>
              setDraft((d) => ({ ...d, detailDays: Number(e.target.value) }))
            }
          />
        </label>
        <p>
          Only family-control notifications use this limit. Daily change/error
          counts are retained for up to 365 days, without device names or
          domains. Pi-hole query history and system logs are separate: configure
          query retention under Settings & tools. Traffic-byte history is
          unavailable without a gateway collector.
        </p>
      </section>
    </>
  );
}
function ScheduleEditor({
  value: s,
  update,
  remove,
  disabled,
}: {
  value: Schedule;
  update: (s: Schedule) => void;
  remove: () => void;
  disabled: boolean;
}) {
  const [domains, setDomains] = useState(s.domains.join('\n'));
  return (
    <fieldset className="sph-family-schedule" disabled={disabled}>
      <legend>Schedule</legend>
      <div className="sph-actions">
        <label className="sph-check" htmlFor={'schedule-enabled-' + s.id}>
          <Switch
            id={'schedule-enabled-' + s.id}
            checked={s.enabled}
            onCheckedChange={(enabled) => update({ ...s, enabled })}
          />
          Enabled
        </label>
        <Button variant="outline" onClick={remove}>
          Remove schedule
        </Button>
      </div>
      <div className="sph-form-grid">
        <label>
          Mode
          <select
            value={s.mode}
            onChange={(e) =>
              update({ ...s, mode: e.target.value as Schedule['mode'] })
            }
          >
            <option value="block-during">Block during window</option>
            <option value="allow-during">Access window (block outside)</option>
          </select>
        </label>
        <label>
          Starts
          <input
            type="time"
            value={s.start}
            onChange={(e) => update({ ...s, start: e.target.value })}
          />
        </label>
        <label>
          Ends
          <input
            type="time"
            value={s.end}
            onChange={(e) => update({ ...s, end: e.target.value })}
          />
        </label>
      </div>
      <div className="sph-actions">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
          <label className="sph-check" key={day}>
            <Checkbox
              checked={s.days.includes(i)}
              onCheckedChange={(v) =>
                update({
                  ...s,
                  days: v ? [...s.days, i] : s.days.filter((d) => d !== i),
                })
              }
            />
            {day}
          </label>
        ))}
      </div>
      <div className="sph-actions">
        {socialServices.map((p) => (
          <label className="sph-check" key={p.id}>
            <Checkbox
              checked={s.services.includes(p.id)}
              onCheckedChange={(v) =>
                update({
                  ...s,
                  services: v
                    ? [...s.services, p.id]
                    : s.services.filter((id) => id !== p.id),
                })
              }
            />
            {p.name}
          </label>
        ))}
      </div>
      <label>
        Additional websites (one hostname per line)
        <textarea
          rows={3}
          value={domains}
          placeholder="example.com"
          onChange={(e) => {
            setDomains(e.target.value);
            update({
              ...s,
              domains: e.target.value
                .split(/\s+/)
                .filter(Boolean)
                .map((d) => d.toLowerCase()),
            });
          }}
        />
      </label>
    </fieldset>
  );
}
export function FamilyNotifications() {
  const family = useFamily();
  const [error, setError] = useState('');
  return (
    <>
      <h1>Notifications</h1>
      <p>
        Live family-control changes, conflicts and engine failures. Refreshed
        every five seconds. This does not claim to detect incoming connections
        or traffic countries.
      </p>
      {(family.error || error) && <p role="alert">{family.error || error}</p>}
      <section className="panel">
        <h2>{family.data?.unread ?? '…'} unread</h2>
        {family.data?.events.map((e) => (
          <article key={e.id} className="sph-notification">
            <span className="badge amber">{e.severity}</span>
            <div>
              <strong>{e.message}</strong>
              <small>{new Date(e.at).toLocaleString()}</small>
            </div>
            <Button
              variant="outline"
              disabled={!!e.acknowledged}
              onClick={async () => {
                try {
                  await liveApi('family/ack', undefined, { id: e.id });
                  family.refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {e.acknowledged ? 'Read' : 'Mark read'}
            </Button>
          </article>
        ))}
        {family.data && !family.data.events.length && (
          <p>No retained family-control notifications.</p>
        )}
      </section>
      <section className="panel">
        <h2>Daily control summary · up to one year</h2>
        <p>
          Counts of policy operations, not DNS query totals or traffic bytes.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>UTC date</th>
              <th>Changes</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {family.data?.daily.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{d.changes}</td>
                <td>{d.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
