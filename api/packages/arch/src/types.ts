/**
 * Session information encrypted in the token by host's private key
 */
export interface SessionToken {
  name: string;
  date: string;
}

/**
 * Session state stored in the backend
 */
export interface Session {
  sid: string;
  page: string;
  state: string;
}

/**
 * Host entry linking session to host user
 */
export interface Host {
  sid: string;
  uid: string;
}

/**
 * User entry linking session to user
 */
export interface User {
  sid: string;
  uid: string;
}

/**
 * Reaction from a user during a session
 */
export interface Reaction {
  time: number;
  sid: string;
  uid: string;
  page: string;
  reaction: string;
}

/**
 * Response from session creation
 */
export interface NewSessionResponse {
  sid: string;
  uid: string;
}

/**
 * Response from user login
 */
export interface LoginResponse {
  uid: string;
}

/**
 * WebSocket message broadcast to users
 */
export interface StateChangeMessage {
  type: "state_change";
  sid: string;
  page: string;
  state: string;
}
