// Server-only node configuration; browsers use the same-origin gateway.
export const hubUrl = config => config.HUBURL || 'http://127.0.0.1:3381';
