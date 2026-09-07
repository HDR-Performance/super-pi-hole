# Optional LanCache quick setup

Both apps remain independent. New installs leave the integration off until the owner links them.

1. Open LanCache → Settings → Create setup code.
2. Open Super Pi Hole → Settings & tools → Integrations. The LanCache same-server shortcut opens this page directly using #lancache.
3. Paste the code. Choose Steam, PC gaming (Steam, Epic, Battle.net, EA, Ubisoft, Riot, Xbox/Microsoft), or all catalog services.
4. Connect & prepare preset verifies identity and cache health, loads addresses and rules, preserves existing selections, and prepares a conflict-checked preview.
5. Enable reviewed cache DNS. Devices must use Super Pi Hole for DNS. Restart Steam after applying its discovery rule.

For different servers or ports, use the address in the setup code or the editable connection details. LanCache management must be a private IP address under the current integration contract. Never change the cache's origin resolver to point back to itself. Preview or pairing alone does not modify DNS. Disabling the Super Pi Hole integration restores its owned DNS routes; disabling the LanCache endpoint alone does not remove DNS rules.

The code is a private read-only credential. Stored tokens remain encrypted on Super Pi Hole; LANCache stores only a hash. Replacing the code requires reconnecting existing peers. The source update also fixes the disappearing preview and uses the preview revision when applying.
