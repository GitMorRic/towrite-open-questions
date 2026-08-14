#pragma once

#include <Arduino.h>

// Hardware boundary for the first real prototype. This template deliberately
// returns false: the firmware must never ACK pixels that were only printed to
// Serial. Replace the method bodies after identifying the panel controller,
// carrier board, pins, and driver library.
class ToWritePanelDriver {
public:
  bool begin() {
    return false;
  }

  bool renderCard(
    const String& title,
    const String& body,
    const String& article,
    const String& category,
    const String& page,
    const String& footer
  ) {
    (void) title;
    (void) body;
    (void) article;
    (void) category;
    (void) page;
    (void) footer;
    return false;
  }

  bool renderEmpty(int openCount, int candidateCount, int blockedArticles, const String& footer) {
    (void) openCount;
    (void) candidateCount;
    (void) blockedArticles;
    (void) footer;
    return false;
  }

  void renderStatus(const String& message, bool isError) {
    (void) message;
    (void) isError;
  }
};
