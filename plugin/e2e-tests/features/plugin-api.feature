Feature: Plugin API Integration
  As a presentation host
  I want the plugin to communicate with the API
  So that I can manage interactive sessions

  Background:
    Given the API is running
    And I have a valid host token

  Scenario: Create a new session
    When I create a new session
    Then the session should be created successfully
    And I should receive a sessionUid and hostUid

  Scenario: Set session state
    Given I have created a session
    When I set the state to page "0.0" with state "slide"
    Then the state should be set successfully

  Scenario: Get session state
    Given I have created a session
    And I have set the state to page "1.2" with state "slide"
    When I get the session state
    Then the state should show page "1.2"

  Scenario: Plugin JS is available
    Given the example server is running
    When I request the plugin JavaScript
    Then it should contain "RevealInteract"

  Scenario: Example page loads
    Given the example server is running
    When I request the example page with the token
    Then it should contain "RevealInteract Demo"
