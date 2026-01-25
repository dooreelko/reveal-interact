create a revealjs plugin under ./plugin
it should use typescript
it should be initialized with 
- a separate host token which has the same fields as the session token, plus {host:true} (create a script for that)
- web ui url

it should have a function to show QR code of the web ui url
it should hook to page change events and send them to the api using the host token for auth

