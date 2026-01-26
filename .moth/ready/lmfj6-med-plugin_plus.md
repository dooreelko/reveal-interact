when session is registered, it's public token, api and web-ui urls are stored in the session store

the qr url should only pass session uid to the web ui, which will use it to get the session
this means that api should expose getSession and it should not require a token

all other exposed api should require host token (create session, set state) or user token (login, react, getState)
this also means that only main api should be exposed to the public, various store sub-api should be only accessible by main api

add a notification to the plugin for connection status changes. ping api and attempt to periodically reconnect if connection is lost.
show connection status in the example web ui

the web ui will be mostly run on mobile devices, make sure space is used sparringly
