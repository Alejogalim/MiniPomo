#!/bin/sh
# Runs after the .deb/.rpm is unpacked. Puts a launcher on the Desktop of every
# user who has one, so MiniPomo is one click away after installing.

[ "$1" = "configure" ] || exit 0

for home in /home/*; do
  [ -d "$home/Desktop" ] || continue
  user=$(basename "$home")
  [ "$user" = "lost+found" ] && continue
  launcher="$home/Desktop/MiniPomo.desktop"
  cp /usr/share/applications/MiniPomo.desktop "$launcher" 2>/dev/null || continue
  chown "$user" "$launcher" 2>/dev/null || true
  chmod +x "$launcher"
  # GNOME refuses to run a launcher it has not seen before unless it is trusted.
  su -s /bin/sh "$user" -c "gio set '$launcher' metadata::trusted true" 2>/dev/null || true
done

exit 0
