# ⚙️ [@eser/di](./)

`@eser/di` is a crucial component of `eserstack` that provides simple and
efficient dependency injection solutions.

## 🚀 Getting Started with Dependency Injection (DI)

Dependency injection is a software design pattern that enables the removal of
hard-coded dependencies from the code, making it possible to change them
whenever needed.

By promoting loose coupling, it enhances the testability and maintainability of
the overall codebase structure.

### Dependency Injection Container (DIC)

A dependency injection container is a software component responsible for the
instantiation and distribution of services or objects in your code. It
simplifies the management of dependencies by serving as a central registry for
all services.

## 🤔 What @eser/di offers?

`@eser/di` helps you handle these dependencies by providing a structured,
scalable and proper way to manage dependencies in your application. While its
dependency injection container is focused on simplicity and efficiency, it also
provides a set of decorators to make managing your application's services and
dependencies even easier.

## 🛠 Usage

Here you'll find a list of features provided by `@eser/di` along with brief
descriptions and usage examples.

### Registering services

Start by creating a registry and registering your services using the `set`,
`setLazy`, `setScoped` and `setTransient` methods.

```js
import * as di from "@eser/di";

// Register the mailService as a singleton service
di.registry.set("mailService", new MailService());

// Register the notifyService as a singleton service
di.registry.set("notifyService", new PushNotificationService());

// Register the dbConnection as a transient service,
// which is created anew each time it is called
di.registry.setTransient("dbConnection", () => new DatabaseConnection());

// Register the userList as a lazy-loaded service,
// which is created when first called
di.registry.setLazy(
  "userList",
  (container) => container.get("dbConnection").query("SELECT * FROM users"),
);
```

Alternatively, you can chain the registration methods:

```js
import * as di from "@eser/di";

di.registry
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
`get`, `getMany`, `invoke` methods. Even better, you can use the `di` template
literal tag to retrieve services.

```js
import * as di from "@eser/di";

// Retrieve registered services
const dns = di.di`mailService`;
const mns = di.di`notifyService`;
const db = di.di`dbConnection`;
const users = di.di`userList`;
```

Alternatively, retrieve multiple services at once:

```js
import * as di from "@eser/di";

const [dns, mns, db, users] = di.services.getMany(
  "mailService",
  "notifyService",
  "dbConnection",
  "userList",
);
```

You can directly call your functions using the registered services as
parameters:

```js
import * as di from "@eser/di";

di.registry.set("serviceA", () => console.log("Service A"));
di.registry.set("serviceB", () => console.log("Service B"));

function myFunction(serviceA, serviceB) {
  serviceA();
  serviceB();
}

di.invoke(myFunction); // This will log "Service A" and then "Service B"
```

### Template Strings

You can use the `di` template literal tag to easily retrieve services using
template strings. This provides a more readable and concise way to access your
dependencies.

```js
import * as di from "@eser/di";

di.registry.set("serviceA", () => console.log("Service A"));
di.registry.set("serviceB", () => console.log("Service B"));

di.di`first: ${"serviceA"} second: ${"serviceB"}`; // This will log "first: Service A second: Service B"
```

### Decorators

```js
import * as di from "@eser/di";

@di.injectable()
class PrinterClass {
  print() {
    console.log("testing");
  }
}

const test = di.di`PrinterClass`;
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
per scope. When a scope is closed (or disposed), all its scoped services lose
their references as if they were never instantiated.

---

🔗 For further details such as requirements, licensing and support guide, please
visit the [main eserstack repository](https://github.com/eser/stack).
