'use client';
import { useState } from 'react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Checkbox } from './ui/checkbox';
import { Choice, TextField } from './review-context';
import { useData, type Pending } from './live-pihole';
import { GravityControl } from './gravity-control';

type Entry = {
  id: number;
  name?: string;
  address?: string;
  client?: string;
  type?: string;
  enabled?: boolean;
  comment: string | null;
  groups?: number[];
  number?: number;
};
type Kind = 'groups' | 'lists' | 'clients';
const display = (item: Entry) =>
  item.address ?? item.client ?? item.name ?? 'Unnamed';

export function FilteringManager({
  kind,
  revision,
  locked,
  confirm,
}: {
  kind: Kind;
  revision: number;
  locked: boolean;
  confirm: (p: Pending) => void;
}) {
  const inventory = useData<Record<Kind, Entry[]>>(kind, revision);
  const groups = useData<{ groups: Entry[] }>('groups', revision);
  const [entry, setEntry] = useState<Entry | null>(null),
    [name, setName] = useState(''),
    [filter, setFilter] = useState(''),
    [comment, setComment] = useState(''),
    [enabled, setEnabled] = useState(true),
    [selected, setSelected] = useState<number[]>([0]),
    [type, setType] = useState('block');
  const noun =
    kind === 'groups'
      ? 'group'
      : kind === 'lists'
        ? 'subscription'
        : 'client assignment';
  const reset = () => {
    setEntry(null);
    setName('');
    setComment('');
    setEnabled(true);
    setSelected([0]);
    setType('block');
  };
  const ready = !locked && !!inventory.data && !!groups.data;
  const body = (remove = false) => ({
    action:
      kind === 'groups'
        ? remove
          ? 'group-delete'
          : 'group-save'
        : kind === 'lists'
          ? remove
            ? 'list-delete'
            : 'list-save'
          : remove
            ? 'client-delete'
            : 'client-save',
    create: !entry,
    expected: entry,
    name,
    previous: entry?.name,
    address: name,
    client: name,
    type,
    comment: comment || null,
    enabled,
    groups: selected,
  });
  return (
    <section className="panel sph-filter-manager">
      <h2>
        {kind === 'lists'
          ? 'Blocklists & allowlists'
          : kind === 'groups'
            ? 'Filtering groups'
            : 'Client assignments'}
      </h2>
      <p>
        {kind === 'groups'
          ? 'Groups connect devices to domain rules and subscriptions. Disabling a group stops its filtering rules; it does not pause Internet access.'
          : kind === 'lists'
            ? 'Manage subscriptions here, then update Gravity to download their domain data. This does not update application code.'
            : 'Assign real Pi-hole filtering groups using an IP, subnet, MAC, hostname or interface. Use Devices for the observed-device picker. Removing an assignment returns the client to Pi-hole’s default matching behavior; it does not disconnect it.'}
      </p>
      {(inventory.error || groups.error) && (
        <p role="alert" className="pc-error">
          {inventory.error || groups.error}
        </p>
      )}
      <TextField
        id={'filter-' + kind}
        label={'Find a ' + noun}
        value={filter}
        onChange={setFilter}
      />
      <div className="sph-scroll-table sph-inventory-table">
        <table>
          <thead>
            <tr>
              <th>
                {kind === 'groups'
                  ? 'Name'
                  : kind === 'lists'
                    ? 'Subscription'
                    : 'Client'}
              </th>
              <th>{kind === 'groups' ? 'Comment' : 'Groups'}</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {inventory.data?.[kind]
              ?.filter((e) =>
                `${display(e)} ${e.comment ?? ''}`
                  .toLowerCase()
                  .includes(filter.toLowerCase()),
              )
              .map((item) => (
                <tr key={item.id}>
                  <td>
                    {display(item)}
                    {item.type && (
                      <small className="sph-sub">
                        {item.type} list · {item.number ?? 0} domains
                      </small>
                    )}
                  </td>
                  <td>
                    {kind === 'groups'
                      ? item.comment
                      : (item.groups ?? [])
                          .map(
                            (id) =>
                              groups.data?.groups.find((g) => g.id === id)
                                ?.name ?? `Group ${id}`,
                          )
                          .join(', ') || 'No groups'}
                  </td>
                  <td>
                    {kind === 'clients'
                      ? 'Assigned'
                      : item.enabled
                        ? 'Enabled'
                        : 'Disabled'}
                  </td>
                  <td>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEntry(item);
                        setName(display(item));
                        setComment(item.comment ?? '');
                        setEnabled(item.enabled ?? true);
                        setSelected(item.groups ?? [0]);
                        setType(item.type ?? 'block');
                      }}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {inventory.data?.[kind]?.length === 0 && <p>No {kind} configured.</p>}
      <div className="sph-actions">
        <h3>{entry ? `Edit ${noun}` : `New ${noun}`}</h3>
        <Button variant="outline" onClick={reset}>
          New {noun}
        </Button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          confirm({
            title: `${entry ? 'Update' : 'Create'} ${noun}?`,
            description: `${name}. ${kind !== 'groups' ? `Groups: ${selected.map((id) => groups.data?.groups.find((g) => g.id === id)?.name ?? id).join(', ') || 'none (no filtering groups)'}. ` : ''}This changes Pi-hole filtering, not the policy simulator. ${kind === 'lists' ? 'Update Gravity afterwards.' : ''}`,
            body: body(),
          });
        }}
      >
        {entry && kind !== 'groups' ? (
          <p>
            <strong>{name}</strong>
            <small className="sph-sub">
              The identifier stays unchanged. Create a new entry to use another
              address.
            </small>
          </p>
        ) : (
          <TextField
            id={'entry-' + kind}
            label={
              kind === 'groups'
                ? 'Group name'
                : kind === 'lists'
                  ? 'HTTPS list URL'
                  : 'IP / CIDR subnet / MAC / hostname / :interface'
            }
            value={name}
            onChange={setName}
            placeholder={
              kind === 'clients' ? '192.0.2.0/24 or :eth0' : undefined
            }
          />
        )}
        <TextField
          id={'comment-' + kind}
          label="Comment"
          value={comment}
          onChange={setComment}
        />
        {kind !== 'clients' && (
          <label className="sph-check" htmlFor={'enabled-' + kind}>
            <Switch
              id={'enabled-' + kind}
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            Enabled
          </label>
        )}
        {kind === 'lists' && (
          <Choice
            label="Subscription type"
            value={type}
            onChange={setType}
            disabled={!!entry}
            options={[
              { value: 'block', label: 'Block list' },
              { value: 'allow', label: 'Allow list' },
            ]}
          />
        )}
        {kind !== 'groups' && (
          <fieldset className="sph-groups">
            <legend>Filtering groups</legend>
            {groups.data?.groups.map((g) => (
              <label key={g.id} htmlFor={`${kind}-group-${g.id}`}>
                <Checkbox
                  id={`${kind}-group-${g.id}`}
                  checked={selected.includes(g.id)}
                  onCheckedChange={(checked) =>
                    setSelected((s) =>
                      checked
                        ? [...new Set([...s, g.id])]
                        : s.filter((id) => id !== g.id),
                    )
                  }
                />
                {g.name}
                {!g.enabled && ' (disabled)'}
              </label>
            ))}
          </fieldset>
        )}
        {kind !== 'groups' && !selected.length && (
          <p>
            No group is selected. This entry will not apply any group filtering.
          </p>
        )}
        {kind === 'clients' && (
          <p>
            Subnet/interface rules can target multiple devices. MAC matching
            normally requires devices on the same network segment; hostname
            matching depends on name resolution.
          </p>
        )}
        <div className="sph-actions">
          <Button
            disabled={
              !ready ||
              !name.trim() ||
              selected.some(
                (id) => !groups.data?.groups.some((g) => g.id === id),
              )
            }
          >
            Review {noun}
          </Button>
          {entry && (
            <Button
              type="button"
              variant="outline"
              disabled={!ready || (kind === 'groups' && entry.id === 0)}
              onClick={() =>
                confirm({
                  title: `Delete ${noun}?`,
                  description: `Remove ${name} from Pi-hole. Associated devices' filtering may change. There is no automatic undo; export a backup first.`,
                  body: body(true),
                })
              }
            >
              Delete selected
            </Button>
          )}
        </div>
      </form>
      {kind === 'lists' && <GravityControl />}
    </section>
  );
}
