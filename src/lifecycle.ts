import { Neutron } from "./core";

type LifecycleCallback<T> = (...args: Parameters<T>) => void;

/**
 * The execution behavior of a custom lifecycle.
 */
export enum LifecycleBehavior {
	/**
	 * Execute the lifecycle callbacks one-by-one.
	 */
	Series,

	/**
	 * Execute the lifecycle callbacks all at the same
	 * time. This calls the callbacks using `task.spawn`
	 * internally.
	 */
	Concurrent
}

interface CallbackItem<T extends LifecycleCallback<T>> {
	callback: T
	memoryCategory: string
}

/**
 * Custom lifecycle for Neutron providers.
 */
export class NeutronLifecycle<T extends LifecycleCallback<T>> {
	private callbacks: CallbackItem<T>[] = []
	private onRegisteredCallbacks: ((c: T) => void)[] = []
	private onUnregisteredCallbacks: ((c: T) => void)[] = []

	/**
	 * Constructs a new lifecycle
	 * @param behavior Execution behavior (defaults to `LifecycleBehavior.Concurrent`)
	 */
	constructor(behavior: LifecycleBehavior = LifecycleBehavior.Concurrent) {
		switch (behavior) {
			case LifecycleBehavior.Series:
				this.fire = this.fireSeries
			break

			case LifecycleBehavior.Concurrent:
				this.fire = this.fireConcurrent
			break
		}
	}

	private callOnUnregisteredCallbacks(callback: T) {
		for (const onUnregistered of this.onUnregisteredCallbacks) {
			onUnregistered(callback);
		}
	}

	private fireConcurrent(...args: Parameters<T>) {
		for (const callback of this.callbacks) {
			task.spawn(() => {
				debug.setmemorycategory(callback.memoryCategory);
				callback.callback(...args);
			});
		}
	}

	private fireSeries(...args: Parameters<T>) {
		for (const callback of this.callbacks) {
			debug.setmemorycategory(callback.memoryCategory)

			callback.callback(...args)

			debug.resetmemorycategory()
		}
	}

	/**
	 * Fire the lifecycle.
	 * @param args Arguments passed to the registered callbacks.
	 */
	fire(...args: Parameters<T>) {}

	/**
	 * Register a lifecycle. This is usually only called from
	 * the `@OnLifecycle` decorator.
	 * @param callback Callback
	 * @param memoryCategory Memory category
	 */
	register(callback: T, memoryCategory: string) {
		this.callbacks.push({callback, memoryCategory})

		this.onRegisteredCallbacks.forEach((onRegistered) => onRegistered(callback))
	}

	/**
	 * Unregister a lifecycle.
	 * @param callback Callback to unregister
	 */
	unregister(callback: T) {
		const index = this.callbacks.findIndex((item) => item.callback === callback)

		if (index === -1) return

		this.callbacks.unorderedRemove(index)
		this.callOnUnregisteredCallbacks(callback)
	}

	/**
	 * Unregister all callbacks.
	 */
	unregisterAll() {
		this.callbacks.forEach((callback) => this.callOnUnregisteredCallbacks(callback.callback))
		this.callbacks.clear();
	}

	/**
	 * Listen to when a callback is registered.
	 * @param callback Registered callback.
	 * @returns `() => void` cleanup function (call to stop listening to `onRegistered`)
	 */
	onRegistered(callback: (c: T) => void) {
		this.onRegisteredCallbacks.push(callback)

		return () => {
			const index = this.onRegisteredCallbacks.indexOf(callback)

			if (index === -1) return

			this.onRegisteredCallbacks.unorderedRemove(index)
		}
	}

	/**
	 * Listen to when a callback is unregistered.
	 * @param callback Unregistered callback.
	 * @returns `() => void` cleanup function (call to stop listening to `onUnregistered`)
	 */
	onUnregistered(callback: (c: T) => void) {
		this.onUnregisteredCallbacks.push(callback)

		return () => {
			const index = this.onUnregisteredCallbacks.indexOf(callback)

			if (index === -1) return

			this.onUnregisteredCallbacks.unorderedRemove(index)
		};
	}
}

/**
 * OnLifecycle decorator.
 * @param lifecycle Attached lifecycle
 */
export function Lifecycle<T extends LifecycleCallback<T>>(lifecycle: NeutronLifecycle<T>) {
	return (target: defined, _: string, descriptor: TypedPropertyDescriptor<(this: defined, ...args: Parameters<T>) => void>) => {
		lifecycle.register(
			((...args: Parameters<T>) => {
				descriptor.value(Neutron.get(target as new () => never), ...args)
			}) as T,
			tostring(target)
		);
	};
}

export const NeutronStart = new NeutronLifecycle<() => void>(LifecycleBehavior.Concurrent)

Neutron.onStart(() => NeutronStart.fire())