#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>

// Network and ToWrite External API.
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_BASE_URL = "http://192.168.1.20:48321";

// Create one target-scoped token per physical screen. The token is sent only
// in the Authorization header and is never printed by this sketch.
const char* DEVICE_TARGET_ID = "local-web";
const char* DEVICE_TOKEN = "YOUR_TARGET_SCOPED_TOKEN";

// Connect each button between its GPIO and GND. INPUT_PULLUP is enabled.
// Choose free pins for your exact ESP32-S3/display carrier. Use -1 only while
// bringing up a board; all three buttons are part of the V1 interaction.
const int MAIN_BUTTON_PIN = -1;
const int LEFT_BUTTON_PIN = -1;
const int RIGHT_BUTTON_PIN = -1;

const unsigned long POLL_INTERVAL_MS = 5000;
const unsigned long BUTTON_DEBOUNCE_MS = 45;
const unsigned long BUTTON_DOUBLE_CLICK_MS = 320;
const unsigned long BUTTON_LONG_PRESS_MS = 700;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
// A narrow status footer may use a partial refresh. Do not full-refresh the
// complete panel every five seconds just to update connectivity text.
const unsigned long STATUS_FOOTER_REFRESH_MS = 60000;

struct DisplayTuple {
  bool valid;
  String deviceId;
  String selectionId;
  uint64_t stateVersion;
  String contentId;
  String revisionId;
  String cardId;
  String playlistRevision;
};

struct ButtonState {
  int pin;
  const char* name;
  bool rawPressed;
  bool stablePressed;
  bool longSent;
  bool clickPending;
  bool secondClick;
  unsigned long rawChangedAt;
  unsigned long pressedAt;
  unsigned long clickReleasedAt;
};

struct ConnectionState {
  bool wifiOk;
  bool apiOk;
  bool hasSuccessfulSync;
  int lastHttpStatus;
  unsigned long lastSuccessfulSyncAt;
  String lastError;
};

void configureButton(ButtonState& button);
void pollButton(ButtonState& button);
bool connectWifi();
void refreshEinkPayload(bool forceRender);
bool readDesiredTuple(JsonObject playlist, DisplayTuple& output);
bool acknowledgeDisplayed(const DisplayTuple& desired);
String displayCategoryFor(JsonObject card);
void sendGestureEvent(const char* buttonName, const char* gestureName);
bool tuplesEqual(const DisplayTuple& left, const DisplayTuple& right);
void copyTuple(DisplayTuple& output, const DisplayTuple& input);
void clearTuple(DisplayTuple& tuple);
String makeEventId(const char* prefix);
String commandErrorForHttp(int code);
String shortCommandStatus(const String& value);
bool renderCard(
  const String& title,
  const String& body,
  const String& article,
  const String& displayCategory,
  const String& pageText,
  const String& connectionText
);
bool renderEmpty(
  int openCount,
  int candidateCount,
  int blockedArticles,
  const String& connectionText
);
void renderCommandStatus(const String& message, bool isError);
void renderError(const String& message, const String& connectionText);
void renderConnectionStatus(const String& connectionText, bool isError);
void markConnectionSuccess(int httpStatus);
void markConnectionError(const String& message, int httpStatus);
String connectionStatusText();
String connectionStatusFingerprint();
void rememberRenderedStatus();
void renderConnectionStatusIfNeeded(bool force);
String urlEncode(const char* value);

ButtonState mainButton = {
  MAIN_BUTTON_PIN, "primary", false, false, false, false, false, 0, 0, 0
};
ButtonState leftButton = {
  LEFT_BUTTON_PIN, "left", false, false, false, false, false, 0, 0, 0
};
ButtonState rightButton = {
  RIGHT_BUTTON_PIN, "right", false, false, false, false, false, 0, 0, 0
};

ConnectionState connectionState = {false, false, false, 0, 0, ""};
DisplayTuple displayedTuple = {false, "", "", 0, "", "", "", ""};
DisplayTuple pendingRenderedTuple = {false, "", "", 0, "", "", "", ""};

unsigned long lastPollAt = 0;
unsigned long lastStatusRenderAt = 0;
uint32_t bootNonce = 0;
uint32_t eventCounter = 0;
String lastRenderedCardId;
String lastPlaylistRevision;
String lastStatusFingerprint;

void setup() {
  Serial.begin(115200);
  delay(500);
  bootNonce = esp_random();
  configureButton(mainButton);
  configureButton(leftButton);
  configureButton(rightButton);
  if (connectWifi()) {
    refreshEinkPayload(true);
  } else {
    lastPollAt = millis();
  }
}

void loop() {
  pollButton(mainButton);
  pollButton(leftButton);
  pollButton(rightButton);

  if (millis() - lastPollAt >= POLL_INTERVAL_MS) {
    refreshEinkPayload(false);
  }
  delay(10);
}

void configureButton(ButtonState& button) {
  if (button.pin < 0) return;
  pinMode(button.pin, INPUT_PULLUP);
  const bool pressed = digitalRead(button.pin) == LOW;
  button.rawPressed = pressed;
  button.stablePressed = pressed;
  button.rawChangedAt = millis();
  button.pressedAt = pressed ? millis() : 0;
}

void pollButton(ButtonState& button) {
  if (button.pin < 0) return;

  const unsigned long now = millis();
  const bool reading = digitalRead(button.pin) == LOW;
  if (reading != button.rawPressed) {
    button.rawPressed = reading;
    button.rawChangedAt = now;
  }

  if (reading != button.stablePressed
      && now - button.rawChangedAt >= BUTTON_DEBOUNCE_MS) {
    button.stablePressed = reading;
    if (reading) {
      // If the loop was blocked long enough for the previous click window to
      // expire, emit that single before beginning a new press.
      button.secondClick = false;
      if (button.clickPending) {
        if (now - button.clickReleasedAt <= BUTTON_DOUBLE_CLICK_MS) {
          button.secondClick = true;
        } else {
          button.clickPending = false;
          sendGestureEvent(button.name, "single");
        }
      }
      button.pressedAt = now;
      button.longSent = false;
    } else if (!button.longSent) {
      if (button.secondClick) {
        button.clickPending = false;
        button.secondClick = false;
        sendGestureEvent(button.name, "double");
      } else {
        button.clickPending = true;
        button.clickReleasedAt = now;
      }
    }
  }

  if (button.stablePressed && !button.longSent
      && now - button.pressedAt >= BUTTON_LONG_PRESS_MS) {
    button.longSent = true;
    button.clickPending = false;
    button.secondClick = false;
    sendGestureEvent(button.name, "long");
  }

  // A single click is deliberately delayed until the double-click window has
  // elapsed. Never emit it while a possible second press is being held.
  if (!button.rawPressed && !button.stablePressed && button.clickPending
      && now - button.clickReleasedAt > BUTTON_DOUBLE_CLICK_MS) {
    button.clickPending = false;
    sendGestureEvent(button.name, "single");
  }
}

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    connectionState.wifiOk = true;
    return true;
  }
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");
  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED
      && millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS) {
    Serial.print(".");
    delay(500);
  }
  if (WiFi.status() != WL_CONNECTED) {
    connectionState.wifiOk = false;
    markConnectionError("WiFi connection timed out", 0);
    WiFi.disconnect();
    return false;
  }
  Serial.println();
  Serial.print("WiFi connected: ");
  Serial.println(WiFi.localIP());
  connectionState.wifiOk = true;
  return true;
}

void refreshEinkPayload(bool forceRender) {
  lastPollAt = millis();
  if (WiFi.status() != WL_CONNECTED && !connectWifi()) {
    // Start the retry interval after the bounded connection attempt, otherwise
    // a 20-second timeout would immediately enter another blocking attempt.
    lastPollAt = millis();
    return;
  }
  connectionState.wifiOk = true;

  const String url = String(API_BASE_URL)
    + "/api/v1/eink?targetId=" + urlEncode(DEVICE_TARGET_ID)
    + "&limit=1&cursor=0";

  HTTPClient http;
  http.begin(url);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  const int code = http.GET();
  if (code != 200) {
    http.end();
    markConnectionError(String("GET /api/v1/eink returned HTTP ") + code, code);
    return;
  }

  const String body = http.getString();
  http.end();

  // Keep the relatively large response buffer on the heap. A 24 KiB local
  // StaticJsonDocument can overflow the Arduino loop task stack on ESP32-S3.
  DynamicJsonDocument doc(24576);
  const DeserializationError error = deserializeJson(doc, body);
  if (error) {
    markConnectionError(String("JSON parse failed: ") + error.c_str(), code);
    return;
  }
  markConnectionSuccess(code);

  JsonObject summary = doc["summary"];
  JsonArray focus = doc["focus"].as<JsonArray>();
  JsonObject playlist = doc["playlist"];
  const String revision = playlist["revision"] | "";
  const String statusText = connectionStatusText();

  DisplayTuple desired = {false, "", "", 0, "", "", "", ""};
  const bool hasDesired = readDesiredTuple(playlist, desired);

  if (focus.size() == 0) {
    if (forceRender || lastRenderedCardId.length() > 0 || revision != lastPlaylistRevision) {
      if (renderEmpty(
        summary["open"] | 0,
        summary["candidate"] | 0,
        summary["blockedArticles"] | 0,
        statusText
      )) {
        // There is no exact content tuple to authorize a gesture against.
        clearTuple(displayedTuple);
        clearTuple(pendingRenderedTuple);
        lastRenderedCardId = "";
        lastPlaylistRevision = revision;
        rememberRenderedStatus();
      }
    } else {
      renderConnectionStatusIfNeeded(false);
    }
    return;
  }

  if (!hasDesired) {
    markConnectionError(
      "Response has no playlist.desired tuple; update ToWrite before enabling buttons",
      code
    );
    return;
  }

  JsonObject card = focus[0];
  const String cardId = card["id"] | "";
  if (cardId != desired.cardId) {
    markConnectionError("focus[0] does not match playlist.desired.cardId", 409);
    return;
  }

  // If pixels were already refreshed but the ACK failed, retry only the ACK.
  // The new tuple is not promoted to displayedTuple until that succeeds.
  if (tuplesEqual(pendingRenderedTuple, desired)) {
    if (acknowledgeDisplayed(desired)) {
      copyTuple(displayedTuple, desired);
      clearTuple(pendingRenderedTuple);
    }
    return;
  }

  const bool alreadyAcknowledged = tuplesEqual(displayedTuple, desired);
  if (!forceRender && alreadyAcknowledged
      && cardId == lastRenderedCardId
      && revision == lastPlaylistRevision) {
    renderConnectionStatusIfNeeded(false);
    return; // Polling never refreshes unchanged e-ink pixels.
  }

  const char* cardBody = card["body"] | "";
  if (cardBody[0] == '\0') {
    cardBody = card["question"] | "";
  }
  const int playlistTotal = playlist["total"] | focus.size();
  const int queueTotal = playlist["queueTotal"] | playlistTotal;
  const int currentIndex = playlist["currentIndex"] | 0;
  const int currentPosition = playlist["currentPosition"] | (currentIndex + 1);
  const bool currentInQueue = playlist.containsKey("currentInQueue")
    ? playlist["currentInQueue"].as<bool>()
    : currentIndex >= 0;
  const String pageText = currentInQueue
    ? String("page ") + String(currentPosition) + "/" + String(queueTotal)
    : String("single preview");
  const String displayCategory = displayCategoryFor(card);

  // Replace renderCard() with a real driver call that returns true only after
  // the controller reports a successful refresh. ACK must always happen after
  // that point, never when the payload was merely downloaded.
  const bool rendered = renderCard(
    card["title"] | "Untitled",
    cardBody,
    card["article"] | "",
    displayCategory,
    pageText,
    statusText
  );
  if (!rendered) {
    renderCommandStatus("Display refresh failed", true);
    return;
  }

  lastRenderedCardId = cardId;
  lastPlaylistRevision = revision;
  // The old tuple no longer describes the pixels once this refresh succeeds.
  // Disable gestures until the new exact tuple is acknowledged.
  clearTuple(displayedTuple);
  copyTuple(pendingRenderedTuple, desired);
  rememberRenderedStatus();

  if (acknowledgeDisplayed(desired)) {
    copyTuple(displayedTuple, desired);
    clearTuple(pendingRenderedTuple);
  }
}

bool readDesiredTuple(JsonObject playlist, DisplayTuple& output) {
  JsonObject desired = playlist["desired"].as<JsonObject>();
  if (desired.isNull()) return false;

  output.deviceId = desired["deviceId"] | "";
  output.selectionId = desired["selectionId"] | "";
  output.stateVersion = desired["stateVersion"].as<uint64_t>();
  output.contentId = desired["contentId"] | "";
  output.revisionId = desired["revisionId"] | "";
  output.cardId = desired["cardId"] | "";
  output.playlistRevision = desired["playlistRevision"] | "";
  output.valid = output.deviceId.length() > 0
    && output.selectionId.length() > 0
    && output.stateVersion > 0
    && output.contentId.length() > 0
    && output.revisionId.length() > 0
    && output.cardId.length() > 0
    && output.playlistRevision.length() > 0;
  return output.valid;
}

bool acknowledgeDisplayed(const DisplayTuple& desired) {
  if (!desired.valid) return false;
  if (WiFi.status() != WL_CONNECTED && !connectWifi()) return false;

  StaticJsonDocument<1024> ack;
  ack["eventId"] = makeEventId("ack");
  ack["deviceId"] = desired.deviceId;
  ack["selectionId"] = desired.selectionId;
  ack["stateVersion"] = desired.stateVersion;
  ack["contentId"] = desired.contentId;
  ack["revisionId"] = desired.revisionId;
  ack["cardId"] = desired.cardId;
  ack["playlistRevision"] = desired.playlistRevision;
  String payload;
  serializeJson(ack, payload);

  HTTPClient http;
  http.begin(String(API_BASE_URL) + "/api/v1/device/display-acks");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("Content-Type", "application/json");
  const int code = http.POST(payload);
  http.end();

  if (code != 200) {
    markConnectionError(String("Display ACK returned HTTP ") + code, code);
    return false;
  }
  markConnectionSuccess(code);
  return true;
}

String displayCategoryFor(JsonObject card) {
  const String contentType = card["contentType"] | "";
  if (contentType == "daily_overview") return "Today";
  if (contentType == "daily_plan_item") return "Current task";
  if (contentType == "daily_result") return "Today result";

  const String category = card["displayCategory"] | "";
  if (category == "echo") return "Echo sample";
  if (category == "tothink") return "ToThink";
  if (category == "towrite") return "ToWrite";

  // Compatibility fallback for servers that predate displayCategory. Echo
  // must win over the legacy lane because old Echo payloads used lane=write.
  const String sourceType = card["sourceType"] | "question";
  if (sourceType == "echo") return "Echo sample";
  const String lane = card["lane"] | "";
  return lane == "think" ? "ToThink" : "ToWrite";
}

void sendGestureEvent(const char* buttonName, const char* gestureName) {
  if (!displayedTuple.valid) {
    renderCommandStatus("Waiting for display ACK", true);
    return;
  }
  if (WiFi.status() != WL_CONNECTED && !connectWifi()) {
    renderCommandStatus("Computer offline", true);
    return;
  }

  StaticJsonDocument<1280> event;
  event["schemaVersion"] = 2;
  event["eventId"] = makeEventId("evt");
  event["targetId"] = DEVICE_TARGET_ID;
  event["deviceId"] = displayedTuple.deviceId;
  event["selectionId"] = displayedTuple.selectionId;
  event["stateVersion"] = displayedTuple.stateVersion;
  event["contentId"] = displayedTuple.contentId;
  event["revisionId"] = displayedTuple.revisionId;
  event["cardId"] = displayedTuple.cardId;
  event["playlistRevision"] = displayedTuple.playlistRevision;
  event["button"] = buttonName;
  event["gesture"] = gestureName;
  String payload;
  serializeJson(event, payload);

  HTTPClient http;
  http.begin(String(API_BASE_URL) + "/api/v1/device/events");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("Content-Type", "application/json");
  const int code = http.POST(payload);
  const String body = code > 0 ? http.getString() : "";
  http.end();

  if (code < 200 || code >= 300) {
    const String message = commandErrorForHttp(code);
    markConnectionError(String("Device event returned HTTP ") + code, code);
    renderCommandStatus(message, true);
    if (code == 409) {
      // The selected state moved after this screen was rendered. Disable
      // further gestures until a new payload is rendered and ACKed.
      clearTuple(displayedTuple);
      refreshEinkPayload(true);
    }
    return;
  }

  String displayMessage = "Waiting for computer";
  DynamicJsonDocument response(2048);
  if (!deserializeJson(response, body)) {
    const char* serverMessage = response["displayMessage"] | "";
    if (serverMessage[0] != '\0') {
      displayMessage = serverMessage;
    }
  }
  renderCommandStatus(shortCommandStatus(displayMessage), false);
  markConnectionSuccess(code);

  // A start, completion, or page/task gesture can change the desired tuple.
  // Poll without forcing a redundant refresh; a changed tuple is rendered and
  // ACKed by refreshEinkPayload().
  refreshEinkPayload(false);
}

bool tuplesEqual(const DisplayTuple& left, const DisplayTuple& right) {
  return left.valid && right.valid
    && left.deviceId == right.deviceId
    && left.selectionId == right.selectionId
    && left.stateVersion == right.stateVersion
    && left.contentId == right.contentId
    && left.revisionId == right.revisionId
    && left.cardId == right.cardId
    && left.playlistRevision == right.playlistRevision;
}

void copyTuple(DisplayTuple& output, const DisplayTuple& input) {
  output.valid = input.valid;
  output.deviceId = input.deviceId;
  output.selectionId = input.selectionId;
  output.stateVersion = input.stateVersion;
  output.contentId = input.contentId;
  output.revisionId = input.revisionId;
  output.cardId = input.cardId;
  output.playlistRevision = input.playlistRevision;
}

void clearTuple(DisplayTuple& tuple) {
  tuple.valid = false;
  tuple.deviceId = "";
  tuple.selectionId = "";
  tuple.stateVersion = 0;
  tuple.contentId = "";
  tuple.revisionId = "";
  tuple.cardId = "";
  tuple.playlistRevision = "";
}

String makeEventId(const char* prefix) {
  eventCounter += 1;
  return String(prefix)
    + "-" + String(bootNonce, HEX)
    + "-" + String(millis(), HEX)
    + "-" + String(eventCounter, HEX);
}

String commandErrorForHttp(int code) {
  if (code <= 0 || code == 502 || code == 503 || code == 504) {
    return "Computer offline";
  }
  if (code == 408 || code == 425) return "Waiting for computer";
  if (code == 409) return "Conflict - refreshing";
  if (code == 401 || code == 403) return "Device authorization failed";
  return String("Command failed (HTTP ") + code + ")";
}

String shortCommandStatus(const String& value) {
  String lower = value;
  lower.toLowerCase();
  if (lower.indexOf("record") >= 0 && (
      lower.indexOf("not") >= 0 || lower.indexOf("unavailable") >= 0)) {
    return "Recording unavailable";
  }
  if (lower.indexOf("offline") >= 0) return "Computer offline";
  if (lower.indexOf("conflict") >= 0 || lower.indexOf("changed") >= 0) {
    return "Conflict - refreshing";
  }
  if (lower.indexOf("wait") >= 0) return "Waiting for computer";
  if (lower.indexOf("open") >= 0) return "Opened";
  if (lower.indexOf("complete") >= 0) return "Completed";
  return value.substring(0, 60);
}

bool renderCard(
  const String& title,
  const String& body,
  const String& article,
  const String& displayCategory,
  const String& pageText,
  const String& connectionText
) {
  // Replace this Serial output with GxEPD2/Waveshare/LilyGo drawing calls.
  // Return true only after the physical controller has completed the refresh.
  // Reserve a narrow footer for connectionText and command status.
  Serial.println("----- ToWrite E-ink Card -----");
  Serial.println(pageText);
  Serial.println(displayCategory + " | " + article);
  Serial.println(title);
  Serial.println(body);
  Serial.println(connectionText);
  Serial.println("------------------------------");
  return true;
}

bool renderEmpty(
  int openCount,
  int candidateCount,
  int blockedArticles,
  const String& connectionText
) {
  Serial.println("----- ToWrite E-ink Card -----");
  Serial.println("No paging cards.");
  Serial.print("open: ");
  Serial.println(openCount);
  Serial.print("candidate: ");
  Serial.println(candidateCount);
  Serial.print("blocked articles: ");
  Serial.println(blockedArticles);
  Serial.println(connectionText);
  Serial.println("------------------------------");
  return true;
}

void renderCommandStatus(const String& message, bool isError) {
  // Replace this with a small partial refresh. Keep the current card visible.
  Serial.print(isError ? "[command:error] " : "[command:ok] ");
  Serial.println(message);
}

void renderError(const String& message, const String& connectionText) {
  // This is a display hook, not only a logging callback. In the real panel
  // implementation, draw message plus connectionText in an error/status region.
  // A partial refresh is sufficient; keep the previous card body visible.
  Serial.println("----- ToWrite API Error -----");
  Serial.println(message);
  Serial.println(connectionText);
  Serial.println("-----------------------------");
}

void renderConnectionStatus(const String& connectionText, bool isError) {
  // Replace this with a partial-window refresh of only the footer. It is called
  // immediately on a state transition and at most once per minute while stable,
  // so healthy five-second polling does not full-refresh the entire panel.
  Serial.print(isError ? "[status:error] " : "[status:ok] ");
  Serial.println(connectionText);
}

void markConnectionSuccess(int httpStatus) {
  connectionState.wifiOk = WiFi.status() == WL_CONNECTED;
  connectionState.apiOk = true;
  connectionState.hasSuccessfulSync = true;
  connectionState.lastHttpStatus = httpStatus;
  connectionState.lastSuccessfulSyncAt = millis();
  connectionState.lastError = "";
}

void markConnectionError(const String& message, int httpStatus) {
  connectionState.wifiOk = WiFi.status() == WL_CONNECTED;
  connectionState.apiOk = false;
  connectionState.lastHttpStatus = httpStatus;
  connectionState.lastError = message.substring(0, 80);
  const String fingerprint = connectionStatusFingerprint();
  const bool stateChanged = fingerprint != lastStatusFingerprint;
  const bool intervalElapsed = millis() - lastStatusRenderAt >= STATUS_FOOTER_REFRESH_MS;
  if (stateChanged || intervalElapsed) {
    // Repeated identical failures update only at the status cadence rather than
    // refreshing the error region on every five-second poll.
    renderError(connectionState.lastError, connectionStatusText());
    rememberRenderedStatus();
  }
}

String connectionStatusText() {
  String text = connectionState.wifiOk ? "WiFi OK" : "WiFi OFF";
  text += connectionState.apiOk ? " | API OK" : " | API ERR";
  text += " | target ";
  text += DEVICE_TARGET_ID;
  if (connectionState.hasSuccessfulSync) {
    const unsigned long ageSeconds = (millis() - connectionState.lastSuccessfulSyncAt) / 1000;
    text += " | sync @";
    text += String(connectionState.lastSuccessfulSyncAt / 1000);
    text += "s (";
    text += String(ageSeconds);
    text += "s ago)";
  } else {
    text += " | never synced";
  }
  if (!connectionState.apiOk && connectionState.lastHttpStatus != 0) {
    text += " | HTTP ";
    text += String(connectionState.lastHttpStatus);
  }
  return text;
}

String connectionStatusFingerprint() {
  return String(connectionState.wifiOk ? "wifi:1" : "wifi:0")
    + (connectionState.apiOk ? "|api:1" : "|api:0")
    + "|http:" + String(connectionState.lastHttpStatus)
    + "|error:" + connectionState.lastError;
}

void rememberRenderedStatus() {
  lastStatusFingerprint = connectionStatusFingerprint();
  lastStatusRenderAt = millis();
}

void renderConnectionStatusIfNeeded(bool force) {
  const String fingerprint = connectionStatusFingerprint();
  const bool stateChanged = fingerprint != lastStatusFingerprint;
  const bool intervalElapsed = millis() - lastStatusRenderAt >= STATUS_FOOTER_REFRESH_MS;
  if (!force && !stateChanged && !intervalElapsed) {
    return;
  }
  renderConnectionStatus(connectionStatusText(), !connectionState.apiOk);
  rememberRenderedStatus();
}

String urlEncode(const char* value) {
  const String input(value);
  String output;
  const char* hex = "0123456789ABCDEF";
  for (size_t i = 0; i < input.length(); i++) {
    const uint8_t c = (uint8_t)input.charAt(i);
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
      output += c;
    } else {
      output += '%';
      output += hex[(c >> 4) & 0x0F];
      output += hex[c & 0x0F];
    }
  }
  return output;
}
