import type {
  NavigationAdapter,
  NavigationOpenContext,
  NavigationOpenResult,
  NavigationTarget
} from "./types";

/**
 * Provider registry used after a device event has been authenticated and tied
 * to the card actually visible on screen.
 */
export class NavigationRouter {
  private readonly adapters = new Map<NavigationTarget["provider"], NavigationAdapter>();

  register<TTarget extends NavigationTarget>(adapter: NavigationAdapter<TTarget>): () => void {
    if (this.adapters.has(adapter.provider)) {
      throw new Error(`Navigation adapter is already registered: ${adapter.provider}`);
    }
    this.adapters.set(adapter.provider, adapter);
    return () => {
      if (this.adapters.get(adapter.provider) === adapter) {
        this.adapters.delete(adapter.provider);
      }
    };
  }

  async open(
    target: NavigationTarget,
    context: NavigationOpenContext
  ): Promise<NavigationOpenResult> {
    if (!context.displayedValidated && context.eventId) {
      return {
        status: "blocked",
        exact: false,
        focused: false,
        provider: target.provider,
        message: "A remote open command must match the acknowledged displayed card."
      };
    }
    const adapter = this.adapters.get(target.provider);
    if (!adapter) {
      return {
        status: "unsupported",
        exact: false,
        focused: false,
        provider: target.provider,
        message: `No navigation adapter is enabled for ${target.provider}.`
      };
    }
    return adapter.open(target, context);
  }
}
