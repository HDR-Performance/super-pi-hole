// Deployment/authentication paths intentionally cannot be edited through the DNS UI.
const protectedDns = new Set([
  'dns.port',
  'dns.interface',
  'dns.listeningMode',
]);
export function editableSetting(path) {
  if (protectedDns.has(path)) return false;
  return (
    /^(dns|dhcp|resolver|database)\./.test(path) ||
    /^ntp\.(ipv4|ipv6)\./.test(path) ||
    /^ntp\.sync\.(active|server|interval|count)$/.test(path) ||
    path === 'misc.privacylevel'
  );
}

export function flattenSettings(config, prefix = '') {
  const fields = [];
  if (!config || typeof config !== 'object' || Array.isArray(config))
    return fields;
  for (const [key, value] of Object.entries(config)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.hasOwn(value, 'value') &&
      typeof value.type === 'string'
    ) {
      // Never forward password fields, file paths, or engine session secrets.
      if (editableSetting(path) || protectedDns.has(path))
        fields.push({
          ...value,
          path,
          editable: editableSetting(path) && !value.flags?.env_var,
        });
    } else fields.push(...flattenSettings(value, path));
  }
  return fields;
}

export function validateSetting(field, value) {
  if (typeof field.value === 'boolean' && typeof value !== 'boolean')
    return 'Choose enabled or disabled.';
  if (
    typeof field.value === 'number' &&
    (typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (field.type !== 'double' && !Number.isSafeInteger(value)))
  )
    return 'Enter a valid number.';
  if (typeof value === 'number' && field.type.includes('unsigned') && value < 0)
    return 'Enter zero or a positive number.';
  if (
    typeof field.value === 'string' &&
    (typeof value !== 'string' ||
      value.length > 4096 ||
      value.includes('\0') ||
      /[\r\n]/.test(value))
  )
    return 'Enter a single line of text, up to 4096 characters.';
  if (
    Array.isArray(field.value) &&
    (!Array.isArray(value) ||
      value.length > 10000 ||
      value.some(
        (v) =>
          typeof v !== 'string' ||
          v.length > 4096 ||
          v.includes('\0') ||
          /[\r\n]/.test(v),
      ))
  )
    return 'Enter one text item per line.';
  if (
    Array.isArray(field.allowed) &&
    !field.allowed.some((option) => String(option.item) === String(value))
  )
    return 'Choose one of the supported values.';
  if (field.path === 'misc.privacylevel' && ![0, 1, 2, 3].includes(value))
    return 'Privacy level must be 0, 1, 2 or 3.';
  return '';
}

export function settingPayload(changes) {
  const config = {};
  for (const change of changes) {
    const keys = change.path.split('.');
    if (
      keys.some(
        (k) =>
          !/^[A-Za-z][A-Za-z0-9_]*$/.test(k) ||
          ['__proto__', 'constructor', 'prototype'].includes(k),
      )
    )
      throw Error('Invalid setting path.');
    let target = config;
    for (const key of keys.slice(0, -1)) target = target[key] ??= {};
    target[keys.at(-1)] = change.value;
  }
  return config;
}
