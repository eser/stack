# ⚙️ [cool/di](./)

`cool/di` is a crucial submodule of cool ecosystem that provides simple and
efficient dependency injection solutions.

## 🚀 Getting Started with Dependency Injection (DI)

Dependency injection is a software design pattern that enables the removal of
hard-coded dependencies from the code, making it possible to change them
whenever needed.

As it fosters loose coupling, its use enhances the testability and
maintainability of the codebase.

### Dependency Injection Container (DIC)

A dependency injection container is a software component responsible for the
instantiation and distribution of services or objects in your code. It
simplifies the management of dependencies by serving as a central registry for
all services.

## 🤔 What cool/di does?

`cool/di` helps you handle these dependencies properly. It provides a simple and
efficient dependency injection container that is designed to manage your
application's services in a maintainable and scalable way, improving the overall
codebase structure.

## 🛠 Usage

Below you'll find a list of features provided by `cool/di` along with brief
descriptions and usage examples.

### Registering services

Start by creating a registry and registering your services using the `set`,
`setLazy`, `setScoped` and `setTransient` methods.

```ts
import { registry } from "$cool/di/mod.ts";

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
import { registry } from "$cool/di/mod.ts";

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

Once you have the services container, you may retrieve your services using the
`get` and `getMany` methods. Even better, you can use the `di` template literal
tag to retrieve services.

```ts
import { di } from "$cool/di/mod.ts";

// Retrieve registered services
const dns = di`mailService`;
const mns = di`notifyService`;
const db = di`dbConnection`;
const users = di`userList`;
```

Alternatively, retrieve multiple services at once:

```ts
import { services } from "$cool/di/mod.ts";

const [dns, mns, db, users] = services.getMany(
  "mailService",
  "notifyService",
  "dbConnection",
  "userList",
);
```

### Decorators

```ts
import { di, injectable } from "$cool/di/mod.ts";

@injectable()
class PrinterClass {
  print() {
    console.log("testing");
  }
}

const test = di`PrinterClass`;
test.print(); // outputs "testing"
```

## 📕 API Reference

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
Builds a dependency injection container with the registered services.

### Container

**get(key: string | symbol | object, defaultValue?: any): any**\
Returns the corresponding service to the specified key.

**getMany(...keys: (string | symbol | object)[]): any[]**\
Returns the corresponding services to the specified keys in an array.

**createScope(): Container**\
Initiates a new scope. Each new scope inherits all services from the root scope
**except** those marked as 'scoped'. Scoped services are instantiated just once
per scope. When a scope is disposed of, all its scoped services lose their
references as if they were never instantiated.

---

🔗 For further details such as requirements, licensing and support guide, please
visit the [main cool repository](https://github.com/eser/cool).
