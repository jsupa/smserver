# SMServer API Reference

Complete REST API and WebSocket protocol documentation for SMServer — the iMessage gateway for jailbroken iOS devices.

## Base URLs

| Service | Default Port | Local (via iproxy) |
|---------|:---:|---|
| HTTP REST API | `8741` | `http://localhost:8085` |
| WebSocket | `8740` | `ws://localhost:8081` |

> **Note:** When running behind `iproxy`, ports may differ (e.g. `8085→8080`, `8081→8081`). All examples use localhost with typical proxy ports.

---

## Authentication

SMServer uses password-based authentication. Once authenticated, the server tracks your IP address.

### Authenticate

```bash
GET /requests?password=<password>
```

**Auth required:** No  
**Response:** Plain text `"true"` or `"false"`

```bash
# Authenticate (default password: toor)
curl 'http://localhost:8085/requests?password=toor'
# → true
```

> Failed attempts incur a 2-second delay to prevent brute-force attacks.

All other endpoints require prior authentication. Unauthenticated requests return HTTP `403`.

---

## REST API Endpoints

### 1. Get Messages

Retrieve messages from one or more conversations.

```
GET /requests?messages=<chat_id>&num_messages=<n>&messages_offset=<n>&read_messages=<bool>&messages_from=<0|1|2>
```

| Parameter | Req'd | Type | Default | Description |
|-----------|:---:|------|---------|-------------|
| `messages` | Yes | string | — | Chat identifier. Comma-separate for multiple (e.g. `+15551234567,email@icloud.com`) |
| `num_messages` | No | int | app setting | Number of messages. `0` = all |
| `messages_offset` | No | int | `0` | Pagination offset |
| `read_messages` | No | bool | `false` | Mark as read when `"true"` |
| `messages_from` | No | int | `0` | `0`=all, `1`=sent, `2`=received |

**Response:** JSON array of message objects.

```bash
# Messages from a phone number
curl 'http://localhost:8085/requests?messages=%2B15551234567'

# 500 messages from a group chat, mark read
curl 'http://localhost:8085/requests?messages=chat192370112946281736&num_messages=500&read_messages=true'
```

#### Message Object

```json
{
  "ROWID": 7,
  "guid": "1899E6BF-8F30-4355-BE3B-58D2132E1618",
  "date": 806862241785669100,
  "date_read": 0,
  "is_from_me": false,
  "text": "Meow",
  "subject": "",
  "chat_identifier": "+15551234567",
  "id": "+15551234567",
  "handle_id": "1",
  "service": "iMessage",
  "associated_message_guid": "",
  "associated_message_type": 0,
  "balloon_bundle_id": "",
  "cache_has_attachments": false,
  "room_name": "",
  "sender": "",
  "imessage": true,
  "item_type": 0,
  "group_action_type": 0,
  "link_title": "",
  "link_subtitle": "",
  "link_type": "",
  "attachments": [
    { "filename": "IMG_9841.JPEG", "mime_type": "image/jpeg" }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `guid` | string | Unique message identifier |
| `date` | int | Apple CFAbsoluteTime since 2001-01-01 |
| `date_read` | int | `0` if unread, else read timestamp |
| `is_from_me` | bool | `true` if sent by device owner |
| `text` | string | Message body |
| `chat_identifier` | string | Phone/email/group chat ID |
| `service` | string | `"iMessage"` or `"SMS"` |
| `cache_has_attachments` | bool | Has file attachments |
| `attachments` | array | `{filename, mime_type}` objects |
| `associated_message_type` | int | `0`=none, types ≥2000 are tapbacks |
| `group_action_type` | int | `0`=none, `1`=added, `2`=removed |
| `sender` | string | Sender ID (group chats only) |

> **Tapback values in `associated_message_type`:** 2000=Heart, 2001=Thumbs Up, 2002=Thumbs Down, 2003=Haha, 2004=!!, 2005=??. Values ≥3000 mean a tapback was removed.

> **Date → Unix:** `floor(date / 1_000_000_000) + 978_307_200`

---

### 2. Get Chats (Conversations)

```
GET /requests?chats=<n>&chats_offset=<n>
```

| Parameter | Req'd | Type | Default | Description |
|-----------|:---:|------|---------|-------------|
| `chats` | Yes | — | — | Presence triggers chat listing |
| `chats_offset` | No | int | `0` | Pagination offset |

**Response:** JSON array of chat objects.

```bash
curl 'http://localhost:8085/requests?chats&chats_offset=0'
```

#### Chat Object

```json
{
  "has_unread": true,
  "chat_identifier": "+15551234567",
  "pinned": false,
  "latest_text": "Meow",
  "display_name": "John Doe",
  "time_marker": "2:30 PM",
  "relative_time": "2m ago",
  "addresses": ["+15551234567"],
  "is_group": false,
  "members": [
    { "display_name": "John Doe", "chat_identifier": "+15551234567" }
  ]
}
```

---

### 3. Get Conversation Details

```
GET /requests?conversation=<chat_id>
```

```bash
curl 'http://localhost:8085/requests?conversation=%2B15551234567'
```

---

### 4. Get Display Name

```
GET /requests?name=<chat_id>
```

**Response:** Plain text display name. Falls back to the input if no contact match.

```bash
curl 'http://localhost:8085/requests?name=%2B15551234567'
# → John Doe
```

---

### 5. Search Messages

```
GET /requests?search=<term>&search_case=<bool>&search_gaps=<bool>&search_group=<time|chat>
```

| Parameter | Req'd | Type | Default | Description |
|-----------|:---:|------|---------|-------------|
| `search` | Yes | string | — | Search term |
| `search_case` | No | bool | `"false"` | Case-sensitive |
| `search_gaps` | No | bool | `"true"` | Spaces become wildcards when `"true"` |
| `search_group` | No | string | `"time"` | `"time"` = sorted by recency; else grouped by chat |

**Response:** JSON with `texts` and `conversations` arrays.

```bash
curl 'http://localhost:8085/requests?search=hello%20world&search_group=chat'
```

---

### 6. Match Contacts

```
GET /requests?match=<value>&match_type=<chat|name>
```

| Parameter | Req'd | Type | Description |
|-----------|:---:|------|-------------|
| `match` | Yes | string | Partial value to match |
| `match_type` | Yes | string | `"chat"` = match identifiers; else = match names |

```bash
curl 'http://localhost:8085/requests?match=john&match_type=name'
```

---

### 7. Get Photos (Camera Roll)

```
GET /requests?photos=<n>&photos_offset=<n>&photos_recent=<bool>
```

| Parameter | Req'd | Type | Default | Description |
|-----------|:---:|------|---------|-------------|
| `photos` | Yes | int | — | Count (`0` = app default) |
| `photos_offset` | No | int | `0` | Pagination offset |
| `photos_recent` | No | bool | `"true"` | `"true"` = newest first |

**Response:** `[{is_favorite: bool, URL: string}]`

```bash
curl 'http://localhost:8085/requests?photos=100'
```

---

### 8. Get Server Config

```
GET /requests?config
```

**Response:**
```json
{
  "socket_port": 8081,
  "socket_subdirectory": "",
  "debug": false,
  "subjects": false
}
```

---

### 9. Send Message

```
POST /send
Content-Type: multipart/form-data
```

| Field | Req'd | Type | Description |
|-------|:---:|------|-------------|
| `chat` | Yes | string | Recipient (e.g. `+15551234567`) |
| `text` | No | string | Message body |
| `subject` | No | string | iMessage subject line |
| `photos` | No | string | Colon-separated paths relative to `/var/mobile/Media/` |
| `attachments` | No | file(s) | One or more file uploads |

**Response:** Status code only — `200`, `400`, `403`, `503`.

At least one of `text`, `subject`, `photos`, or `attachments` is required.

```bash
# Simple text
curl 'http://localhost:8085/send' \
  -F 'chat=+15551234567' \
  -F 'text=Yoo'

# With files
curl 'http://localhost:8085/send' \
  -F 'chat=+15551234567' \
  -F 'text=Check this out' \
  -F 'attachments=@image.png' \
  -F 'attachments=@doc.pdf'

# With camera roll photos
curl 'http://localhost:8085/send' \
  -F 'chat=+15551234567' \
  -F 'text=From camera roll' \
  -F 'photos=DCIM/100APPLE/IMG_0001.JPG:DCIM/100APPLE/IMG_0002.JPG'
```

---

### 10. Send Tapback (Reaction)

```
GET /send?tapback=<0-5>&tap_guid=<guid>&remove_tap=<true>
```

| Parameter | Req'd | Type | Description |
|-----------|:---:|------|-------------|
| `tapback` | Yes | int | `0`=❤️, `1`=👍, `2`=👎, `3`=😂, `4`=‼️, `5`=❓ |
| `tap_guid` | Yes | string | GUID with prefix (`p:0/`, `bp:`) |
| `remove_tap` | No | string | `"true"` to remove reaction |

```bash
curl 'http://localhost:8085/send?tapback=1&tap_guid=p:0/0AD2418E-19E4-47B1-9380-DB8E0A90B30C'
```

---

### 11. Delete Chat

```
GET /send?delete_chat=<chat_id>
```

```bash
curl 'http://localhost:8085/send?delete_chat=%2B11231231234'
```

---

### 12. Delete Single Message

```
GET /send?delete_text=<guid>
```

```bash
curl 'http://localhost:8085/send?delete_text=p:0/4505C31A-A0FB-496F-AAA4-9821FBCF9BE4'
```

---

## Binary Data Endpoints

### Get Attachment File

```
GET /data?path=<relative_path>
```

`path` is relative to `/private/var/mobile/Library/SMS/Attachments/`. Supports `Range` headers.

```bash
curl -o attachment.jpg 'http://localhost:8085/data?path=00/D8/172BC809-BA7A-118D-18BCF0DEF/IMG_9841.JPEG'
```

### Get Profile Picture

```
GET /data?chat_id=<identifier>
```

Returns 404 if no picture exists.

```bash
curl -o avatar.jpg 'http://localhost:8085/data?chat_id=%2B15204458272'
```

### Get Camera Roll Photo

```
GET /data?photo=<relative_path>
```

`photo` is relative to `/var/mobile/Media/`.

```bash
curl -o photo.jpg 'http://localhost:8085/data?photo=DCIM/109APPLE/IMG_8273.JPEG'
```

---

## WebSocket Protocol

Connect for real-time events at:

```
ws://localhost:8081/
```

### Message Format

SMServer uses a **colon-delimited text protocol** (not JSON). Each frame is a single line:

```
command:payload
```

| Direction | Format | Example |
|-----------|--------|---------|
| Server → Client | `command:payload` | `typing:+15551234567` |
| Client → Server | `command:payload` | `idle:+15551234567` |

### Server → Client Events

#### `text` — New incoming/outgoing message

```
text:{"text":{...message...}}
```

The payload is a JSON object with a `text` key containing the full [message object](#message-object).

```
text:{"text":{"guid":"1899E6BF-...","text":"Meow","chat_identifier":"+15551234567","is_from_me":false,"date":806863693330673920,...}}
```

#### `typing` — Remote party started typing

```
typing:+15551234567
```

#### `idle` — Remote party stopped typing

```
idle:+15551234567
```

#### `battery` — Battery level or charging status

```
battery:85.0
battery:charging
```

`battery:<number>` gives the percentage. `battery:charging` means the device is plugged in.

#### `read` — Read receipt

```
read:{"guid":"1899E6BF-8F30-4355-BE3B-58D2132E1618","date":"2:30 PM"}
```

Payload is JSON with `guid` and `date` fields.

### Client → Server Messages

#### `typing` — Send typing indicator

```
typing:+15551234567
```

#### `idle` — Send stopped-typing indicator

```
idle:+15551234567
```

> **Note:** Messages are sent via the REST API (`POST /send`), not WebSocket. The WebSocket is for real-time events and typing indicators only.

---

## Response Status Codes

| Code | Meaning |
|:---:|------|
| `200` | Success |
| `400` | Bad request |
| `403` | Not authenticated |
| `404` | Not found |
| `406` | Unknown query key |
| `503` | Send/internal failure |

---

## Quick Reference: All Endpoints

| Method | Path | Auth | Purpose | Response |
|--------|------|:---:|---------|----------|
| GET | `/requests?password=` | No | Authenticate | `"true"` / `"false"` |
| GET | `/requests?messages=` | Yes | Get messages | JSON array |
| GET | `/requests?chats=` | Yes | List conversations | JSON array |
| GET | `/requests?conversation=` | Yes | Conversation details | JSON object |
| GET | `/requests?name=` | Yes | Display name lookup | Plain text |
| GET | `/requests?search=` | Yes | Search messages | JSON object |
| GET | `/requests?match=` | Yes | Search contacts | JSON array |
| GET | `/requests?photos=` | Yes | List camera roll | JSON array |
| GET | `/requests?config` | Yes | Server config | JSON object |
| POST | `/send` | Yes | Send message | Status code |
| GET | `/send?tapback=` | Yes | Send/remove reaction | Status code |
| GET | `/send?delete_chat=` | Yes | Delete conversation | Status code |
| GET | `/send?delete_text=` | Yes | Delete message | Status code |
| GET | `/data?path=` | Yes | Attachment file | Binary |
| GET | `/data?chat_id=` | Yes | Profile picture | Binary |
| GET | `/data?photo=` | Yes | Camera roll photo | Binary |
| WS | `/` | No | Real-time events | JSON frames |

---

## Date Conversion

Apple CFAbsoluteTime → JavaScript:

```js
const unixMs = Math.floor(date / 1_000_000_000) * 1000 + 978_307_200_000;
const jsDate = new Date(unixMs);
```

---

## Related Docs

- [SMServer source](https://github.com/itsjunetime/smserver)
- [CLI Reference](./CLI.md)
- [Tunneling Guide](./TUNNELING.md)
- [Installation Guide](./INSTALL.md)
