import type {
  DeviceGesture,
  DevicePhysicalButton
} from "./device-interactions";

export interface DeviceButtonGestureTiming {
  debounceMs: number;
  doubleClickWindowMs: number;
  longPressMs: number;
}

export interface RecognizedDeviceGesture {
  button: DevicePhysicalButton;
  gesture: DeviceGesture;
  atMs: number;
}

interface ButtonState {
  rawPressed: boolean;
  rawChangedAt: number;
  stablePressed: boolean;
  pressStartedAt?: number;
  longEmitted: boolean;
  pendingSingleAt?: number;
  continuingDouble: boolean;
}

const BUTTON_ORDER: readonly DevicePhysicalButton[] = [
  "left",
  "primary",
  "right"
];

export const DEFAULT_DEVICE_BUTTON_GESTURE_TIMING: Readonly<DeviceButtonGestureTiming> = {
  debounceMs: 45,
  doubleClickWindowMs: 320,
  longPressMs: 700
};

/**
 * Deterministic recognizer for the three physical device buttons.
 *
 * Firmware feeds raw GPIO level changes through `feed` and advances time
 * through `tick`. No wall clock or timers are read internally, which keeps the
 * same transition rules usable in unit tests and in a firmware event loop.
 */
export class DeviceButtonGestureRecognizer {
  private readonly timing: DeviceButtonGestureTiming;
  private readonly states = new Map<DevicePhysicalButton, ButtonState>();
  private lastAdvancedAt = 0;

  constructor(
    timing: Partial<DeviceButtonGestureTiming> = {}
  ) {
    this.timing = normalizeTiming(timing);
    for (const button of BUTTON_ORDER) {
      this.states.set(button, createButtonState());
    }
  }

  /**
   * Feed a raw GPIO state change. `pressed=true` means the electrical input has
   * entered its active state after any board-specific polarity conversion.
   */
  feed(
    button: DevicePhysicalButton,
    pressed: boolean,
    atMs: number
  ): RecognizedDeviceGesture[] {
    const events = this.advanceTo(atMs);
    const state = this.stateFor(button);
    if (state.rawPressed !== pressed) {
      state.rawPressed = pressed;
      state.rawChangedAt = atMs;
    }
    return events;
  }

  /**
   * Advance the recognizer clock. Firmware should call this from its loop even
   * when no GPIO edge occurred so long presses and delayed singles can fire.
   */
  tick(atMs: number): RecognizedDeviceGesture[] {
    return this.advanceTo(atMs);
  }

  private advanceTo(atMs: number): RecognizedDeviceGesture[] {
    assertTimestamp(atMs, this.lastAdvancedAt);
    const events = BUTTON_ORDER.flatMap((button) =>
      this.advanceButton(button, this.stateFor(button), atMs)
    );
    this.lastAdvancedAt = atMs;
    return events.sort((left, right) => {
      const byTime = left.atMs - right.atMs;
      if (byTime !== 0) {
        return byTime;
      }
      return BUTTON_ORDER.indexOf(left.button) - BUTTON_ORDER.indexOf(right.button);
    });
  }

  private advanceButton(
    button: DevicePhysicalButton,
    state: ButtonState,
    throughMs: number
  ): RecognizedDeviceGesture[] {
    const events: RecognizedDeviceGesture[] = [];

    while (true) {
      const transitionAt = state.rawPressed !== state.stablePressed
        ? state.rawChangedAt + this.timing.debounceMs
        : undefined;
      const longAt = state.stablePressed
        && !state.longEmitted
        && state.pressStartedAt !== undefined
        ? state.pressStartedAt + this.timing.longPressMs
        : undefined;
      const singleAt = state.pendingSingleAt;

      const next = earliestDue(throughMs, [
        longAt === undefined ? undefined : { kind: "long" as const, atMs: longAt, priority: 0 },
        transitionAt === undefined
          ? undefined
          : { kind: "transition" as const, atMs: transitionAt, priority: 1 },
        singleAt === undefined
          ? undefined
          : { kind: "single" as const, atMs: singleAt, priority: 2 }
      ]);
      if (!next) {
        break;
      }

      if (next.kind === "long") {
        state.longEmitted = true;
        state.pendingSingleAt = undefined;
        state.continuingDouble = false;
        events.push({ button, gesture: "long", atMs: next.atMs });
        continue;
      }

      if (next.kind === "single") {
        state.pendingSingleAt = undefined;
        events.push({ button, gesture: "single", atMs: next.atMs });
        continue;
      }

      state.stablePressed = state.rawPressed;
      if (state.stablePressed) {
        state.pressStartedAt = next.atMs;
        state.longEmitted = false;
        if (
          state.pendingSingleAt !== undefined
          && next.atMs <= state.pendingSingleAt
        ) {
          state.pendingSingleAt = undefined;
          state.continuingDouble = true;
        } else {
          state.continuingDouble = false;
        }
        continue;
      }

      state.pressStartedAt = undefined;
      if (state.longEmitted) {
        state.longEmitted = false;
        state.continuingDouble = false;
        state.pendingSingleAt = undefined;
        continue;
      }

      if (state.continuingDouble) {
        state.continuingDouble = false;
        state.pendingSingleAt = undefined;
        events.push({ button, gesture: "double", atMs: next.atMs });
        continue;
      }

      state.pendingSingleAt = next.atMs + this.timing.doubleClickWindowMs;
    }

    return events;
  }

  private stateFor(button: DevicePhysicalButton): ButtonState {
    const state = this.states.get(button);
    if (!state) {
      throw new Error(`Unsupported device button: ${String(button)}`);
    }
    return state;
  }
}

function createButtonState(): ButtonState {
  return {
    rawPressed: false,
    rawChangedAt: 0,
    stablePressed: false,
    longEmitted: false,
    continuingDouble: false
  };
}

function normalizeTiming(
  input: Partial<DeviceButtonGestureTiming>
): DeviceButtonGestureTiming {
  const timing = {
    ...DEFAULT_DEVICE_BUTTON_GESTURE_TIMING,
    ...input
  };
  for (const [name, value] of Object.entries(timing)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a non-negative finite number.`);
    }
  }
  return timing;
}

function assertTimestamp(atMs: number, previousMs: number): void {
  if (!Number.isFinite(atMs) || atMs < previousMs) {
    throw new Error("Device button timestamps must be finite and monotonic.");
  }
}

type ScheduledRecognizerAction = {
  kind: "long" | "transition" | "single";
  atMs: number;
  priority: number;
};

function earliestDue(
  throughMs: number,
  candidates: Array<ScheduledRecognizerAction | undefined>
): ScheduledRecognizerAction | undefined {
  return candidates
    .filter((candidate): candidate is ScheduledRecognizerAction =>
      candidate !== undefined && candidate.atMs <= throughMs
    )
    .sort((left, right) =>
      (left.atMs - right.atMs) || (left.priority - right.priority)
    )[0];
}
