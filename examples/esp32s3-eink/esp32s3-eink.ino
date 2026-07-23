#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>

// Network and ToWrite External API.
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_BASE_URL = "http://192.168.1.20:48321";

// Create a local-web Push target in ToWrite, then copy that target's id/token.
// The target-scoped token cannot turn a different screen's pages.
const char* DEVICE_TARGET_ID = "local-web";
const char* DEVICE_TOKEN = "YOUR_TARGET_SCOPED_TOKEN";

// Connect each button between its GPIO and GND. INPUT_PULLUP is enabled.
// Set a pin to -1 when that button is not installed.
const int NEXT_BUTTON_PIN = -1;
const int PREVIOUS_BUTTON_PIN = -1;

const unsigned long POLL_INTERVAL_MS = 5000;
const unsigned long BUTTON_DEBOUNCE_MS = 45;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
// A narrow status footer may use a partial refresh. Do not full-refresh the
// complete panel every five seconds just to update connectivity text.
const unsigned long STATUS_FOOTER_REFRESH_MS = 60000;

struct ButtonState {
  int pin;
  const char* eventName;
  bool lastReading;
  bool stablePressed;
  unsigned long changedAt;
};

ButtonState nextButton = {NEXT_BUTTON_PIN, "right", false, false, 0};
ButtonState previousButton = {PREVIOUS_BUTTON_PIN, "left", false, false, 0};

unsigned long lastPollAt = 0;
unsigned long lastStatusRenderAt = 0;
uint32_t bootNonce = 0;
String lastRenderedCardId;
String lastPlaylistRevision;
String lastStatusFingerprint;

struct ConnectionState {
  bool wifiOk;
  bool apiOk;
  bool hasSuccessfulSync;
  int lastHttpStatus;
  unsigned long lastSuccessfulSyncAt;
  String lastError;
};

ConnectionState connectionState = {false, false, false, 0, 0, ""};

void setup() {
  Serial.begin(115200);
  delay(500);
  bootNonce = esp_random();
  configureButton(nextButton);
  configureButton(previousButton);
  if (connectWifi()) {
    refreshEinkPayload(true);
  } else {
    lastPollAt = millis();
  }
}

void loop() {
  pollButton(nextButton);
  pollButton(previousButton);

  if (millis() - lastPollAt >= POLL_INTERVAL_MS) {
    refreshEinkPayload(false);
  }
  delay(20);
}

void configureButton(ButtonState& button) {
  if (button.pin < 0) return;
  pinMode(button.pin, INPUT_PULLUP);
  const bool pressed = digitalRead(button.pin) == LOW;
  button.lastReading = pressed;
  button.stablePressed = pressed;
  button.changedAt = millis();
}

void pollButton(ButtonState& button) {
  if (button.pin < 0) return;
  const bool reading = digitalRead(button.pin) == LOW;
  const unsigned long now = millis();

  if (reading != button.lastReading) {
    button.lastReading = reading;
    button.changedAt = now;
  }
  if (now - button.changedAt < BUTTON_DEBOUNCE_MS || reading == button.stablePressed) {
    return;
  }

  button.stablePressed = reading;
  if (reading) {
    sendButtonEvent(button.eventName);
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
  if (focus.size() == 0) {
    if (forceRender || lastRenderedCardId.length() > 0 || revision != lastPlaylistRevision) {
      renderEmpty(
        summary["open"] | 0,
        summary["candidate"] | 0,
        summary["blockedArticles"] | 0,
        statusText
      );
      lastRenderedCardId = "";
      lastPlaylistRevision = revision;
      rememberRenderedStatus();
    } else {
      renderConnectionStatusIfNeeded(false);
    }
    return;
  }

  JsonObject card = focus[0];
  const String cardId = card["id"] | "";
  if (!forceRender && cardId == lastRenderedCardId && revision == lastPlaylistRevision) {
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

  renderCard(
    card["title"] | "Untitled",
    cardBody,
    card["article"] | "",
    displayCategory,
    pageText,
    statusText
  );
  lastRenderedCardId = cardId;
  lastPlaylistRevision = revision;
  rememberRenderedStatus();
}

String displayCategoryFor(JsonObject card) {
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

void sendButtonEvent(const char* buttonName) {
  if (WiFi.status() != WL_CONNECTED && !connectWifi()) {
    return;
  }

  StaticJsonDocument<512> event;
  event["schemaVersion"] = 1;
  event["eventId"] = makeEventId();
  event["targetId"] = DEVICE_TARGET_ID;
  event["deviceId"] = chipId();
  event["button"] = buttonName;
  String payload;
  serializeJson(event, payload);

  HTTPClient http;
  http.begin(String(API_BASE_URL) + "/api/v1/device/events");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("Content-Type", "application/json");
  const int code = http.POST(payload);
  http.end();

  if (code != 200) {
    // Do not render or log the response body: it is untrusted and is not needed
    // to diagnose target/token mismatch. The long-lived token is never shown.
    markConnectionError(String("POST button ") + buttonName + " returned HTTP " + code, code);
    return;
  }

  // ToWrite has already committed the shared cursor before returning 200.
  // Re-read cursor 0 so the newly selected card appears immediately.
  refreshEinkPayload(true);
}

String chipId() {
  const uint64_t value = ESP.getEfuseMac();
  return String((uint32_t)(value >> 32), HEX) + String((uint32_t)value, HEX);
}

String makeEventId() {
  return String("esp32-") + chipId() + "-" + String(bootNonce, HEX) + "-" + String(millis(), HEX);
}

void renderCard(
  const String& title,
  const String& body,
  const String& article,
  const String& displayCategory,
  const String& pageText,
  const String& connectionText
) {
  // Replace this Serial output with GxEPD2/Waveshare/LilyGo drawing calls.
  // Reserve a narrow footer for connectionText so the physical screen shows
  // Wi-Fi/API state, target ID, and last successful sync without exposing keys.
  Serial.println("----- ToWrite E-ink Card -----");
  Serial.println(pageText);
  Serial.println(displayCategory + " | " + article);
  Serial.println(title);
  Serial.println(body);
  Serial.println(connectionText);
  Serial.println("------------------------------");
}

void renderEmpty(
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
