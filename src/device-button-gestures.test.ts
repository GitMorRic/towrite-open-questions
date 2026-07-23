import { describe, expect, it } from "vitest";
import {
  DeviceButtonGestureRecognizer,
  type RecognizedDeviceGesture
} from "./device-button-gestures";

function gestures(events: RecognizedDeviceGesture[]): string[] {
  return events.map((event) =>
    `${event.button}:${event.gesture}@${event.atMs}`
  );
}

describe("DeviceButtonGestureRecognizer", () => {
  it("emits a main-button single only after debounce and the double-click window", () => {
    const recognizer = new DeviceButtonGestureRecognizer();

    expect(recognizer.feed("primary", true, 0)).toEqual([]);
    expect(recognizer.tick(44)).toEqual([]);
    expect(recognizer.tick(45)).toEqual([]);
    expect(recognizer.feed("primary", false, 100)).toEqual([]);
    expect(recognizer.tick(145)).toEqual([]);
    expect(recognizer.tick(464)).toEqual([]);
    expect(gestures(recognizer.tick(465))).toEqual([
      "primary:single@465"
    ]);
  });

  it("recognizes a main-button double and suppresses the pending single", () => {
    const recognizer = new DeviceButtonGestureRecognizer();

    recognizer.feed("primary", true, 0);
    recognizer.tick(45);
    recognizer.feed("primary", false, 100);
    recognizer.tick(145);

    recognizer.feed("primary", true, 200);
    recognizer.tick(245);
    recognizer.feed("primary", false, 280);
    expect(gestures(recognizer.tick(325))).toEqual([
      "primary:double@325"
    ]);
    expect(recognizer.tick(1_000)).toEqual([]);
  });

  it("recognizes a main-button long press and emits no click on release", () => {
    const recognizer = new DeviceButtonGestureRecognizer();

    recognizer.feed("primary", true, 0);
    recognizer.tick(45);
    expect(recognizer.tick(744)).toEqual([]);
    expect(gestures(recognizer.tick(745))).toEqual([
      "primary:long@745"
    ]);

    recognizer.feed("primary", false, 800);
    expect(recognizer.tick(845)).toEqual([]);
    expect(recognizer.tick(1_500)).toEqual([]);
  });

  it("ignores raw bounce changes that never remain stable for 45ms", () => {
    const recognizer = new DeviceButtonGestureRecognizer();

    recognizer.feed("primary", true, 0);
    recognizer.feed("primary", false, 20);
    recognizer.feed("primary", true, 30);
    recognizer.feed("primary", false, 50);

    expect(recognizer.tick(500)).toEqual([]);
  });

  it("keeps debounce and gesture state independent for each button", () => {
    const recognizer = new DeviceButtonGestureRecognizer();

    recognizer.feed("primary", true, 0);
    recognizer.feed("primary", false, 20);
    recognizer.feed("right", true, 25);
    recognizer.tick(70);

    expect(gestures(recognizer.tick(770))).toEqual([
      "right:long@770"
    ]);
    recognizer.feed("right", false, 800);
    recognizer.tick(845);
    expect(recognizer.tick(1_500)).toEqual([]);
  });

  it("maps a right-button hold to one long gesture without an accidental single", () => {
    const recognizer = new DeviceButtonGestureRecognizer();

    recognizer.feed("right", true, 10);
    recognizer.tick(55);
    expect(gestures(recognizer.tick(755))).toEqual([
      "right:long@755"
    ]);
    recognizer.feed("right", false, 900);
    recognizer.tick(945);

    expect(recognizer.tick(2_000)).toEqual([]);
  });
});
