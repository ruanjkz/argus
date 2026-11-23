const GREEK_QUESTION_MARK = ";"

export const sanitizeCommand = (input: string): string =>
  input.replace(/[\r\n]+/g, " ").replaceAll(";", GREEK_QUESTION_MARK).trim()

export const isQuitCommand = (command: string): boolean => /^quit(\s|$)/i.test(command)
