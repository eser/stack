# 🧱 [cool/di](./)

## Package Information

cool/di is a crucial submodule of cool ecosystem that provides a simple and
efficient dependency injection container. It is designed to manage your
application's services in a maintainable and scalable way, improving the overall
codebase structure.

For further details such as requirements, license information and support guide,
please see [main cool repository](https://github.com/eser/cool).

## Dependency Injection (DI)

Dependency injection is a software design pattern that enables the removal of
hard-coded dependencies from the code, making it possible to change them
whenever needed.

As it fosters loose coupling, its use enhances the testability and
maintainability of the codebase.

## Dependency Injection Container

A dependency injection container is a software component responsible for the
instantiation and distribution of services or objects in your code. It
simplifies the management of dependencies by serving as a central registry for
all services.

## Usage

With cool/di, you may register and retrieve services.

### Registering services

Start by creating a registry and registering your services using the `set`,
`setLazy`, `setScoped` and `setTransient` methods.

```ts
import { registry } from "https://deno.land/x/cool/di/mod.ts";

// Register the mailService as a singleton service
registry.set("mailService", new MailService());

// Register the notifyService as a singleton service
registry.set("notifyService", new PushNotificationService());

// Register the dbConnection as a transient service,
// which is created anew each time it is called
registry.setTransient("dbConnection", () => new DatabaseConnection());

// Register the userList as a lazy-loaded service,
// which is created when first called
registry.setLazy(
  "userList",
  (container) => container.get("dbConnection").query("SELECT * FROM users"),
);
```

Alternatively, you can chain the registration methods:

```ts
import { registry } from "https://deno.land/x/cool/di/mod.ts";

registry
  .set("mailService", new MailService())
  .set("notifyService", new PushNotificationService())
  .setTransient("dbConnection", () => new DatabaseConnection())
  .setLazy(
    "userList",
    (container) => container.get("dbConnection").query("SELECT * FROM users"),
  );
```

### Retrieving services

Once the container is built, you may retrieve your services using the `get` and
`getMany` methods.

```ts
import { services } from "https://deno.land/x/cool/di/mod.ts";

// Retrieve registered services
const dns = services.get("mailService");
const mns = services.get("notifyService");
const db = services.get("dbConnection");
const users = services.get("userList");
```

Alternatively, retrieve multiple services at once:

```ts
import { services } from "https://deno.land/x/cool/di/mod.ts";

const [dns, mns, db, users] = services.getMany(
  "mailService",
  "notifyService",
  "dbConnection",
  "userList",
);
```

## API Reference

The following is a list of all available methods and their descriptions.

### Registry

**set(key: string | symbol | object, value: any): Registry**\
Registers a singleton service with the specified key.

**setLazy(key: string | symbol | object, factory: () => any): Registry**\
Registers a lazy-loaded service with the specified key. The value is created
when first called.

**setScoped(key: string | symbol | object, factory: () => any): Registry**\
Registers a scoped service with the specified key. The value is created once per
scope.

**setTransient(key: string | symbol | object, factory: () => any): Registry**\
Registers a transient service with the specified key. The value is created anew
each time it is called.

**build(): Container**\
Creates a container with the registered values.

### Container

**get(key: string | symbol | object, defaultValue?: any): any**\
Returns the value corresponding to the specified key.

**getMany(...keys: (string | symbol | object)[]): any[]**\
Returns the values corresponding to the specified keys in an array.

**createScope(): Container**\
Creates a scope for this container.
