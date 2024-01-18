const PROVIDER_KEY = "__proton_provider__"

let started = false

const awaitStartThreads: thread[] = []
const awaitCallbacks: (() => void)[] = []

/**
 * Provider decorator.
 */
export function Provider() {
	return <T extends new () => InstanceType<T>>(providerClass: T) => {
		if (started) error("[Neutron]: Cannot create provider after Proton has started", 2);

		(providerClass as Record<string, unknown>)[PROVIDER_KEY] = new providerClass()
	};
}

export namespace Neutron {
	/**
	 * Returns true if proton is started.
	 */
	export function isStarted(): boolean {
		return started
	}

	/**
	 * Start Neutron. This should only be called once per
	 * environment (e.g. once on the server and once on
	 * the client). Attempts to call this more than once
	 * will throw an error.
	 *
	 * If any providers yield within their constructors,
	 * then this method will also yield.
	 *
	 * ```ts
	 * Neutron.start();
	 * print("Neutron started");
	 * ```
	 */
	export function start() {
		if (started) return

		started = true

		awaitCallbacks.forEach((callback) => task.spawn(callback))
		awaitStartThreads.forEach((awaitThread) => task.spawn(awaitThread))

		awaitCallbacks.clear()
		awaitStartThreads.clear()
	}

	/**
	 * Yields the calling thread until Neutron has been
	 * fully started.
	 *
	 * ```ts
	 * Neutron.awaitStart();
	 * print("Started");
	 * ```
	 */
	export function awaitStart() {
		if (started) return

		const thread = coroutine.running()

		awaitStartThreads.push(thread)

		coroutine.yield()
	}

	/**
	 * Calls the callback once Neutron has fully started.
	 * If Neutron is already started, the callback will
	 * be spawned immediately.
	 * @param callback Callback
	 */
	export function onStart(callback: () => void) {
		if (started) {
			task.spawn(callback)

			return
		}

		awaitCallbacks.push(callback)
	}

	/**
	 * Gets a provider within Neutron.
	 *
	 * An error will be thrown if the provider does not
	 * exist.
	 *
	 * ```ts
	 * // Directly
	 * const myProvider = Neutron.get(MyProvider);
	 *
	 * // From another provider
	 * class AnotherProvider {
	 * 	private readonly myProvider = Neutron.get(MyProvider);
	 * }
	 * ```
	 *
	 * @param providerClass The provider class
	 * @returns The provider singleton object
	 */
	export function get<T extends new () => InstanceType<T>>(providerClass: T): InstanceType<T> {
		const provider = (providerClass as Record<string, unknown>)[PROVIDER_KEY] as InstanceType<T> | undefined

		if (provider === undefined) error(`[Neutron]: Failed to find provider "${tostring(providerClass)}"`, 2)

		return provider;
	}
}