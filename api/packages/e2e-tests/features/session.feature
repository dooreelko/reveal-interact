Feature: Session Management
  As a host
  I want to create a session
  So that I can interact with my audience

  Background:
    Given the API is running at "http://localhost:3000"

  Scenario: Create a new session
    Given I have a valid session token for "Test Presentation"
    When I create a new session with the token
    Then the response should contain "token", "hostUid", and "sessionUid"
    And the "token" should match the one I used

  Scenario: Login to a session
    Given I have a valid session token for "Test Presentation"
    And I have created a session with that token
    When I login to the session with the token
    Then the response should contain a "uid"

  Scenario: Send a reaction
    Given I have a valid session token for "Test Presentation"
    And I have created a session with that token
    And I have logged in to the session
    When I send a "clap" reaction for page "1"
    Then the response should indicate success

  Scenario: Set and get session state
    Given I have a valid session token for "Test Presentation"
    And I have created a session with that token
    When I set the state to "active" for page "2"
    Then the response should indicate success
    When I get the session state
    Then the state should be "active" for page "2"
