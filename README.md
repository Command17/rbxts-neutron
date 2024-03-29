# Neutron

Neutron is a fork from [Proton](https://github.com/Sleitnick/rbxts-proton) that adds some usefull stuff.

> **Warning**
>
> Neutron is still in its early stages! Bugs may exist.

## Class Components

A `ClassComponent` is just like a `Component` except it has no `onStart` or `onStop` method.

```ts
import { BaseClassComponent, ClassComponent } from "@rbxts/neutron";

@ClassComponent<BasePart>({ tag: "MyClassComponent" })
class MyClassComponent extends BaseClassComponent<BasePart> {
	constructor(instance: BasePart, tag: string) {
		super(instance, tag)

		// Start code
	}

	public destroy() {
		// clean up code
	}
}
```

## Dangerous Net Function

`DangerousNetFunction` allows the server to ask the client for stuff unlike `NetFunctions`

> **Warning**
>
> There is no timeout for this, that means if the client yields, the server will also yield.

```ts
// shared/network.ts
import { DangerousNetFunction } from "@rbxts/neutron";

export namespace Network {
	// Send a client message to the server
	export const sendClientMessage = new DangerousNetFunction<[], [message: string]>
}
```

## Unreliable Net Event

Neutron adds support for [UnreliableRemoteEvents](https://devforum.roblox.com/t/introducing-unreliableremoteevents/2724155).

They work just like NetEvents.

```ts
// shared/network.ts
import { UnreliableNetEvent } from "@rbxts/neutron";

export namespace Network {
	// Send the mouse pos to the server
	export const updateMousePos = new UnreliableNetEvent<[pos: Vector3], NetEventType.ClientToServer>
}
```

---

## Providers

Providers are the core of Proton. A provider _provides_ a specific service or utility to your game. For example, a game might have a `DataProvider` (or `DataService`/`DataManager`/etc.) that provides the logic for handling data for players in the game.

### Structure
The minimum structure of a provider looks like the following:
```ts
import { Provider } from "@rbxts/neutron";

@Provider()
export class MyProvider {}
```

That's it. The `@Provider()` decorator communicates data about the class to Proton, but does _not_ mutate the given provider at all. Proton will create a singleton of the provider once Proton is started.

### Extensible
Providers can have any number of methods or fields added to them. They're just plain classes. Add anything to them.

```ts
@Provider()
export class MyProvider {
	private message = "hello!";

	// Optional constructor method
	constructor() {
		// Use the constructor to set up any necessary functionality
		// for the provider (e.g. hooking up network connections).
	}

	// Custom method
	public helloWorld() {
		print(this.message);
	}
}
```

### Built-in Start Lifecycle
Neutron includes an optional built-in lifecycle method `NeutronStart`, which is fired when Neutron is started. All `NeutronStart` lifecycle methods are called at the same time using `task.spawn`, which means that these methods can yield without blocking other providers from starting. It is common practice to use `NeutronStart` as a place to have long-running loops (e.g. a system that drives map loading and rotation every round).

```ts
import { Lifecycle, NeutronStart, Provider } from "@rbxts/neutron";

@Provider()
export class MyProvider {
	constructor() {
		print("MyProvider initialized");
	}

	@Lifecycle(NeutronStart)
	public onStart() {
		print("MyProvider started");
	}
}
```

## Starting Neutron

From both a server and client script, call the `Proton.start()` method.

```ts
import { Neutron } from "@rbxts/proton";

Neutron.start();
```

If another script requires Proton to be started, `Proton.awaitStart()` can be used, which will yield until Proton is fully started.

```ts
import { Neutron } from "@rbxts/neutron";

Neutron.awaitStart();
```

### Loading Providers
Modules are not magically loaded. Thus, if your providers exist in their own modules but are never imported by any running code, then Proton will never see them and they will not start. This is common for top-level providers that no other code relies on. In such cases, they must be explicitly imported:

```ts
import { Neutron } from "@rbxts/neutron";

// e.g.
import "./providers/my-provider.ts"

Neutron.start();
```

## Getting a Provider

Once Neutron is started, use `Neutron.get()` to get a provider:

```ts
const myProvider = Neutron.get(MyProvider);
myProvider.helloWorld();
```

Providers can also access other providers:

```ts
@Provider()
export class AnotherProvider {
	private readonly myProvider = Neutron.get(MyProvider);

	constructor() {
		myProvider.helloWorld();
	}
}
```

## Network

The recommended way to do networking in Proton is to create a `network.ts` file in a shared directory (e.g. accessible from both the server and the client), and then create a `Network` namespace with the desired `NetEvent` and `NetFunction` objects. Optionally, multiple different namespaces can be created to separate between network functionality.

```ts
// shared/network.ts
import { NetEvent, NetEventType, NetFunction } from "@rbxts/neutron";

export namespace Network {
	// Send a message to a player
	export const sendMessageToPlayer = new NetEvent<[message: string], NetEventType.ServerToClient>();

	// Get fireBullet from player
	export const fireBullet = new NetEvent<[pos: Vector3, dir: Vector3], NetEventType.ClientToServer>();

	// Allow client to fetch some data
	export const getData = new NetFunction<void, [data: string]>();

	// Client sends request to buy something
	export const buy = new NetFunction<[item: string, category: string], [bought: boolean]>();

	// Client gets sent multiple variables
	export const getMultiple = new NetFunction<void, {msg1: string, msg2: string, msg3: string}>();
}
```

Example of the above Network setup being consumed:

```ts
// server

Network.sendMessageToPlayer.server.fire(somePlayer, "hello world!");
Network.fireBullet.server.connect((pos, dir) => {
	// Handle bullet being fired
});
Network.getData.server.handle((player) => {
	return "Some data";
});
Network.buy.server.handle((player, item, category) => {
	// Buy item
	return false;
});
Network.getMultiple.handle((player) => {
	return { msg1: "hello", msg2: "world", msg3: "how are you" };
});
```

```ts
// client

Network.sendMessageToPlayer.client.connect((message) => {
	print(message);
});
Network.fireBullet.client.fire(new Vector3(), Vector3.zAxis);
const data = Network.getData.client.fire();
const { msg1, msg2, msg3 } = Network.getMultiple.client.fire();
```

## Lifecycles

Custom lifecycles can be added. At their core, lifecycles are just special event dispatchers that can hook onto a class method. For example, here is a lifecycle that is fired every Heartbeat.

```ts
// shared/lifecycles.ts
import { NeutronLifecycle } from "@rbxts/neutron";

export interface OnHeartbeat {
	onHeartbeat(dt: number): void;
}

export const HeartbeatLifecycle = new NeutronLifecycle<OnHeartbeat["onHeartbeat"]>();

RunService.Heartbeat.Connect((dt) => HeartbeatLifecycle.fire(dt));
```

A provider can then hook into the lifecycle:

```ts
import { Provider, Lifecycle } from "@rbxts/neutron";

@Provider()
export class MyProvider implements OnHeartbeat {
	@Lifecycle(HeartbeatLifecycle)
	onHeartbeat(dt: number) {
		print("Update", dt);
	}
}
```

Here is a more complex lifecycle that is fired when a player enters the game.

```ts
// shared/lifecycles.ts
export interface OnPlayerAdded {
	onPlayerAdded(player: Player): void;
}

export const PlayerAddedLifecycle = new ProtonLifecycle<OnPlayerAdded["onPlayerAdded"]>();

// Trigger lifecycle for all current players and all future players:
Players.PlayerAdded.Connect((player) => PlayerAddedLifecycle.fire(player));
for (const player of Players.GetPlayers()) {
	PlayerAddedLifecycle.fire(player);
}

// Trigger lifecycle for all players for any new callbacks that get registered later on during runtime:
PlayerAddedLifecycle.onRegistered((callback) => {
	for (const player of Players.GetPlayers()) {
		task.spawn(callback, player);
	}
});
```

```ts
@Provider()
export class MyProvider implements OnPlayerAdded {
	@Lifecycle(PlayerAddedLifecycle)
	onPlayerAdded(player: Player) {
		print(`Player entered the game: ${player}`);
	}
}
```

Having the `OnPlayerAdded` interface just helps to keep explicit typings across consumers of the lifecycle. However, it is not entirely necessary. The above example could also have a lifecycle definition and consumer look like such:

```ts
export const PlayerAddedLifecycle = new ProtonLifecycle<(player: Player) => void>();

@Provider()
export class MyProvider {
	@Lifecycle(PlayerAddedLifecycle)
	onPlayerAdded(player: Player) {}
}
```


## Components

Bind components to Roblox instances using the Component class and CollectionService tags.

```ts
import { BaseComponent, Component } from "@rbxts/neutron";

@Component({ tag: "MyComponent" })
class MyComponent extends BaseComponent<BasePart> {
	onStart() {}
	onStop() {}
}
```

In initialization file:

```ts
import { Proton } from "@rbxts/neutron";

import "./wherever/my-component";

Proton.start();
```
