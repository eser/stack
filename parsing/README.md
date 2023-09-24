# 〰️ [cool/parsing](./)

## Component Information

cool/parsing is a comprehensive parsing library designed to analyze and tokenize
strings. While it includes a lexer component, its capabilities extend beyond
simple lexing, providing a flexible and efficient way to parse strings into
meaningful tokens or an abstract syntax tree.

For further details such as requirements, license information and support guide,
please see [main cool repository](https://github.com/eser/cool).

## Tokenizer (also known as Lexer)

Tokenizer is a crucial component in compilers and interpreters. It reads the
input of raw text and breaks it down into a series of tokens, which are
sequences of characters with a known meaning. The lexer included in cool/parsing
is designed to be both efficient and versatile, making it suitable for a wide
range of input sources.

## Usage and API Reference

### new Tokenizer(tokens)

Tokenizer is a class that can be used to tokenize strings. It is initialized
with a list of tokens.

```js
import { simpleTokens, Tokenizer } from "$cool/parsing/mod.ts";

const lexer = new Tokenizer(simpleTokens);

for (const token of lexer.tokenizeFromString("1 + 2")) {
  console.log(token);
}
```

### Tokenizer.tokenizeFromString(input: string)

Tokenizes the given input string and returns an iterator for the tokens.

```js
import { extendedTokens, Tokenizer } from "$cool/parsing/mod.ts";

const lexer = new Tokenizer(extendedTokens);

const tokens = Array.from(
  lexer.tokenizeFromString("cout << 'hello C++' << endl;"),
);

console.log(tokens);
```

### Tokenizer.tokenize(input: ReadableStream)

Tokenizes the given readable stream and returns an iterator for the tokens.

```js
import { extendedTokens, Tokenizer } from "$cool/parsing/mod.ts";

const response = await fetch("https://deno.land/x/cool@0.7.9/di/mod.ts");

const lexer = new Tokenizer(extendedTokens);

for await (const token of lexer.tokenize(response.body.getReader())) {
  console.log(token);
}
```
