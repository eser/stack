export const trimStart = (input: string, chars?: string[]) => {
  if (chars === undefined) {
    return input.trimStart();
  }

  for (let i = 0; i < input.length; i++) {
    if (!chars.includes(input[i])) {
      return input.substring(i);
    }
  }

  return "";
};

export const trimEnd = (input: string, chars?: string[]) => {
  if (chars === undefined) {
    return input.trimEnd();
  }

  for (let i = input.length - 1; i >= 0; i--) {
    if (!chars.includes(input[i])) {
      return input.substring(0, i + 1);
    }
  }

  return "";
};
