# ai-provider Specification

## Purpose

Talks to AI companies directly from the app: chat goes to OpenRouter.ai's chat-completions API with GPT-6 Luna, speech transcription goes to OpenRouter.ai's Speech-to-Text API with Qwen3 ASR, and both ask permission before anything leaves the phone. Image generation and editing stay on the Borel cloud and are out of this capability's boundary.

## Requirements

### Requirement: Chat answered by OpenRouter
The system SHALL answer `chat` calls with a direct request to OpenRouter.ai's chat-completions API using model `openai/gpt-6-luna`, authenticating with a key configured in the app build. Multi-part messages (text plus photo parts) SHALL be sent as given, with a device photo turned into a form the API can read. The resolved result SHALL carry the assistant's reply as `text`, plus the HTTP `status`, a `truncated` flag, and the raw response for callers that read it.

#### Scenario: Text chat succeeds
- **WHEN** a caller sends text-only messages and OpenRouter answers normally
- **THEN** the result carries `text` equal to the assistant reply, `error` null, and status 200

#### Scenario: Photo chat succeeds
- **WHEN** a caller sends messages that contain an image part whose source is a device file
- **THEN** the photo is read and encoded before the request, and the reply comes back as `text` the same way

#### Scenario: Chat timeout
- **WHEN** OpenRouter does not answer within the chat timeout
- **THEN** the result carries the plain-sentence "took too long" error with no text

### Requirement: JSON replies are parsed and retried once
The system SHALL parse an answering message as JSON when the caller asks for JSON: the reply may carry code fences or surrounding words, and the first whole object or list among them SHALL be returned as `data`. When the reply cannot be read, the request SHALL be made once more with the JSON-only instruction still in place, and if the second reply is also unreadable the result SHALL report the "unreadable" error sentence.

#### Scenario: JSON with surrounding words
- **WHEN** the model replies with words around one JSON object
- **THEN** the result carries `data` equal to that object

#### Scenario: Unreadable JSON retried once
- **WHEN** the first reply is not readable as JSON and the second is also not
- **THEN** the result carries the "unreadable" error sentence and no data

#### Scenario: Truncated JSON reply
- **WHEN** a reply hits the maximum token limit and is cut off
- **THEN** the result reports the "too long" error sentence with no data

### Requirement: AI unavailability maps to neutral sentences
The system SHALL answer an OpenRouter error with exactly one plain sentence a learner can read: an invalid key (401) and an upstream failure (502) with the "couldn't answer right now" sentence, insufficient credits (402) with the "isn't available right now" sentence, the key's spend limit reached (403) with the "reached today's limit" sentence, rate limiting (429) with the "reached today's limit" sentence, a network failure with the "check your connection" sentence, and a timeout with the "took too long" sentence. Any message text from the API SHALL only be shown when it is one plain, non-technical sentence.

#### Scenario: Rate limited
- **WHEN** OpenRouter answers 429
- **THEN** the result carries the "reached today's limit" sentence

#### Scenario: Offline
- **WHEN** the request fails without a response
- **THEN** the result carries the "check your connection" sentence

### Requirement: Consent asked before anything goes to OpenRouter
The system SHALL ask before a chat or transcription is sent, naming OpenRouter.ai and the model's maker in one plain disclosure: text chat says the app sends what the user types to OpenRouter.ai, which runs GPT-6 by OpenAI; a message with photos says it also sends the photos; audio says it sends the recording to OpenRouter.ai, which runs Qwen3 ASR by Alibaba. Each disclosure SHALL have its own consent key under the OpenRouter namespace, so a permission recorded under a previous company's keys SHALL NOT satisfy the new one.

#### Scenario: First text chat asks
- **WHEN** a user sends their first chat message and no OpenRouter chat permission is recorded
- **THEN** an alert names OpenRouter.ai and GPT-6 by OpenAI, and nothing is sent unless they tap Allow

#### Scenario: Allowed once is remembered per disclosure
- **WHEN** the user allows text chat and later chats again with text
- **THEN** no alert appears before the request

#### Scenario: Audio is asked separately
- **WHEN** the user allowed text chat and then records speech for transcription
- **THEN** a separate alert names OpenRouter.ai and Qwen3 ASR by Alibaba before the recording is sent

### Requirement: Consent declined blocks the request
The system SHALL resolve a chat or transcription to an error result with no request made when the user answers Don't Allow, and SHALL leave the decline unremembered so the next use asks again.

#### Scenario: Declined
- **WHEN** the user answers Don't Allow
- **THEN** the call resolves with the permission sentence and no data leaves the phone

### Requirement: Recordings transcribed verbatim by the STT API
The system SHALL transcribe a recording with a direct request to OpenRouter.ai's Speech-to-Text API using model `qwen/qwen3-asr-0.6b`, sending the audio bytes with their format. The returned `text` SHALL be what was said in the recording, in the language it was said in, without translation or correction.

#### Scenario: Speech transcribed
- **WHEN** a recording contains speech and the STT API answers
- **THEN** the result carries the words that were said as `text` with no error

#### Scenario: Silence
- **WHEN** the STT API answers with no words for a recording with no speech
- **THEN** the result reports the "no words were heard" sentence

### Requirement: Recording size limits enforced before sending
The system SHALL refuse a recording larger than the existing size cap before any network request, with the "too long to send" sentence, and SHALL refuse an unreadable recording with the "couldn't be read" sentence.

#### Scenario: Recording too long
- **WHEN** a recording exceeds the size cap
- **THEN** the result carries the "too long" sentence with no request made

#### Scenario: Unreadable recording
- **WHEN** the recording cannot be read from the device
- **THEN** the result carries the "record it again" sentence

### Requirement: AI errors read as one plain sentence
The system SHALL keep every chat and transcription failure to one plain, non-technical sentence with a leading capital and terminal punctuation, holding any technical detail in a separate field for whoever reads the code.

#### Scenario: Technical detail never shown
- **WHEN** an OpenRouter error carries a technical message
- **THEN** the user sees the mapped neutral sentence and the technical text stays in the result's detail field
