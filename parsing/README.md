# 〰️ [cool/parsing](./)

`cool/parsing` is a comprehensive parsing library designed to analyze and
tokenize strings. While it includes a lexer component, its capabilities extend
beyond simple lexing, providing a flexible and efficient way to parse strings
into meaningful tokens or an abstract syntax tree.

## 🚀 Getting Started with Parsing

Parsing is the process of analyzing a sequence of symbols (usually in the form
of text) to determine its grammatical structure with respect to a given formal
grammar. It's a crucial step in many computer science tasks, from compiling
programming languages to understanding natural language.

### Tokenizer (also known as Lexer)

A tokenizer is a crucial component in compilers and interpreters. It reads the
input of raw text and breaks it down into a series of tokens, which are
sequences of characters with a known meaning. The lexer included in
`cool/parsing` is designed to be both efficient and versatile, making it
suitable for a wide range of input sources.

### Parser

A parser takes the tokens produced by the tokenizer and arranges them in a
structure, often hierarchical, that represents the syntactic meaning of the
tokens in the context of the input. The output of the parser is usually a
tree-like representation of the input, which can be processed further or
translated into another form.

### Abstract Syntax Tree (AST)

Abstract Syntax Tree is a tree representation of the syntactic structure of
source code. Each node in the tree denotes a construct occurring in the source
code. The syntax is 'abstract' in not representing every detail appearing in the
real syntax, but rather just the structural or content-related details. ASTs are
used extensively in compilers and source code analysis tools.

## 🛠 Usage

Here you'll find a list of features provided by `cool/parsing` along with brief
descriptions and usage examples.

### Tokenizing from source

**Basic usage:**

```js
import { simpleTokens, Tokenizer } from "$cool/parsing/mod.ts";

const lexer = new Tokenizer(simpleTokens);

for (const token of lexer.tokenizeFromString("1 + 2")) {
  console.log(token);
}
```

**Using a different token dictionary:**

```js
import { extendedTokens, Tokenizer } from "$cool/parsing/mod.ts";

const lexer = new Tokenizer(extendedTokens);

const tokens = Array.from(
  lexer.tokenizeFromString("cout << 'hello C++' << endl;"),
);

console.log(tokens);
```

**Reading from a ReadableStream:**

```js
import { extendedTokens, Tokenizer } from "$cool/parsing/mod.ts";

const response = await fetch("https://deno.land/x/cool@0.7.13/di/mod.ts");

const lexer = new Tokenizer(extendedTokens);

for await (const token of lexer.tokenize(response.body.getReader())) {
  console.log(token);
}
```

## 📕 API Reference

The following is a list of all available methods and their descriptions.

### Tokenizer

**new Tokenizer(tokens)**\
Tokenizer is a class that can be used to tokenize strings. It is initialized
with a list of tokens.

**Tokenizer.tokenizeFromString(input: string)**\
Tokenizes the given input string and returns an iterator for the tokens.

**Tokenizer.tokenize(input: ReadableStream)**\
Tokenizes the given readable stream and returns an iterator for the tokens.

---

🔗 For further details such as requirements, licensing and support guide, please
visit the [main cool repository](https://github.com/eser/cool).
