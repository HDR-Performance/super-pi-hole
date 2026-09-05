#!/bin/bash
# Application updates are performed by reviewed Super Pi Hole image releases.
case "${1:-}" in
  -up|updatePihole|checkout|repair|-r|reconfigure|uninstall)
    echo 'Managed by Super Pi Hole. Install a reviewed Super Pi Hole release through TrueNAS/Docker.' >&2
    exit 1 ;;
  updatechecker)
    exit 0 ;;
esac
exec /opt/pihole/pihole-upstream "$@"
