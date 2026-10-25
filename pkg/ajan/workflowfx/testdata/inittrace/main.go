// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Command inittrace links jsonschema/v6 and nothing else, so a run with
// GODEBUG=inittrace=1 reports what the package's init costs on its own.
package main

import _ "github.com/santhosh-tekuri/jsonschema/v6"

func main() {}
