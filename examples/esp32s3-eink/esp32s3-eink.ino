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
uint32_t bootNonce = 0;
String lastRenderedCardId;
String lastPlaylistRevision;

void setup() {
  Serial.begin(115200);
  delay(500);
  bootNonce = esp_random();
  configureButton(nextButton);
  configureButton(previousButton);
  connectWifi();
  refreshEinkPayload(true);
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

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println();
  Serial.print("WiFi connected: ");
  Serial.println(WiFi.localIP());
}

void refreshEinkPayload(bool forceRender) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }
  lastPollAt = millis();

  const String url = String(API_BASE_URL)
    + "/api/v1/eink?targetId=" + urlEncode(DEVICE_TARGET_ID)
    + "&limit=1&cursor=0";

  HTTPClient http;
  http.begin(url);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  const int code = http.GET();
  if (code != 200) {
    renderError(String("GET /api/v1/eink -> HTTP ") + code);
    http.end();
    return;
  }

  const String body = http.getString();
  http.end();

  StaticJsonDocument<24576> doc;
  const DeserializationError error = deserializeJson(doc, body);
  if (error) {
    renderError(String("JSON parse failed: ") + error.c_str());
    return;
  }

  JsonObject summary = doc["summary"];
  JsonArray focus = doc["focus"].as<JsonArray>();
  JsonObject playlist = doc["playlist"];
  const String revision = playlist["revision"] | "";
  if (focus.size() == 0) {
    if (forceRender || lastRenderedCardId.length() > 0 || revision != lastPlaylistRevision) {
      renderEmpty(
        summary["open"] | 0,
        summary["candidate"] | 0,
        summary["blockedArticles"] | 0
      );
      lastRenderedCardId = "";
      lastPlaylistRevision = revision;
    }
    return;
  }

  JsonObject card = focus[0];
  const String cardId = card["id"] | "";
  if (!forceRender && cardId == lastRenderedCardId && revision == lastPlaylistRevision) {
    return; // Polling never refreshes unchanged e-ink pixels.
  }

  const char* cardBody = card["body"] | "";
  if (cardBody[0] == '\0') {
    cardBody = card["question"] | "";
  }
  const String summaryText = String("open ") + (int)(summary["open"] | 0)
    + " / candidate " + (int)(summary["candidate"] | 0)
    + " / cards " + (int)(playlist["total"] | focus.size());

  renderCard(
    card["title"] | "Untitled",
    cardBody,
    card["article"] | "",
    card["lane"] | "",
    card["sourceType"] | "question",
    summaryText
  );
  lastRenderedCardId = cardId;
  lastPlaylistRevision = revision;
}

void sendButtonEvent(const char* buttonName) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
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
  const String response = http.getString();
  http.end();

  if (code != 200) {
    renderError(String("POST button ") + buttonName + " -> HTTP " + code + " " + response);
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
  const String& lane,
  const String& sourceType,
  const String& summaryText
) {
  // Replace this Serial output with GxEPD2/Waveshare/LilyGo drawing calls.
  Serial.println("----- ToWrite E-ink Card -----");
  Serial.println(summaryText);
  Serial.println(sourceType + " | " + lane + " | " + article);
  Serial.println(title);
  Serial.println(body);
  Serial.println("------------------------------");
}

void renderEmpty(int openCount, int candidateCount, int blockedArticles) {
  Serial.println("----- ToWrite E-ink Card -----");
  Serial.println("No paging cards.");
  Serial.print("open: ");
  Serial.println(openCount);
  Serial.print("candidate: ");
  Serial.println(candidateCount);
  Serial.print("blocked articles: ");
  Serial.println(blockedArticles);
  Serial.println("------------------------------");
}

void renderError(const String& message) {
  Serial.println("----- ToWrite API Error -----");
  Serial.println(message);
  Serial.println("-----------------------------");
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
