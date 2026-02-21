// In-session image cache: messageId → dataURL
// Not persisted across page reloads (intentional — images are large)
export const localImageCache = new Map();
