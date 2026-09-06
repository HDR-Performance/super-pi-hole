# Super Pi Hole 0.4.1-test

Testing prerelease, not a production security appliance.

This corrective release keeps the 0.4 family DNS and Pi-hole feature set and
adds an explicit local no-login mode for the existing one-app TrueNAS upgrade.
The mode is disabled by default in general templates. The existing-app YAML
enables it because this installation is intentionally managed only on the
trusted local network.

The existing-app template explicitly disables both logins: it sets
`FTLCONF_webserver_api_password` and the matching internal `PIHOLE_PASSWORD` to
empty values, and enables `SUPER_PIHOLE_AUTH_DISABLED`. Anyone who can reach
ports 20720 or 20721 can view DNS activity and change filtering, so never
port-forward either interface.

The upgrade still preserves the original Pi-hole directories and retained
`ix-super-pi-hole_super-pi-hole-data` volume. Take a TrueNAS snapshot first and
stop the existing `pihole` app before saving the replacement YAML. The fragile
startup-blocking backup container is intentionally omitted from this profile.

Balanced default continues to allow YouTube and social media. Platform blocks,
adult content, gambling, Windows telemetry and LG webOS packs remain opt-in.

Country firewall enforcement, bandwidth telemetry and universal HTTPS block
page redirection are not included. Hardware deployment remains a separate test
after automated integrated DNS checks pass.
