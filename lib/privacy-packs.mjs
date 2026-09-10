export const privacyPackDomains = Object.freeze({
  'windows-telemetry': Object.freeze([
    'settings-win.data.microsoft.com',
  ]),
  'lg-telemetry': Object.freeze([]),
});

export const privacyRuleOwner = (packId, domain) =>
  `Super Pi Hole network v1: privacy:${packId}:${domain}`;
