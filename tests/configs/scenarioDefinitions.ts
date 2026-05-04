export type AppSource =
  | { type: 'prompt'; prompt: string }
  | { type: 'template'; templateName: string }
  | { type: 'figma'; figmaUrl: string; figmaAppName: string }
  | { type: 'existingApp'; appName: string };