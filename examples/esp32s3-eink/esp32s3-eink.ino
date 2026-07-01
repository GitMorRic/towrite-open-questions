#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "填你的 WiFi";
const char* WIFI_PASSWORD = "填你的 WiFi 密码";

const char* API_HOST = "192.168.1.20";
const int API_PORT = 48321;
const char* API_TOKEN = "填你的 token";

const unsigned long REFRESH_INTERVAL_MS = 5UL * 60UL * 1000UL;

unsigned long lastRefresh = 0;
int currentFocusIndex = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  connectWifi();
  refreshEinkPayload();
}

void loop() {
  if (millis() - lastRefresh > REFRESH_INTERVAL_MS) {
    refreshEinkPayload();
  }
  delay(1000);
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

void refreshEinkPayload() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  String url = String("http://") + API_HOST + ":" + API_PORT +
    "/api/v1/eink?token=" + urlEncode(API_TOKEN) + "&limit=3";

  HTTPClient http;
  http.begin(url);
  int code = http.GET();
  if (code != 200) {
    renderError(String("HTTP ") + code);
    http.end();
    return;
  }

  String body = http.getString();
  http.end();

  StaticJsonDocument<24576> doc;
  DeserializationError error = deserializeJson(doc, body);
  if (error) {
    renderError(String("JSON parse failed: ") + error.c_str());
    return;
  }

  JsonObject summary = doc["summary"];
  JsonArray focus = doc["focus"].as<JsonArray>();
  if (focus.size() == 0) {
    renderEmpty(
      summary["open"] | 0,
      summary["candidate"] | 0,
      summary["blockedArticles"] | 0
    );
    lastRefresh = millis();
    return;
  }

  currentFocusIndex = currentFocusIndex % focus.size();
  JsonObject card = focus[currentFocusIndex];
  const char* cardBody = card["body"] | "";
  if (cardBody[0] == '\0') {
    cardBody = card["question"] | "";
  }
  String summaryText = String("open ") + (int)(summary["open"] | 0) +
    " / candidate " + (int)(summary["candidate"] | 0) +
    " / blocked " + (int)(summary["blockedArticles"] | 0);

  renderCard(
    card["title"] | "Untitled",
    cardBody,
    card["article"] | "",
    card["lane"] | "",
    summaryText
  );

  currentFocusIndex = (currentFocusIndex + 1) % focus.size();
  lastRefresh = millis();
}

void renderCard(const String& title, const String& question, const String& article, const String& lane, const String& summaryText) {
  // 在这里替换为你的墨水屏绘制代码。
  Serial.println("----- ToWrite Eink Card -----");
  Serial.println(summaryText);
  Serial.println(lane + " | " + article);
  Serial.println(title);
  Serial.println(question);
  Serial.println("-----------------------------");
}

void renderEmpty(int openCount, int candidateCount, int blockedArticles) {
  Serial.println("----- ToWrite Eink Card -----");
  Serial.println("No focus cards.");
  Serial.print("open: ");
  Serial.println(openCount);
  Serial.print("candidate: ");
  Serial.println(candidateCount);
  Serial.print("blocked articles: ");
  Serial.println(blockedArticles);
  Serial.println("-----------------------------");
}

void renderError(const String& message) {
  Serial.println("----- ToWrite API Error -----");
  Serial.println(message);
  Serial.println("-----------------------------");
}

String urlEncode(const char* value) {
  String input(value);
  String output;
  const char* hex = "0123456789ABCDEF";
  for (size_t i = 0; i < input.length(); i++) {
    uint8_t c = (uint8_t)input.charAt(i);
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
