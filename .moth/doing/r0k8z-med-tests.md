create a unit test test suite for api/packages/arch. for mocks use Function overriding.
points of concern are
- some actions can be performed only with the host token
- no actions except the public getSession can be performed without either session or host tokens
- no actions could be performed against a non-existent session

each Function in the architecture must have at least two unit tests - one for expected success scenario, one for failure
