# session-resume Specification

## Purpose

Defines how the Session screen decides which session to show and loads that session's stored conversation when the learner opens or resumes it.

## Requirements

### Requirement: Opening a session loads its stored transcript

When the Session screen is opened with a session id, it SHALL load that session's stored transcript and scenario and display them, whatever entry path led there. A session whose transcript is empty SHALL display as empty. A session with stored turns SHALL display those turns.

#### Scenario: Resume from the Practice tab

- **WHEN** the learner presses Continue on an unfinished session on the Practice tab
- **THEN** the Session screen shows that session's stored turns and its scenario

#### Scenario: Cold mount with a session id

- **WHEN** the Session screen mounts fresh with a session id, as after a page refresh
- **THEN** it shows the same stored turns it would show on any other entry path

#### Scenario: Session with no turns yet

- **WHEN** the learner opens a session that has no stored turns
- **THEN** the Session screen shows an empty conversation for that scenario

### Requirement: Re-opening the session already on screen reloads it

When the Session screen is asked to open the session that is already the current one, it SHALL reload that session's stored transcript rather than clearing the conversation and leaving it empty.

#### Scenario: Continue pressed for the session already shown

- **WHEN** the session shown on the Session screen is the same unfinished session the learner presses Continue on
- **THEN** the screen keeps showing that session's stored turns instead of going blank

### Requirement: A resumed session does not restart the conversation

The opening turn SHALL be sent only for a session that has no stored turns. A session opened with stored turns SHALL display its history without sending a new opening turn.

#### Scenario: Opening turn skipped on resume

- **WHEN** the Session screen opens a session that already has stored turns
- **THEN** it does not send an opening turn and does not duplicate the start of the conversation
