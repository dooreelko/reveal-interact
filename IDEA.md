# Reveal-interact api

This is the api that allow the audience of a presentation to provide realtime feedback.
General flow.

- When presentation starts, new session is registered using /api/v1/session/new/<token>
<token> is the session information (name, date) encrypted by host's private key. The api validates the token using the stored public key.
Host gets the session and user IDs, their ID is stored in the backend (host table - sid, uid) marking them as a host
- Host establishes a websocket connection under /ws/v1/session/<token>/host/<uid>/pipe
- Based on the session ID, a QR code leads users to the session interaction page
- On page load an API call is made to /api/v1/login that sets the user's ID for the session (store in the cookie?)
User ID is stored in the user table (sid, uid)
- Using the user id, user establishes a websocket connection using /ws/v1/session/<token>/user/<uid>/pipe route
- During the entire session a user can send a reaction using /api/v1/session/<token>/user/<uid>/react/<page>/<reaction>
This is stored in a reaction table (time, sid, uid, page, time, reaction). same user can send the same reaction several times for any page
- During a session the host will notify state change (new page, open/close voting, etc - free form) using /api/v1/session/<token>/state/<page>/<state>
State is just a text
This information is stored in the session table (sid, page, state)
This triggers a broadcast message to all connected users of the session
- During the session users can query the current state using /api/v1/session/<sid>/state/

## Architecture and design

### API

API is implemented using @arinoto/cdk-arch (start at https://github.com/dooreelko/cdk-arch/blob/main/IDEA.md then https://github.com/dooreelko/cdk-arch/tree/main/packages/example) with local docker compose being default target and Cloudflare being a secondary one and AWS being the backup

For cloudflare use workers and KV
For AWS API Gateway is for api and websocket, lambda for code and dynamo db for table persistence

### Plugin

A reveal.js plugin that will be embedded in the presentation, will show the QR code and send page change notifications

### User client

A custom web application created for each presentation used by the audience to interact

### Optional host client

A presentation remote control web application used by the host to navigate in the presentation and change session's state
