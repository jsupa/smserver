# SMServer12 CLI Commands

Run from `/Applications/SMServer12.app/`:

```bash
cd /Applications/SMServer12.app
./SMServer12 [options]
```

**IMPORTANT:** You MUST pass at least one argument to trigger CLI (headless) mode. Without any arguments, the app tries to launch `UIApplicationMain` and crashes on iOS 12.

## Working Command (tested on iPhone 6, iOS 12.5.8)

```bash
./SMServer12 --no_secure --server_port 8080 --debug
```

Disables TLS (required — cert password mismatch), runs on port 8080, debug logging enabled.

## Default Settings

| Setting | Default |
|---------|---------|
| Server Port | 8741 |
| Socket Port | 8740 |
| Password | `toor` |
| TLS | Enabled |
| Authentication | Enabled |
| Theme | Dark |
| Web Interface | Enabled |

## All Options

```
usage: ./smserver [options]

Options:

-p, --server_port:
    Sets HTTP server port. Requires value. Default: 8741.
    Example: --server_port 4000

-w, --socket_port:
    Sets websocket port. Requires value. Default: 8740.

--subdir:
    Sets websocket subdirectory for reverse proxy setups.

--password:
    Sets server password. Requires value. Default: 'toor'.

-t, --theme:
    Sets web interface theme. Value: light, dark, or nord.

--default_chats, --default_messages, --default_photos:
    Sets number of chats/messages/photos to load. Defaults: 40/100/40.

-a, --authentication, --no_authentication:
    Enable/disable authentication. Default: enabled.

-i, --web_interface, --no_web_interface:
    Enable/disable web interface (not API). Default: enabled.

-s, --secure, --no_secure:
    Enable/disable TLS. Default: enabled.

-j, --subject, --no_subject:
    Enable/disable subject line in web UI. Default: disabled.

-y, --typing, --no_typing:
    Enable/disable typing indicators. Default: enabled.

-o, --contacts, --no_contacts:
    Enable/disable contact-based conversation combining. Default: disabled.

-b, --background, --no_background:
    Run in background after terminal exit. Use with &. Default: disabled.

-d, --debug, --no_debug:
    Enable/disable debug messages. Default: disabled.

-h, --help:
    Shows this help message.
```

## Notes

- All `--no_*` flags use **underscores** (`_`), not hyphens (`-`)
- Example: `--no_secure` NOT `--no-secure`
- Certs required in app directory: `cert.der`, `identity.pfx`, `smserver_cert_pass.txt`
