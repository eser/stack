# eser-go/lib

## Overview

**lib** is a comprehensive utility library for Go applications that provides commonly used helper functions across
various domains including networking, cryptography, environment handling, string manipulation, and more.

## Key Features

- **Network Utilities**: IP address parsing, host/port splitting, local network detection
- **Cryptography**: Self-signed certificate generation, random byte generation
- **Environment Handling**: Environment-aware file loading, variable overrides
- **String Utilities**: Advanced string trimming functions
- **Path Utilities**: File path parsing and manipulation
- **Array Utilities**: Generic array operations and copying
- **Map Utilities**: Case-insensitive map operations
- **SQL Types**: Enhanced nullable SQL types with JSON support
- **ID Generation**: ULID-based unique identifier generation
- **Logging Utilities**: Structured logging attribute serialization

## API Reference

### Network Utilities

#### SplitHostPort

Splits a network address into host and port components.

```go
func SplitHostPort(addr string) (string, string, error)
```

**Usage:**

```go
import "github.com/eser/stack/apps/services/pkg/eser-go/lib"

// Split address with port
host, port, err := lib.SplitHostPort("localhost:8080")
// host = "localhost", port = "8080", err = nil

// Address without port
host, port, err := lib.SplitHostPort("localhost")
// host = "localhost", port = "", err = nil

// IPv6 address
host, port, err := lib.SplitHostPort("[::1]:8080")
// host = "::1", port = "8080", err = nil
```

#### DetectLocalNetwork

Determines if a request IP address is from the local network.

```go
func DetectLocalNetwork(requestAddr string) (bool, error)
```

**Usage:**

```go
// Check if request is from local network
isLocal, err := lib.DetectLocalNetwork("127.0.0.1:54321")
if err != nil {
    log.Fatal(err)
}

if isLocal {
    fmt.Println("Request from local network")
}

// Handle multiple addresses (X-Forwarded-For style)
isLocal, err := lib.DetectLocalNetwork("10.0.0.1:80,203.0.113.1:80")
```

### Cryptography

#### CryptoGetRandomBytes

Generates cryptographically secure random bytes.

```go
func CryptoGetRandomBytes(size int) []byte
```

**Usage:**

```go
// Generate 32 random bytes for a key
key := lib.CryptoGetRandomBytes(32)
fmt.Printf("Random key: %x\n", key)

// Generate session token
token := lib.CryptoGetRandomBytes(16)
```

#### GenerateSelfSignedCert

Creates a self-signed TLS certificate for development purposes.

```go
func GenerateSelfSignedCert() (tls.Certificate, error)
```

**Usage:**

```go
// Generate certificate for HTTPS development server
cert, err := lib.GenerateSelfSignedCert()
if err != nil {
    log.Fatal("Failed to generate certificate:", err)
}

// Use with HTTP server
server := &http.Server{
    Addr:      ":8443",
    TLSConfig: &tls.Config{Certificates: []tls.Certificate{cert}},
}

go server.ListenAndServeTLS("", "")
```

### Environment Handling

#### EnvGetCurrent

Gets the current environment name from `env` environment variable.

```go
func EnvGetCurrent() string
```

**Usage:**

```go
// Get current environment (defaults to "development")
env := lib.EnvGetCurrent()
fmt.Printf("Running in %q environment\n", env)

// Set environment
os.Setenv("env", "production")
env = lib.EnvGetCurrent() // Returns "production"
```

#### EnvAwareFilenames

Generates environment-aware filenames for configuration loading.

```go
func EnvAwareFilenames(env string, filename string) []string
```

**Usage:**

```go
// Get environment-aware config filenames
filenames := lib.EnvAwareFilenames("production", "config.json")
// Returns: ["config.json", "config.production.json", "config.local.json", "config.production.local.json"]

// For test environment (excludes .local)
filenames := lib.EnvAwareFilenames("test", "app.yaml")
// Returns: ["app.yaml", "app.test.yaml", "app.test.local.yaml"]
```

#### EnvOverrideVariables

Loads system environment variables into a map with optional case-insensitive keys.

```go
func EnvOverrideVariables(m *map[string]any, keyCaseInsensitive bool)
```

**Usage:**

```go
config := make(map[string]any)

// Load environment variables (case sensitive)
lib.EnvOverrideVariables(&config, false)

// Load environment variables (case insensitive)
lib.EnvOverrideVariables(&config, true)
// DATABASE_URL and database_url will both map to the same key
```

### String Utilities

#### String Trimming Functions

Advanced string trimming that handles Unicode whitespace properly.

```go
func StringsTrimLeadingSpace(src string) string
func StringsTrimTrailingSpace(src string) string
func StringsTrimLeadingSpaceFromBytes(src []byte) []byte
func StringsTrimTrailingSpaceFromBytes(src []byte) []byte
```

**Usage:**

```go
// Trim leading whitespace
text := "   hello world"
trimmed := lib.StringsTrimLeadingSpace(text)
// Result: "hello world"

// Trim trailing whitespace
text = "hello world   "
trimmed = lib.StringsTrimTrailingSpace(text)
// Result: "hello world"

// Work with byte slices
data := []byte("   hello world   ")
leading := lib.StringsTrimLeadingSpaceFromBytes(data)
trailing := lib.StringsTrimTrailingSpaceFromBytes(data)
```

### Path Utilities

#### PathsSplit

Splits a file path into directory, basename, and extension.

```go
func PathsSplit(filename string) (string, string, string)
```

**Usage:**

```go
// Split file path
dir, name, ext := lib.PathsSplit("/path/to/config.json")
// dir = "/path/to/", name = "config", ext = ".json"

// File without extension
dir, name, ext := lib.PathsSplit("/path/to/README")
// dir = "/path/to/", name = "README", ext = ""

// Just filename
dir, name, ext := lib.PathsSplit("app.go")
// dir = "", name = "app", ext = ".go"
```

### Array Utilities

#### ArraysCopy

Efficiently copies and concatenates multiple slices into a single slice.

```go
func ArraysCopy[T any](items ...[]T) []T
```

**Usage:**

```go
// Concatenate string slices
slice1 := []string{"a", "b"}
slice2 := []string{"c", "d"}
slice3 := []string{"e"}

result := lib.ArraysCopy(slice1, slice2, slice3)
// Result: ["a", "b", "c", "d", "e"]

// Works with any type
ints1 := []int{1, 2}
ints2 := []int{3, 4}
intResult := lib.ArraysCopy(ints1, ints2)
// Result: [1, 2, 3, 4]

// Single slice copy
copied := lib.ArraysCopy(slice1)
```

### Map Utilities

#### CaseInsensitiveSet

Sets a value in a map using case-insensitive key matching.

```go
func CaseInsensitiveSet(m *map[string]any, key string, value any)
```

**Usage:**

```go
config := map[string]any{
    "DATABASE_URL": "postgres://localhost/db1",
}

// This will update the existing key instead of creating a new one
lib.CaseInsensitiveSet(&config, "database_url", "postgres://localhost/db2")
// config["DATABASE_URL"] is now "postgres://localhost/db2"

// If no matching key exists, creates new key
lib.CaseInsensitiveSet(&config, "API_KEY", "secret123")
// config["API_KEY"] = "secret123"
```

### SQL Types

#### NullString

Enhanced nullable string type with JSON marshaling support.

```go
type NullString struct {
    sql.NullString
}
```

**Usage:**

```go
// Use in struct definitions
type User struct {
    ID       int64            `json:"id"`
    Name     string           `json:"name"`
    Bio      lib.NullString   `json:"bio"`
    Website  lib.NullString   `json:"website"`
}

// Create null value
bio := lib.NullString{}
// bio.Valid = false, bio.String = ""

// Create with value
bio = lib.NullString{sql.NullString{String: "Developer", Valid: true}}

// JSON marshaling
data, err := json.Marshal(bio)
// If Valid=true: "Developer"
// If Valid=false: null

// Database scanning
var bio lib.NullString
err := row.Scan(&user.ID, &user.Name, &bio)
```

### ID Generation

#### IDsGenerateUnique

Generates unique identifiers using ULID (Universally Unique Lexicographically Sortable Identifier).

```go
func IDsGenerateUnique() string
```

**Usage:**

```go
// Generate unique ID for entities
userID := lib.IDsGenerateUnique()
fmt.Printf("User ID: %s\n", userID)
// Output: User ID: 01ARZ3NDEKTSV4RRFFQ69G5FAV

// Generate multiple IDs
sessionID := lib.IDsGenerateUnique()
requestID := lib.IDsGenerateUnique()

// IDs are lexicographically sortable by creation time
ids := []string{
    lib.IDsGenerateUnique(),
    lib.IDsGenerateUnique(),
    lib.IDsGenerateUnique(),
}
// ids are automatically sorted by creation time
```

### Logging Utilities

#### SerializeSlogAttrs

Serializes structured logging attributes into a string format.

```go
func SerializeSlogAttrs(attrs []slog.Attr) string
```

**Usage:**

```go
import "log/slog"

// Create attributes
attrs := []slog.Attr{
    slog.String("user_id", "12345"),
    slog.Int("status_code", 200),
    slog.String("method", "GET"),
}

// Serialize to string
serialized := lib.SerializeSlogAttrs(attrs)
fmt.Println(serialized)
// Output: "user_id=12345, status_code=200, method=GET"

// Use in custom logging
message := fmt.Sprintf("Request processed: %s", lib.SerializeSlogAttrs(attrs))
```

## Error Handling

The lib package uses sentinel errors for consistent error handling:

```go
import "errors"

// Network errors
if errors.Is(err, lib.ErrInvalidIPAddress) {
    // Handle invalid IP address
}

if errors.Is(err, lib.ErrFailedToSplitHostPort) {
    // Handle host:port parsing error
}

// Cryptography errors
if errors.Is(err, lib.ErrPrivateKeyGeneration) {
    // Handle private key generation failure
}

if errors.Is(err, lib.ErrCertificateGeneration) {
    // Handle certificate generation failure
}

// SQL errors
if errors.Is(err, lib.ErrUnexpectedNullStringType) {
    // Handle unexpected type in NullString scanning
}
```

## Best Practices

### 1. Network Operations

```go
// Always validate IP addresses before use
host, port, err := lib.SplitHostPort(userInput)
if err != nil {
    return fmt.Errorf("invalid address format: %w", err)
}

// Check for local network access in security-sensitive operations
isLocal, err := lib.DetectLocalNetwork(remoteAddr)
if err != nil {
    return err
}

if !isLocal && requiresLocalAccess {
    return errors.New("operation requires local network access")
}
```

### 2. Cryptography

```go
// Use appropriate key sizes for different purposes
sessionKey := lib.CryptoGetRandomBytes(32)   // 256-bit key
csrfToken := lib.CryptoGetRandomBytes(16)    // 128-bit token

// Generate certificates for development only
if env := lib.EnvGetCurrent(); env == "development" {
    cert, err := lib.GenerateSelfSignedCert()
    if err != nil {
        log.Fatal("Failed to create dev certificate:", err)
    }
    // Use cert for development server
}
```

### 3. Environment Configuration

```go
// Load configuration in order of precedence
env := lib.EnvGetCurrent()
filenames := lib.EnvAwareFilenames(env, "config.json")

config := make(map[string]any)
for _, filename := range filenames {
    // Load each file if it exists
    if data, err := os.ReadFile(filename); err == nil {
        // Parse and merge config
    }
}

// Override with environment variables
lib.EnvOverrideVariables(&config, true)
```

### 4. Database Operations

```go
// Use NullString for optional database fields
type User struct {
    Email     string         `json:"email" db:"email"`
    Bio       lib.NullString `json:"bio" db:"bio"`
    Website   lib.NullString `json:"website" db:"website"`
}

// Handle nullable fields properly
var user User
err := db.QueryRow("SELECT email, bio, website FROM users WHERE id = ?", userID).
    Scan(&user.Email, &user.Bio, &user.Website)
```

## Dependencies

- `github.com/oklog/ulid/v2`: ULID generation
- Standard library: `crypto/*`, `net`, `database/sql`, `log/slog`

## Thread Safety

All functions in the lib package are thread-safe and can be called concurrently from multiple goroutines. The only
exception is map operations which should be synchronized when accessed concurrently.
