create an npm library under ./web/revint-lib that can be used in a js single page application that will be used by session participants. 
the SPA will receive session token in the url and pass it to the library, which in turn:

- call the login function of the api
- establish a websoket connection to it
- offer a callback mechanism for session state change events
- expose the reaction and state api

the state object will be a json with page unique name, optional title and optional subtitle

along the library, under ./web/example create a react web app that will use the library and 
- listen to the state changes from the presentation and for each page show title from state
- on each page will have a buttons for thumbs up, heart and mindblown reactions
- on page one will have three buttons for custom poll with options "choice 1", "choice 2" and "something else"
- on page two show the frequency distribution diagram for each of the choices from page one. use observable js for the visuals
- on page three show static text


